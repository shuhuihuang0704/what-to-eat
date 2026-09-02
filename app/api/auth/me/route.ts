import { getSessionUser, runtimeEnv } from "../../../../lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request);
    return Response.json({ user });
  } catch (error) {
    console.error("session lookup failed", error);
    return Response.json({ user: null });
  }
}

export async function DELETE() {
  const { DB } = runtimeEnv();
  await DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()).run();
  return new Response(null, { status: 204 });
}
