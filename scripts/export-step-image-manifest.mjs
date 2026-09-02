import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const [fragment, methodsSource] = await Promise.all([
  readFile(new URL('public/app-fragment.html', root), 'utf8'),
  readFile(new URL('public/verified-recipe-methods.js', root), 'utf8')
]);

const methodsContext = { window:{} };
vm.runInNewContext(methodsSource, methodsContext);
const verifiedMethods = methodsContext.window.XIANCHI_VERIFIED_RECIPE_METHODS;

const coreStart = fragment.indexOf('const recipeChoices = [');
const coreEnd = fragment.indexOf('const dessertRecipeNames', coreStart);
const coreSource = fragment.slice(coreStart, coreEnd).replace('const recipeChoices =', 'recipeChoices =');
const coreContext = {};
vm.runInNewContext(coreSource, coreContext);

const overrideStart = fragment.indexOf('const recipeStepPhotoOverrides = {');
const overrideEnd = fragment.indexOf('const cookingStepPhotoSequenceFor', overrideStart);
const overrideSource = fragment.slice(overrideStart, overrideEnd)
  .replace('const recipeStepPhotoOverrides =', 'recipeStepPhotoOverrides =');
const overrideContext = {};
vm.runInNewContext(overrideSource, overrideContext);

const recipes = [
  ...coreContext.recipeChoices.map(recipe => ({ name:recipe.name, steps:recipe.steps.map(step => step.copy || step.title) })),
  ...Object.entries(verifiedMethods).map(([name, guide]) => ({ name, steps:[...guide.steps] }))
];
const overrides = overrideContext.recipeStepPhotoOverrides;

const inferTool = step => {
  if (/烤箱|烘烤|烤\d|℃烤|水浴烤/.test(step)) return '烤箱＋烤模';
  if (/蒸锅|上锅蒸|大火蒸|中火蒸|隔水蒸/.test(step)) return '蒸锅＋耐热盘';
  if (/料理机|搅打|打成|打碎/.test(step)) return '料理机＋量杯';
  if (/打发|搅打|调成|拌匀|抓匀|腌/.test(step)) return '调味碗＋打蛋器';
  if (/切|去皮|去核|切丝|切片|切块|改刀|斩块|剪口|开背/.test(step)) return '砧板＋厨师刀';
  if (/炸|煎|炒|煸|收汁|回锅|下锅|热油|糖色/.test(step)) return '中式炒锅＋锅铲';
  if (/煮|炖|焖|汤|高汤|煮开|沸水|小火/.test(step)) return '汤锅＋汤勺';
  if (/装盘|摆盘|铺在|倒扣|盛出|上桌/.test(step)) return '餐盘＋汤勺';
  return '真实家用厨具';
};

const conciseLabel = step => {
  const first = step.split(/[；。]/)[0].trim();
  return first.length > 30 ? `${first.slice(0, 30)}…` : first;
};

const manifest = recipes.map((recipe, recipeIndex) => {
  const photos = overrides[recipe.name] || [];
  const verified = photos.length === recipe.steps.length && new Set(photos.map(photo => photo.file)).size === photos.length;
  const id = `r${String(recipeIndex + 1).padStart(3, '0')}`;
  return {
    id,
    name:recipe.name,
    verified,
    steps:recipe.steps.map((step, stepIndex) => ({
      number:stepIndex + 1,
      text:step,
      label:conciseLabel(step),
      tool:inferTool(step),
      file:`/cooking-steps/recipes/${id}/${String(stepIndex + 1).padStart(2, '0')}.webp`
    }))
  };
});

process.stdout.write(`${JSON.stringify(manifest.filter(recipe => !recipe.verified), null, 2)}\n`);
