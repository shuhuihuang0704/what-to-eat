import { getSessionUser, jsonError, runtimeEnv } from "../../../lib/auth";

const AVATARS = new Set(["🌱", "🍳", "🥕", "🍅", "🥑", "🍜", "🧁", "🐼"]);

export async function PATCH(request: Request) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return jsonError("请先登录。", 401);

    const payload = (await request.json()) as { avatar?: string };
    const avatar = typeof payload.avatar === "string" ? payload.avatar : "";
    if (!AVATARS.has(avatar)) return jsonError("请选择一个头像。", 400);
    const cookingLevel = currentUser.cookingLevel || "beginner";

    await runtimeEnv().DB.prepare(
      `UPDATE users
       SET avatar = ?, cooking_level = ?, profile_completed_at = ?
       WHERE id = ?`
    ).bind(avatar, cookingLevel, Date.now(), currentUser.id).run();

    return Response.json({
      user: { ...currentUser, avatar, cookingLevel },
      message: "个人厨房档案已保存。",
    });
  } catch (error) {
    console.error("profile update failed", error);
    return jsonError("个人设置保存失败，请稍后再试。", 500);
  }
}
