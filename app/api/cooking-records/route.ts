import { getSessionUser, jsonError, runtimeEnv } from "../../../lib/auth";
import { loadUserState } from "../../../lib/user-state";

export async function POST(request: Request) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return jsonError("请先登录。", 401);
    const payload = (await request.json()) as { recipeName?: string; note?: string };
    const recipeName = typeof payload.recipeName === "string" ? payload.recipeName.trim().slice(0, 80) : "";
    const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 240) : "";
    if (!recipeName) return jsonError("请选择完成的菜品。", 400);
    const id = crypto.randomUUID();
    await runtimeEnv().DB.prepare(
      "INSERT INTO cooking_records (id, user_id, recipe_name, note, completed_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, currentUser.id, recipeName, note || null, Date.now()).run();
    return Response.json({ id, message: "已经记入最近做过。", state: await loadUserState(currentUser.id) });
  } catch (error) {
    console.error("cooking record create failed", error);
    return jsonError("做菜记录保存失败，请稍后再试。", 500);
  }
}
