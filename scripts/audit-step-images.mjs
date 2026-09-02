import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const fragment = await readFile(new URL('../public/app-fragment.html', import.meta.url), 'utf8');
const methodsSource = await readFile(new URL('../public/verified-recipe-methods.js', import.meta.url), 'utf8');
const generatedOverridesSource = await readFile(new URL('../public/recipe-step-photo-overrides.js', import.meta.url), 'utf8');

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
const generatedOverrideContext = { window:{} };
vm.runInNewContext(generatedOverridesSource, generatedOverrideContext);
const overrideContext = { window:generatedOverrideContext.window };
vm.runInNewContext(overrideSource, overrideContext);

const recipes = [
  ...coreContext.recipeChoices.map(recipe => ({ name:recipe.name, steps:recipe.steps })),
  ...Object.entries(verifiedMethods).map(([name, guide]) => ({ name, steps:guide.steps }))
];
const overrides = {
  ...overrideContext.recipeStepPhotoOverrides,
  ...generatedOverrideContext.window.XIANCHI_RECIPE_STEP_PHOTOS
};
const audit = recipes.map(recipe => {
  const photos = overrides[recipe.name] || [];
  const exactCount = photos.length === recipe.steps.length;
  const distinctCount = new Set(photos.map(photo => photo.file)).size === photos.length;
  return {
    recipe:recipe.name,
    steps:recipe.steps.length,
    dedicated_photos:photos.length,
    status:exactCount && distinctCount ? 'verified_recipe_specific' : 'generic_photos_need_review'
  };
});

const summary = {
  recipes:audit.length,
  steps:audit.reduce((total,item) => total + item.steps, 0),
  verified_recipes:audit.filter(item => item.status === 'verified_recipe_specific').length,
  generic_recipes:audit.filter(item => item.status === 'generic_photos_need_review').length,
  verified_steps:audit.filter(item => item.status === 'verified_recipe_specific').reduce((total,item) => total + item.steps, 0),
  generic_steps:audit.filter(item => item.status === 'generic_photos_need_review').reduce((total,item) => total + item.steps, 0)
};

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify({ summary, audit }, null, 2)}\n`);
} else {
  console.log(summary);
  console.log('\nRecipes still using generic step photos:');
  console.log(audit.filter(item => item.status === 'generic_photos_need_review').map(item => item.recipe).join('、'));
}
