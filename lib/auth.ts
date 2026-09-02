import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB: D1Database;
  BREVO_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
  AUTH_EMAIL_NAME?: string;
  AUTH_CODE_SECRET?: string;
  TEMP_LOGIN_EMAIL?: string;
  TEMP_LOGIN_PASSWORD?: string;
  TEMP_LOGIN_NAME?: string;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  cookingLevel: string | null;
};

const encoder = new TextEncoder();
const SESSION_COOKIE = "what_to_eat_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 100000;

export function runtimeEnv() {
  return env as unknown as RuntimeEnv;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function secureStringEqual(actual: string, expected: string) {
  const [actualHash, expectedHash] = await Promise.all([sha256(actual), sha256(expected)]);
  let mismatch = actualHash.length ^ expectedHash.length;
  for (let index = 0; index < Math.min(actualHash.length, expectedHash.length); index += 1) {
    mismatch |= actualHash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function hashVerificationCode(email: string, code: string) {
  const secret = runtimeEnv().AUTH_CODE_SECRET;
  if (!secret) throw new Error("AUTH_CODE_SECRET is not configured");
  return sha256(`${secret}:${email}:${code}`);
}

export async function hashPassword(password: string, salt?: string, iterations = PASSWORD_ITERATIONS) {
  const saltValue = salt ?? bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(saltValue),
      iterations,
    },
    keyMaterial,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: saltValue, iterations };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  salt: string,
  iterations: number
) {
  const actual = await hashPassword(password, salt, iterations);
  if (actual.hash.length !== expectedHash.length) return false;
  let mismatch = 0;
  for (let index = 0; index < actual.hash.length; index += 1) {
    mismatch |= actual.hash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }
  return mismatch === 0;
}

export function randomVerificationCode() {
  const values = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (values[0] % 900000));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendVerificationEmail(
  email: string,
  code: string,
  name: string,
  purpose: "register" | "reset_password" = "register"
) {
  const {
    BREVO_API_KEY: apiKey,
    AUTH_EMAIL_FROM: from,
    AUTH_EMAIL_NAME: fromName = "What to Eat",
  } = runtimeEnv();
  if (!apiKey || !from) throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");
  const isPasswordReset = purpose === "reset_password";
  const subject = isPasswordReset ? "What to Eat 重置密码验证码" : "What to Eat 注册验证码";
  const actionCopy = isPasswordReset ? "重置账户密码" : "完成邮箱注册";

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: fromName, email: from },
      to: [{ email }],
      subject,
      htmlContent: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:auto;padding:32px;color:#29483a">
          <div style="font-size:14px;color:#4f8062;font-weight:700">WHAT TO EAT</div>
          <h1 style="font-size:24px;margin:14px 0 8px">你好，${escapeHtml(name || "新朋友")}！</h1>
          <p style="line-height:1.7;color:#5f7468">请输入下面的验证码${actionCopy}。验证码 10 分钟内有效，请勿转发给他人。</p>
          <div style="font-size:34px;font-weight:800;letter-spacing:9px;background:#edf6ee;border-radius:16px;padding:20px;text-align:center;margin:24px 0">${code}</div>
          <p style="font-size:13px;color:#819289">如果不是你本人操作，可以忽略这封邮件。</p>
        </div>
      `,
      textContent: `${subject}：${code}。验证码 10 分钟内有效，请勿转发给他人。`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Brevo verification email failed", response.status, detail.slice(0, 500));
    throw new Error("EMAIL_SEND_FAILED");
  }
}

function parseCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  const entry = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : "";
}

export async function createSession(userId: string) {
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const id = await sha256(token);
  const now = Date.now();
  const expiresAt = now + SESSION_MAX_AGE_SECONDS * 1000;
  const { DB } = runtimeEnv();
  await DB.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(id, userId, expiresAt, now).run();

  return {
    token,
    cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  };
}

export async function getSessionUser(request: Request): Promise<PublicUser | null> {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const sessionId = await sha256(token);
  const now = Date.now();
  const row = await runtimeEnv().DB.prepare(
    `SELECT users.id, users.email, users.name, users.avatar,
            users.cooking_level AS cookingLevel
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? AND sessions.expires_at > ?
     LIMIT 1`
  ).bind(sessionId, now).first<PublicUser>();
  return row ?? null;
}

export async function deleteSession(request: Request) {
  const token = parseCookie(request, SESSION_COOKIE);
  if (token) {
    const sessionId = await sha256(token);
    await runtimeEnv().DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
