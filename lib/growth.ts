export type GrowthLevelKey = "beginner" | "apprentice" | "home_cook" | "skilled" | "chef";

export type GrowthLevel = {
  key: GrowthLevelKey;
  title: string;
  copy: string;
  minScore: number;
};

export const GROWTH_LEVELS: GrowthLevel[] = [
  { key: "beginner", title: "厨房小白", copy: "从第一道菜开始，跟着步骤积累经验", minScore: 0 },
  { key: "apprentice", title: "入门学徒", copy: "已经掌握基础操作，开始形成做饭习惯", minScore: 5 },
  { key: "home_cook", title: "家常能手", copy: "可以稳定完成家常菜，也愿意分享作品", minScore: 15 },
  { key: "skilled", title: "厨艺达人", copy: "熟悉多种做法，正在建立自己的拿手菜单", minScore: 35 },
  { key: "chef", title: "厨房大厨", copy: "持续实践与分享，是值得信赖的厨房高手", minScore: 70 },
];

export function calculateGrowth(completedCount: number, workCount: number) {
  const safeCompletedCount = Math.max(0, Math.floor(completedCount));
  const safeWorkCount = Math.max(0, Math.floor(workCount));
  const score = safeCompletedCount + safeWorkCount * 2;
  const level = [...GROWTH_LEVELS].reverse().find((item) => score >= item.minScore) ?? GROWTH_LEVELS[0];
  const levelIndex = GROWTH_LEVELS.findIndex((item) => item.key === level.key);
  const nextLevel = GROWTH_LEVELS[levelIndex + 1] ?? null;
  const progressPercent = nextLevel
    ? Math.max(0, Math.min(100, Math.round(((score - level.minScore) / (nextLevel.minScore - level.minScore)) * 100)))
    : 100;

  return {
    score,
    completedCount: safeCompletedCount,
    workCount: safeWorkCount,
    level,
    nextLevel,
    pointsToNext: nextLevel ? Math.max(0, nextLevel.minScore - score) : 0,
    progressPercent,
  };
}

function cappedProgress(value: number, target: number, unit: string) {
  const current = Math.min(Math.max(0, value), target);
  return `${current} / ${target} ${unit}`;
}

export function calculateBadges(input: {
  completedCount: number;
  workCount: number;
  weeklyCompletedCount: number;
  cookingStreak: number;
}) {
  const { completedCount, workCount, weeklyCompletedCount, cookingStreak } = input;
  return [
    { title: "第一次下厨", state: completedCount >= 1 ? "unlocked" : "locked", progress: cappedProgress(completedCount, 1, "道") },
    { title: "清空冰箱", state: "locked", progress: "0 / 3 种临期食材" },
    { title: "连续做饭", state: cookingStreak >= 3 ? "unlocked" : "locked", progress: cappedProgress(cookingStreak, 3, "天") },
    { title: "本周五道菜", state: weeklyCompletedCount >= 5 ? "unlocked" : "locked", progress: cappedProgress(weeklyCompletedCount, 5, "道") },
    { title: "零浪费一周", state: "locked", progress: "0 / 7 天" },
    { title: "美食记录家", state: workCount >= 10 ? "unlocked" : "locked", progress: cappedProgress(workCount, 10, "次") },
    { title: "五彩餐桌", state: "locked", progress: "0 / 5 色" },
    { title: "30分钟达人", state: completedCount >= 10 ? "unlocked" : "locked", progress: cappedProgress(completedCount, 10, "道") },
    { title: "一锅端高手", state: "locked", progress: "0 / 5 道" },
    { title: "风味探险家", state: "locked", progress: "0 / 8 种" },
    { title: "百菜大厨", state: completedCount >= 100 ? "unlocked" : "locked", progress: cappedProgress(completedCount, 100, "道") },
    { title: "厨友之星", state: "locked", progress: "0 / 100 个赞" },
  ] as const;
}
