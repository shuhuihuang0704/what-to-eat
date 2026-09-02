import { deleteSession } from "../../../../lib/auth";

export async function POST(request: Request) {
  const cookie = await deleteSession(request);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
