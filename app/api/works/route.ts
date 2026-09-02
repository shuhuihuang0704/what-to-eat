import { getSessionUser, jsonError, runtimeEnv } from "../../../lib/auth";
import { loadUserState } from "../../../lib/user-state";

export async function POST(request: Request) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return jsonError("请先登录。", 401);
    const payload = (await request.json()) as { recipeName?: string; caption?: string; hasPhoto?: boolean };
    const recipeName = typeof payload.recipeName === "string" ? payload.recipeName.trim().slice(0, 80) : "";
    const caption = typeof payload.caption === "string" ? payload.caption.trim().slice(0, 500) : "";
    if (!recipeName || !caption) return jsonError("请填写菜品和作品心得。", 400);
    const id = crypto.randomUUID();
    await runtimeEnv().DB.prepare(
      "INSERT INTO works (id, user_id, recipe_name, caption, has_photo, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, currentUser.id, recipeName, caption, payload.hasPhoto ? 1 : 0, Date.now()).run();
    return Response.json({ id, message: "作品已经发布。", state: await loadUserState(currentUser.id) });
  } catch (error) {
    console.error("work create failed", error);
    return jsonError("作品发布失败，请稍后再试。", 500);
  }
}
