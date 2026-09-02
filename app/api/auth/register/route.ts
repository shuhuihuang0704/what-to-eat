import {
  hashPassword,
  hashVerificationCode,
  isValidEmail,
  jsonError,
  normalizeEmail,
  runtimeEnv,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      code?: string;
    };
    const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 40) : "";
    const email = normalizeEmail(payload.email);
    const password = typeof payload.password === "string" ? payload.password : "";
    const code = typeof payload.code === "string" ? payload.code.trim() : "";

    if (!name) return jsonError("请填写昵称。", 400);
    if (!isValidEmail(email)) return jsonError("请输入有效的邮箱地址。", 400);
    if (password.length < 8 || password.length > 128) return jsonError("密码需要 8–128 位。", 400);
    if (!/^\d{6}$/.test(code)) return jsonError("请输入 6 位邮箱验证码。", 400);

    const { DB } = runtimeEnv();
    const existing = await DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first();
    if (existing) return jsonError("该邮箱已经注册，请直接登录。", 409);

    const verification = await DB.prepare(
      `SELECT id, code_hash AS codeHash, expires_at AS expiresAt, attempts
       FROM verification_codes
       WHERE email = ? AND purpose = 'register' AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`
    ).bind(email).first<{ id: string; codeHash: string; expiresAt: number; attempts: number }>();
    if (!verification) return jsonError("请先获取邮箱验证码。", 400);
    if (verification.expiresAt <= Date.now()) return jsonError("验证码已过期，请重新获取。", 400);
    if (verification.attempts >= 5) return jsonError("验证码尝试次数过多，请重新获取。", 429);

    const submittedHash = await hashVerificationCode(email, code);
    if (submittedHash !== verification.codeHash) {
      await DB.prepare("UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?")
        .bind(verification.id).run();
      return jsonError("验证码不正确，请重新输入。", 400);
    }

    const passwordResult = await hashPassword(password);
    const now = Date.now();
    const userId = crypto.randomUUID();
    await DB.batch([
      DB.prepare(
        `INSERT INTO users
         (id, email, name, password_hash, password_salt, password_iterations, email_verified_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        userId,
        email,
        name,
        passwordResult.hash,
        passwordResult.salt,
        passwordResult.iterations,
        now,
        now
      ),
      DB.prepare("UPDATE verification_codes SET consumed_at = ? WHERE id = ?").bind(now, verification.id),
    ]);

    return Response.json({ ok: true, message: "注册成功，请使用邮箱和密码登录。" }, { status: 201 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    if (detail.includes("UNIQUE constraint failed")) return jsonError("该邮箱已经注册，请直接登录。", 409);
    console.error("registration failed", error);
    return jsonError("注册暂时失败，请稍后再试。", 500);
  }
}
