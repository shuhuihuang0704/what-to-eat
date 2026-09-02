import { getSessionUser, jsonError, runtimeEnv } from "../../../lib/auth";
import { loadUserState } from "../../../lib/user-state";

const STORAGES = new Set(["cold", "freeze", "room"]);
const FOOD_STATES = new Set(["whole", "opened", "cut", "cooked"]);
const parseQuantity = (value: string) => {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(\s*)(.*)$/u);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? { amount, gap: match[2], unit: match[3] } : null;
};
const formatAmount = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/,"").replace(/\.$/,"");

export async function POST(request: Request) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return jsonError("请先登录。", 401);
    const payload = (await request.json()) as Record<string, unknown>;
    const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 60) : "";
    const icon = typeof payload.icon === "string" ? payload.icon.slice(0, 8) : "🥗";
    const quantity = typeof payload.quantity === "string" ? payload.quantity.trim().slice(0, 40) : "";
    const storage = typeof payload.storage === "string" ? payload.storage : "";
    const foodState = typeof payload.foodState === "string" ? payload.foodState : "";
    const stateDate = Number(payload.stateDate);
    const expiresAt = Number(payload.expiresAt);
    const price = Number(payload.price);
    if (!name || !quantity || !STORAGES.has(storage) || !FOOD_STATES.has(foodState)) {
      return jsonError("请完整填写食材信息。", 400);
    }
    if (![stateDate, expiresAt, price].every(Number.isFinite) || price < 0 || expiresAt < stateDate) {
      return jsonError("食材日期或金额不正确。", 400);
    }

    const now = Date.now();
    await runtimeEnv().DB.prepare(
      `INSERT INTO fridge_items
       (id, user_id, name, icon, quantity, storage, food_state, state_date, expires_at, price_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), currentUser.id, name, icon, quantity, storage, foodState,
      Math.floor(stateDate), Math.floor(expiresAt), Math.round(price * 100), now
    ).run();
    return Response.json({ message: `${name}已加入你的冰箱。`, state: await loadUserState(currentUser.id) });
  } catch (error) {
    console.error("fridge item create failed", error);
    return jsonError("食材保存失败，请稍后再试。", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return jsonError("请先登录。", 401);
    const payload = (await request.json()) as { id?: string; amount?: number };
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    if (!id) return jsonError("请选择要删除的食材。", 400);

    const item = await runtimeEnv().DB.prepare(
      "SELECT name, quantity, price_cents FROM fridge_items WHERE id = ? AND user_id = ? LIMIT 1"
    ).bind(id, currentUser.id).first<{ name: string; quantity: string; price_cents: number }>();
    if (!item) return jsonError("这条食材不存在或已被删除。", 404);

    const quantity = parseQuantity(item.quantity);
    const requestedAmount = payload.amount === undefined ? null : Number(payload.amount);
    if (requestedAmount !== null && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) {
      return jsonError("请输入正确的删除数量。", 400);
    }
    if (quantity && requestedAmount !== null && requestedAmount > quantity.amount) {
      return jsonError(`最多只能删除${formatAmount(quantity.amount)}${quantity.unit}。`, 400);
    }
    if (quantity && requestedAmount !== null && requestedAmount < quantity.amount) {
      const remainingAmount = quantity.amount - requestedAmount;
      const remainingQuantity = `${formatAmount(remainingAmount)}${quantity.gap}${quantity.unit}`;
      const remainingPriceCents = Math.max(0,Math.round(item.price_cents * (remainingAmount / quantity.amount)));
      await runtimeEnv().DB.prepare(
        "UPDATE fridge_items SET quantity = ?, price_cents = ? WHERE id = ? AND user_id = ?"
      ).bind(remainingQuantity, remainingPriceCents, id, currentUser.id).run();
      return Response.json({
        message: `${item.name}已减少${formatAmount(requestedAmount)}${quantity.unit}`,
        removedCompletely: false,
        state: await loadUserState(currentUser.id)
      });
    }

    const result = await runtimeEnv().DB.prepare(
      "DELETE FROM fridge_items WHERE id = ? AND user_id = ?"
    ).bind(id, currentUser.id).run();
    if (!result.meta.changes) return jsonError("这条食材不存在或已被删除。", 404);

    return Response.json({ message: "食材已从冰箱删除。", removedCompletely: true, state: await loadUserState(currentUser.id) });
  } catch (error) {
    console.error("fridge item delete failed", error);
    return jsonError("食材删除失败，请稍后再试。", 500);
  }
}
