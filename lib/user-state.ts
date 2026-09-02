import { calculateBadges, calculateGrowth } from "./growth";
import { runtimeEnv } from "./auth";

type CountRow = { total: number };
type FridgeRow = {
  id: string;
  name: string;
  icon: string;
  quantity: string;
  storage: string;
  foodState: string;
  stateDate: number;
  expiresAt: number;
  priceCents: number;
  createdAt: number;
};
type CookingRow = { id: string; recipeName: string; note: string | null; completedAt: number };
type WorkRow = { id: string; recipeName: string; caption: string; hasPhoto: number; createdAt: number };

function startOfCurrentWeek(now: number) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.getTime();
}

function cookingStreak(completedAtValues: number[]) {
  const days = new Set(completedAtValues.map((value) => new Date(value).toISOString().slice(0, 10)));
  let cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function loadUserState(userId: string) {
  const { DB } = runtimeEnv();
  const now = Date.now();
  const weekStart = startOfCurrentWeek(now);
  const [fridgeResult, historyResult, worksResult, completedRow, workRow, weeklyRow, dateResult] = await Promise.all([
    DB.prepare(
      `SELECT id, name, icon, quantity, storage, food_state AS foodState,
              state_date AS stateDate, expires_at AS expiresAt,
              price_cents AS priceCents, created_at AS createdAt
       FROM fridge_items WHERE user_id = ? ORDER BY expires_at ASC, created_at DESC`
    ).bind(userId).all<FridgeRow>(),
    DB.prepare(
      `SELECT id, recipe_name AS recipeName, note, completed_at AS completedAt
       FROM cooking_records WHERE user_id = ? ORDER BY completed_at DESC LIMIT 20`
    ).bind(userId).all<CookingRow>(),
    DB.prepare(
      `SELECT id, recipe_name AS recipeName, caption, has_photo AS hasPhoto, created_at AS createdAt
       FROM works WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    ).bind(userId).all<WorkRow>(),
    DB.prepare("SELECT COUNT(*) AS total FROM cooking_records WHERE user_id = ?").bind(userId).first<CountRow>(),
    DB.prepare("SELECT COUNT(*) AS total FROM works WHERE user_id = ?").bind(userId).first<CountRow>(),
    DB.prepare("SELECT COUNT(*) AS total FROM cooking_records WHERE user_id = ? AND completed_at >= ?")
      .bind(userId, weekStart).first<CountRow>(),
    DB.prepare("SELECT completed_at AS completedAt FROM cooking_records WHERE user_id = ? ORDER BY completed_at DESC LIMIT 120")
      .bind(userId).all<{ completedAt: number }>(),
  ]);

  const completedCount = Number(completedRow?.total ?? 0);
  const workCount = Number(workRow?.total ?? 0);
  const weeklyCompletedCount = Number(weeklyRow?.total ?? 0);
  const streak = cookingStreak(dateResult.results.map((row: { completedAt: number }) => row.completedAt));
  const growth = calculateGrowth(completedCount, workCount);
  const badges = calculateBadges({ completedCount, workCount, weeklyCompletedCount, cookingStreak: streak });

  await DB.prepare("UPDATE users SET cooking_level = ? WHERE id = ? AND (cooking_level IS NULL OR cooking_level != ?)")
    .bind(growth.level.key, userId, growth.level.key).run();

  return {
    fridgeItems: fridgeResult.results.map((row: FridgeRow) => ({
      ...row,
      price: row.priceCents / 100,
      daysRemaining: Math.max(0, Math.ceil((row.expiresAt - now) / 86_400_000)),
    })),
    cookingRecords: historyResult.results,
    works: worksResult.results.map((row: WorkRow) => ({ ...row, hasPhoto: Boolean(row.hasPhoto) })),
    stats: { completedCount, workCount, wasteSaved: 0, weeklyCompletedCount, cookingStreak: streak },
    growth,
    badges,
  };
}
