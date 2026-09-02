import {
  hashVerificationCode,
  isValidEmail,
  jsonError,
  normalizeEmail,
  randomVerificationCode,
  runtimeEnv,
  sendVerificationEmail,
} from "../../../../../lib/auth";

const GENERIC_SUCCESS = "如果该邮箱已经注册，验证码已发送，请检查邮箱。";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { email?: string };
    const email = normalizeEmail(payload.email);
    if (!isValidEmail(email)) return jsonError("请输入有效的邮箱地址。", 400);

    const { DB } = runtimeEnv();
    const user = await DB.prepare("SELECT id, name FROM users WHERE email = ? LIMIT 1")
      .bind(email)
      .first<{ id: string; name: string }>();
    if (!user) return Response.json({ ok: true, message: GENERIC_SUCCESS });

    const now = Date.now();
    const latest = await DB.prepare(
      "SELECT created_at AS createdAt FROM verification_codes WHERE email = ? AND purpose = 'reset_password' ORDER BY created_at DESC LIMIT 1"
    ).bind(email).first<{ createdAt: number }>();
    if (latest && now - latest.createdAt < 60000) {
      return jsonError("验证码发送得太频繁，请稍后再试。", 429);
    }

    const count = await DB.prepare(
      "SELECT COUNT(*) AS total FROM verification_codes WHERE email = ? AND purpose = 'reset_password' AND created_at > ?"
    ).bind(email, now - 60 * 60 * 1000).first<{ total: number }>();
    if ((count?.total ?? 0) >= 5) return jsonError("发送次数过多，请一小时后再试。", 429);

    const code = randomVerificationCode();
    const codeHash = await hashVerificationCode(email, code);
    await sendVerificationEmail(email, code, user.name, "reset_password");
    await DB.prepare(
      "INSERT INTO verification_codes (id, email, purpose, code_hash, expires_at, consumed_at, attempts, created_at) VALUES (?, ?, 'reset_password', ?, ?, NULL, 0, ?)"
    ).bind(crypto.randomUUID(), email, codeHash, now + 10 * 60 * 1000, now).run();

    return Response.json({ ok: true, message: GENERIC_SUCCESS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "EMAIL_SERVICE_NOT_CONFIGURED") {
      return jsonError("邮件服务正在配置中，请稍后再试。", 503);
    }
    if (message === "EMAIL_SEND_FAILED") return jsonError("验证码邮件发送失败，请稍后重试。", 502);
    console.error("forgot-password send-code failed", error);
    return jsonError("暂时无法发送验证码，请稍后再试。", 500);
  }
}
