import { getSessionUser, jsonError } from "../../../lib/auth";
import { loadUserState } from "../../../lib/user-state";

export async function GET(request: Request) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return jsonError("请先登录。", 401);
    const state = await loadUserState(currentUser.id);
    return Response.json({
      user: { ...currentUser, cookingLevel: state.growth.level.key },
      ...state,
    });
  } catch (error) {
    console.error("app state load failed", error);
    return jsonError("个人厨房数据加载失败，请稍后再试。", 500);
  }
}
