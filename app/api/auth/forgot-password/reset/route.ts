import {
  hashPassword,
  hashVerificationCode,
  isValidEmail,
  jsonError,
  normalizeEmail,
  runtimeEnv,
} from "../../../../../lib/auth";

const INVALID_CODE_MESSAGE = "验证码无效或已过期，请重新获取。";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { email?: string; code?: string; password?: string };
    const email = normalizeEmail(payload.email);
    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    const password = typeof payload.password === "string" ? payload.password : "";

    if (!isValidEmail(email)) return jsonError("请输入有效的邮箱地址。", 400);
    if (!/^\d{6}$/.test(code)) return jsonError("请输入 6 位邮箱验证码。", 400);
    if (password.length < 8 || password.length > 128) return jsonError("新密码需要 8–128 位。", 400);

    const { DB } = runtimeEnv();
    const user = await DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
      .bind(email)
      .first<{ id: string }>();
    if (!user) return jsonError(INVALID_CODE_MESSAGE, 400);

    const verification = await DB.prepare(
      `SELECT id, code_hash AS codeHash, expires_at AS expiresAt, attempts
       FROM verification_codes
       WHERE email = ? AND purpose = 'reset_password' AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`
    ).bind(email).first<{ id: string; codeHash: string; expiresAt: number; attempts: number }>();
    if (!verification || verification.expiresAt <= Date.now()) {
      return jsonError(INVALID_CODE_MESSAGE, 400);
    }
    if (verification.attempts >= 5) return jsonError("验证码尝试次数过多，请重新获取。", 429);

    const submittedHash = await hashVerificationCode(email, code);
    if (submittedHash !== verification.codeHash) {
      await DB.prepare("UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?")
        .bind(verification.id)
        .run();
      return jsonError("验证码不正确，请重新输入。", 400);
    }

    const passwordResult = await hashPassword(password);
    const now = Date.now();
    await DB.batch([
      DB.prepare(
        "UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?"
      ).bind(passwordResult.hash, passwordResult.salt, passwordResult.iterations, user.id),
      DB.prepare(
        "UPDATE verification_codes SET consumed_at = ? WHERE email = ? AND purpose = 'reset_password' AND consumed_at IS NULL"
      ).bind(now, email),
      DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    ]);

    return Response.json({ ok: true, message: "密码已重置，请使用新密码登录。" });
  } catch (error) {
    console.error("forgot-password reset failed", error);
    return jsonError("密码重置暂时失败，请稍后再试。", 500);
  }
}
