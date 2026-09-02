import {
  createSession,
  hashPassword,
  isValidEmail,
  jsonError,
  normalizeEmail,
  runtimeEnv,
  secureStringEqual,
  verifyPassword,
} from "../../../../lib/auth";

type UserRow = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  cookingLevel: string | null;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { email?: string; password?: string };
    const email = normalizeEmail(payload.email);
    const password = typeof payload.password === "string" ? payload.password : "";
    if (!isValidEmail(email) || !password) return jsonError("请输入邮箱和密码。", 400);

    const { DB, TEMP_LOGIN_EMAIL, TEMP_LOGIN_PASSWORD, TEMP_LOGIN_NAME } = runtimeEnv();
    let row = await DB.prepare(
      `SELECT id, email, name, avatar, cooking_level AS cookingLevel,
              password_hash AS passwordHash, password_salt AS passwordSalt,
              password_iterations AS passwordIterations
       FROM users WHERE email = ? LIMIT 1`
    ).bind(email).first<UserRow>();

    if (!row) {
      const temporaryEmail = normalizeEmail(TEMP_LOGIN_EMAIL);
      const canBootstrapTemporaryAccount = Boolean(
        temporaryEmail &&
        email === temporaryEmail &&
        TEMP_LOGIN_PASSWORD &&
        TEMP_LOGIN_PASSWORD.length >= 8 &&
        await secureStringEqual(password, TEMP_LOGIN_PASSWORD)
      );
      if (!canBootstrapTemporaryAccount || !TEMP_LOGIN_PASSWORD) {
        return jsonError("邮箱或密码不正确。", 401);
      }

      const passwordResult = await hashPassword(TEMP_LOGIN_PASSWORD);
      const now = Date.now();
      row = {
        id: crypto.randomUUID(),
        email: temporaryEmail,
        name: TEMP_LOGIN_NAME?.trim().slice(0, 40) || "测试用户",
        avatar: null,
        cookingLevel: null,
        passwordHash: passwordResult.hash,
        passwordSalt: passwordResult.salt,
        passwordIterations: passwordResult.iterations,
      };
      await DB.prepare(
        `INSERT INTO users
         (id, email, name, password_hash, password_salt, password_iterations, email_verified_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        row.id,
        row.email,
        row.name,
        row.passwordHash,
        row.passwordSalt,
        row.passwordIterations,
        now,
        now
      ).run();
    }

    const valid = await verifyPassword(password, row.passwordHash, row.passwordSalt, row.passwordIterations);
    if (!valid) return jsonError("邮箱或密码不正确。", 401);

    const session = await createSession(row.id);
    return Response.json(
      {
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          avatar: row.avatar,
          cookingLevel: row.cookingLevel,
        },
      },
      { headers: { "Set-Cookie": session.cookie } }
    );
  } catch (error) {
    console.error("login failed", error);
    return jsonError("登录暂时失败，请稍后再试。", 500);
  }
}
