import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);

async function loadWorker(label) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${label}-${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const assets = { fetch: async () => new Response("Not found", { status: 404 }) };
const executionContext = { waitUntil() {}, passThroughOnException() {} };

test("renders the What to Eat app shell", async () => {
  const worker = await loadWorker("shell");

  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: assets },
    executionContext,
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>What to Eat<\/title>/i);
  assert.match(html, /src="\/app-fragment\.html"/i);
});

test("login binds each password check to the submitted email", async () => {
  const [loginRoute, authHelpers] = await Promise.all([
    readFile(new URL("app/api/auth/login/route.ts", root), "utf8"),
    readFile(new URL("lib/auth.ts", root), "utf8"),
  ]);
  assert.match(loginRoute, /FROM users WHERE email = \? LIMIT 1/);
  assert.match(loginRoute, /\.bind\(email\)\.first<UserRow>\(\)/);
  assert.match(
    loginRoute,
    /verifyPassword\(password, row\.passwordHash, row\.passwordSalt, row\.passwordIterations\)/,
  );
  assert.match(loginRoute, /if \(!valid\) return jsonError\("邮箱或密码不正确。", 401\)/);
  assert.match(loginRoute, /TEMP_LOGIN_EMAIL/);
  assert.match(loginRoute, /secureStringEqual\(password, TEMP_LOGIN_PASSWORD\)/);
  assert.match(loginRoute, /INSERT INTO users/);
  assert.match(authHelpers, /const PASSWORD_ITERATIONS = 100000;/);
  assert.doesNotMatch(authHelpers, /const PASSWORD_ITERATIONS = 120000;/);
  assert.ok(
    loginRoute.indexOf("if (!valid)") < loginRoute.indexOf("createSession(row.id)"),
    "a session must only be created after the password is verified",
  );
});

test("registration requires an emailed six-digit code", async () => {
  const [fragment, registerRoute, sendCodeRoute] = await Promise.all([
    readFile(new URL("public/app-fragment.html", root), "utf8"),
    readFile(new URL("app/api/auth/register/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/send-code/route.ts", root), "utf8"),
  ]);
  assert.match(fragment, /id="xc-register-code"/);
  assert.match(fragment, /id="xc-send-code"/);
  assert.match(fragment, /\/api\/auth\/send-code/);
  assert.match(fragment, /\/api\/auth\/register/);
  assert.match(registerRoute, /注册成功，请使用邮箱和密码登录/);
  assert.match(registerRoute, /该邮箱已经注册，请直接登录。", 409/);
  assert.match(sendCodeRoute, /该邮箱已经注册，请直接登录。", 409/);
  assert.match(fragment, /error\.status = response\.status/);
  assert.match(fragment, /moveRegisteredEmailToLogin\(error, email\)/);
  assert.match(fragment, /该邮箱已经注册，请输入密码登录。/);
  assert.doesNotMatch(fragment, /demo@xianchi\.app/);
});

test("forgot password verifies email ownership and invalidates old sessions", async () => {
  const [fragment, sendCodeRoute, resetRoute] = await Promise.all([
    readFile(new URL("public/app-fragment.html", root), "utf8"),
    readFile(new URL("app/api/auth/forgot-password/send-code/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/forgot-password/reset/route.ts", root), "utf8"),
  ]);
  assert.match(fragment, /id="xc-forgot-password"/);
  assert.match(fragment, /id="xc-reset-account"/);
  assert.match(fragment, /id="xc-reset-code"/);
  assert.match(fragment, /id="xc-reset-password"/);
  assert.match(fragment, /\/api\/auth\/forgot-password\/send-code/);
  assert.match(fragment, /\/api\/auth\/forgot-password\/reset/);
  assert.match(sendCodeRoute, /purpose = 'reset_password'/);
  assert.match(sendCodeRoute, /sendVerificationEmail\(email, code, user\.name, "reset_password"\)/);
  assert.match(resetRoute, /WHERE email = \? AND purpose = 'reset_password' AND consumed_at IS NULL/);
  assert.match(resetRoute, /hashPassword\(password\)/);
  assert.match(resetRoute, /UPDATE users SET password_hash = \?, password_salt = \?, password_iterations = \?/);
  assert.match(resetRoute, /DELETE FROM sessions WHERE user_id = \?/);
});

test("profile onboarding starts empty and cooking level grows automatically", async () => {
  const [fragment, profileRoute, authHelpers, growthSource, stateSource] = await Promise.all([
    readFile(new URL("public/app-fragment.html", root), "utf8"),
    readFile(new URL("app/api/profile/route.ts", root), "utf8"),
    readFile(new URL("lib/auth.ts", root), "utf8"),
    readFile(new URL("lib/growth.ts", root), "utf8"),
    readFile(new URL("lib/user-state.ts", root), "utf8"),
  ]);
  const badgeMarkup = fragment.slice(
    fragment.indexOf('<div class="xc-badge-book">'),
    fragment.indexOf('<div class="xc-section-head"><h2>最近做过</h2>'),
  );
  assert.match(fragment, /id="xc-profile-setup"/);
  assert.match(fragment, /data-avatar="🌱"/);
  assert.match(fragment, /从厨房小白开始/);
  assert.match(fragment, /完成一道菜 \+1 成长值，发布一个作品 \+2 成长值/);
  assert.doesNotMatch(fragment, /data-cooking-level=/);
  assert.match(fragment, /requestJson\('\/api\/profile'/);
  assert.match(fragment, /requestJson\('\/api\/app-state'/);
  assert.match(fragment, /requestJson\('\/api\/cooking-records'/);
  assert.match(fragment, /requestJson\('\/api\/works'/);
  assert.match(fragment, /requestJson\('\/api\/fridge'/);
  assert.match(fragment, /id="xc-completed-count">0</);
  assert.match(fragment, /id="xc-work-count">0</);
  assert.match(fragment, /id="xc-all-badges">0 \/ 12 已解锁/);
  assert.match(fragment, /还没有做菜记录/);
  assert.match(fragment, /id="xc-fridge-summary">0 种食材 · 0 种临期/);
  assert.match(fragment, /aria-label="全部成就徽章"/);
  assert.match(fragment, /徽章收藏册/);
  assert.match(fragment, /点击徽章查看获得方式/);
  assert.match(fragment, /grid-template-columns:repeat\(4,1fr\)/);
  assert.match(fragment, /data-badge-title="第一次下厨"/);
  assert.match(fragment, /data-requirement="完成第一道菜谱跟做，并记录为做过。"/);
  assert.match(fragment, /data-progress="未解锁 · 0 \/ 5 道"/);
  assert.match(fragment, /root\.querySelectorAll\('\.xc-badge'\)/);
  assert.match(fragment, /获得方式：\$\{badge\.dataset\.requirement\}/);
  assert.match(fragment, /当前进度：\$\{badge\.dataset\.progress\}/);
  assert.match(badgeMarkup, /data-badge-state="locked"/);
  assert.doesNotMatch(badgeMarkup, /data-badge-state="unlocked"/);
  assert.doesNotMatch(badgeMarkup, /data-badge-state="progress"/);
  assert.match(fragment, /百菜大厨/);
  assert.match(fragment, /class="xc-comment-preview"/);
  assert.match(fragment, /还有 9 条做菜心得/);
  assert.match(fragment, /document\.createTextNode\(commentText\)/);
  assert.match(fragment, /const inferRecipePhotoIndex = recipe =>/);
  assert.match(fragment, /const visualIndex = recipe\.generated \? inferRecipePhotoIndex\(recipe\) : index/);
  assert.match(fragment, /同类菜品实拍参考/);
  assert.match(fragment, /\/recipe-detail\/recipe-\$\{String\(visualIndex\)\.padStart\(3,'0'\)\}\.webp/);
  assert.match(fragment, /const ingredientIconFor = ingredient =>/);
  assert.match(fragment, /const ingredientNameFor = label =>/);
  assert.match(fragment, /const ingredientLabelFor = ingredient =>/);
  assert.match(fragment, /label\.textContent = ingredientLabelFor\(ingredientNameFor\(name\)\)/);
  assert.match(fragment, /牛奶\|鲜奶\|酸奶/);
  assert.match(fragment, /面包\|吐司\|法棍/);
  assert.match(fragment, /花生\|腰果\|杏仁\|坚果/);
  assert.match(fragment, /木耳\|蘑菇\|口蘑/);
  assert.match(fragment, /\[\/牛奶\|鲜奶\/,'🥛 牛奶','200ml'\]/);
  assert.match(fragment, /\[\/面包\|吐司\/,'🍞 面包','2片'\]/);
  assert.doesNotMatch(fragment, /牛肉\|牛腩\|牛柳\|牛\//);
  assert.doesNotMatch(fragment, /tokens\.map\(token => \[ingredientLabelFor\(token\),'200g'\]\)/);
  assert.doesNotMatch(fragment, /tokens\.map\(token => \[`🥬 \$\{token\}`/);
  assert.match(fragment, /data-expiry-group="urgent"/);
  assert.match(fragment, /data-expiry-group="fresh"/);
  assert.match(fragment, /临期优先/);
  assert.match(fragment, /状态良好/);
  assert.match(fragment, /refreshFridgeGroups\(\)/);
  assert.match(fragment, /id="xc-food-state"/);
  assert.match(fragment, /id="xc-food-state-date"/);
  assert.match(fragment, /openedCold:2/);
  assert.match(fragment, /recommendedDays = profile\.openedCold/);
  assert.match(fragment, /≤4°C 冷藏的谨慎规则估算/);
  assert.match(fragment, /class="xc-community-grid"/);
  assert.match(fragment, /\.xc-community-grid \{ columns:2/);
  assert.match(fragment, /日式咖喱饭真实照片/);
  assert.match(fragment, /蒜香黄油虾仁真实照片/);
  assert.match(fragment, /verified-recipe-methods\.js/);
  assert.match(fragment, /const verifiedRecipeMethods = window\.XIANCHI_VERIFIED_RECIPE_METHODS \|\| \{\}/);
  assert.match(fragment, /longMiddlePhases\.slice\(0,guide\.steps\.length - 2\),'完成'/);
  assert.match(fragment, /暂未收录可靠做法/);
  assert.match(fragment, /'西红柿炒鸡蛋':'番茄滑蛋'/);
  assert.match(fragment, /'羊蝎子':\['羊蝎子','清炖羊蝎子','羊蝎子火锅'\]/);
  assert.match(fragment, /暂未找到.*可靠搭配/);
  assert.doesNotMatch(fragment, /const generatedNames = \[`\$\{combined\}家常小炒`/);
  assert.doesNotMatch(fragment, /recipeChoices\.push\(buildGeneratedRecipe\(query\)\)/);
  assert.doesNotMatch(fragment, /aria-label="米粒做的日式咖喱饭">🍛/);
  assert.match(fragment, /userPostPhoto\.hidden = !publishHasPhoto/);
  assert.match(fragment, /id="xc-skip-photo">跳过拍照，不分享了/);
  assert.match(fragment, /已取消本次分享，不会发布作品/);
  assert.doesNotMatch(fragment, /未添加照片 · 仍然可以发布文字作品/);
  assert.doesNotMatch(fragment, /已跳过拍照，可以直接写心得/);
  assert.match(fragment, /aria-label="作品心得（选填）"/);
  assert.match(fragment, /id="xc-skip-caption"[^>]*>跳过写心得，直接发布/);
  assert.match(fragment, /root\.querySelector\('#xc-publish-now'\)\.click\(\)/);
  assert.match(fragment, /\.value\.trim\(\) \|\| '今天也认真做饭啦！'/);
  assert.match(profileRoute, /getSessionUser\(request\)/);
  assert.match(profileRoute, /if \(!currentUser\) return jsonError\("请先登录。", 401\)/);
  assert.match(profileRoute, /SET avatar = \?, cooking_level = \?, profile_completed_at = \?/);
  assert.match(profileRoute, /WHERE id = \?/);
  assert.match(authHelpers, /users\.cooking_level AS cookingLevel/);
  assert.match(growthSource, /const score = safeCompletedCount \+ safeWorkCount \* 2/);
  assert.match(growthSource, /title: "厨房小白".*minScore: 0/);
  assert.match(growthSource, /title: "入门学徒".*minScore: 5/);
  assert.match(growthSource, /title: "家常能手".*minScore: 15/);
  assert.match(growthSource, /title: "厨艺达人".*minScore: 35/);
  assert.match(growthSource, /title: "厨房大厨".*minScore: 70/);
  assert.match(stateSource, /UPDATE users SET cooking_level = \? WHERE id = \?/);
});

test("fridge, cooking records, and works are isolated by the signed-in user", async () => {
  const [fragment, schema, stateSource, fridgeRoute, cookingRoute, worksRoute] = await Promise.all([
    readFile(new URL("public/app-fragment.html", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("lib/user-state.ts", root), "utf8"),
    readFile(new URL("app/api/fridge/route.ts", root), "utf8"),
    readFile(new URL("app/api/cooking-records/route.ts", root), "utf8"),
    readFile(new URL("app/api/works/route.ts", root), "utf8"),
  ]);
  assert.match(schema, /"fridge_items"/);
  assert.match(schema, /"cooking_records"/);
  assert.match(schema, /"works"/);
  assert.match(stateSource, /FROM fridge_items WHERE user_id = \?/);
  assert.match(stateSource, /FROM cooking_records WHERE user_id = \?/);
  assert.match(stateSource, /FROM works WHERE user_id = \?/);
  for (const route of [fridgeRoute, cookingRoute, worksRoute]) {
    assert.match(route, /getSessionUser\(request\)/);
    assert.match(route, /currentUser\.id/);
    assert.match(route, /loadUserState\(currentUser\.id\)/);
  }
  assert.match(fridgeRoute, /export async function DELETE\(request: Request\)/);
  assert.match(fridgeRoute, /DELETE FROM fridge_items WHERE id = \? AND user_id = \?/);
  assert.match(fridgeRoute, /\.bind\(id, currentUser\.id\)\.run\(\)/);
  assert.match(fridgeRoute, /SELECT name, quantity, price_cents FROM fridge_items/);
  assert.match(fridgeRoute, /UPDATE fridge_items SET quantity = \?, price_cents = \?/);
  assert.match(fridgeRoute, /requestedAmount < quantity\.amount/);
  assert.match(fragment, /className = 'xc-delete-food'/);
  assert.match(fragment, /method:'DELETE'/);
  assert.match(fragment, /supportsPartialDelete/);
  assert.match(fragment, /inputMax:quantityAmount/);
  assert.match(fragment, /body:JSON\.stringify\(\{ id:item\.id, amount \}\)/);
  assert.match(fragment, /删除后会立即从当前账号的冰箱中移除/);
});

test("tonight recommendations are rebuilt from the signed-in user's fridge", async () => {
  const fragment = await readFile(new URL("public/app-fragment.html", root), "utf8");
  const homeMarkup = fragment.slice(
    fragment.indexOf('<section class="xc-screen xc-active" data-screen="home">'),
    fragment.indexOf('<section class="xc-screen" data-screen="fridge">'),
  );
  assert.match(homeMarkup, /id="xc-menu-list"/);
  assert.match(homeMarkup, /id="xc-orbit-more"/);
  assert.doesNotMatch(homeMarkup, /data-menu-select="0"/);
  assert.match(fragment, /updateDinnerRecommendations\(items\)/);
  assert.match(fragment, /Object\.keys\(verifiedRecipeMethods\)\.forEach/);
  assert.match(fragment, /orbitRecommendations = recipeChoices\.map/);
  assert.match(fragment, /matchedItems = inventory\.filter/);
  assert.match(fragment, /urgentMatchedCount/);
  assert.match(fragment, /从全部菜谱中找到 \$\{orbitRecommendations\.length\} 道匹配/);
  assert.match(fragment, /换一批 · \$\{orbitBatchStart \+ 1\}/);
  assert.match(fragment, /chooseRecipe\(activeRecommendation\.index,'home'\)/);
  assert.match(fragment, /else showAllFridgeRecipes\(\)/);
  assert.match(fragment, /const showAllFridgeRecipes = \(\) =>/);
  assert.match(fragment, /冰箱食材可做 · 全部 \$\{orbitRecommendations\.length\} 道/);
  assert.match(fragment, /orbitRecommendations\.map\(recommendation => renderSearchCard/);
});

test("recipe search understands aliases, extra words, and small typos", async () => {
  const searchSource = await readFile(new URL("public/recipe-search-utils.js", root), "utf8");
  const context = { window:{} };
  runInNewContext(searchSource, context);
  const search = context.window.XIANCHI_RECIPE_SEARCH;
  const names = ["番茄滑蛋", "宫保鸡丁", "巴斯克芝士蛋糕", "羊蝎子火锅", "巧克力布朗尼"];
  const aliases = {
    "番茄炒蛋":"番茄滑蛋",
    "西红柿炒蛋":"番茄滑蛋",
    "巴斯克蛋糕":"巴斯克芝士蛋糕",
    "羊蝎子锅":"羊蝎子火锅"
  };

  assert.equal(search.normalize("我想做个西红柿抄蛋"), "番茄炒蛋");
  assert.equal(search.rank("我想做个西红柿抄蛋", names, aliases)[0].name, "番茄滑蛋");
  assert.equal(search.rank("工保鸡丁", names, aliases)[0].name, "宫保鸡丁");
  assert.equal(search.rank("巴斯克蛋糕", names, aliases)[0].name, "巴斯克芝士蛋糕");
  assert.equal(search.rank("想做个羊蝎子锅", names, aliases)[0].name, "羊蝎子火锅");
  assert.equal(search.rank("巧克力布郎尼", names, aliases)[0].name, "巧克力布朗尼");
  assert.equal(search.rank("火星紫色料理", names, aliases).length, 0);
});

test("all 118 visible recipes are curated and generic cooking fallbacks are blocked", async () => {
  const [fragment, methodSource] = await Promise.all([
    readFile(new URL("public/app-fragment.html", root), "utf8"),
    readFile(new URL("public/verified-recipe-methods.js", root), "utf8"),
  ]);
  const context = { window: {} };
  runInNewContext(methodSource, context);
  const methods = context.window.XIANCHI_VERIFIED_RECIPE_METHODS;
  const verifiedNames = Object.keys(methods);

  assert.equal(verifiedNames.length, 108, "the verified method library must contain 108 recipes");
  assert.equal(new Set(verifiedNames).size, 108, "verified recipe names must be unique");
  for (const [name, guide] of Object.entries(methods)) {
    assert.ok(guide.steps.length >= 4 && guide.steps.length <= 8, `${name} needs 4–8 real steps`);
    assert.equal(new Set(guide.steps).size, guide.steps.length, `${name} must not repeat a step`);
    for (const step of guide.steps) {
      assert.ok(step.length >= 10, `${name} contains an underspecified step`);
      assert.doesNotMatch(step, /主要食材|按每种食材|万能步骤|AI即时生成/, `${name} contains a generic step`);
    }
  }

  const catalogSource = fragment.slice(fragment.indexOf("const catalogGroups"), fragment.indexOf("const catalogSeeds"));
  const catalogNames = [...catalogSource.matchAll(/names:\[([^\]]+)\]/g)]
    .flatMap(([, list]) => [...list.matchAll(/'([^']+)'/g)].map(([, name]) => name));
  const dessertListSource = fragment.match(/const dessertRecipeNames = \[([^\]]+)\]/)?.[1] || '';
  catalogNames.push(...[...dessertListSource.matchAll(/'([^']+)'/g)].map(([, name]) => name));
  assert.equal(catalogNames.length, 102, "the catalog must contain 102 recipes");
  assert.equal(new Set(catalogNames).size, 102, "catalog recipe names must be unique");
  for (const name of catalogNames) assert.ok(methods[name], `${name} is missing a verified method`);

  const coreSource = fragment.slice(fragment.indexOf("const recipeChoices"), fragment.indexOf("const catalogGroups"));
  const coreNames = [...coreSource.matchAll(/\bname:'([^']+)'/g)].map(([, name]) => name);
  assert.equal(coreNames.length, 10, "the hand-written core must contain 10 recipes");
  assert.equal(new Set([...coreNames, ...verifiedNames]).size, 118, "all 118 available dishes must be distinct and curated");

  const dessertNames = ['双皮奶','杨枝甘露','芒果西米露','红豆沙','银耳雪梨羹','焦糖布丁','巴斯克芝士蛋糕','提拉米苏','巧克力布朗尼','戚风蛋糕','葡式蛋挞','草莓奶油杯'];
  for (const name of dessertNames) assert.ok(methods[name], `${name} is missing its dedicated dessert method`);
  assert.match(fragment, /data-recipe-filter="dessert">甜品/);
  assert.match(fragment, /label:'家庭甜品', tags:'all dessert'/);
  assert.match(fragment, /if \(filter === 'dessert'\) while \(catalogShown < catalogSeeds\.length\) renderCatalogChunk\(\)/);
  assert.match(fragment, /已显示 \$\{dessertRecipeNames\.length\} 道甜品/);
  assert.match(fragment, /112 道 · 不限冰箱食材/);
  assert.match(fragment, /const curatedRecipeCount = recipeChoices\.length/);
  assert.match(fragment, /\/dessert-photos\/\$\{String\(dessertIndex\)/);
  assert.match(methodSource, /220℃烤25—30分钟/);
  assert.match(methodSource, /中心达到71℃/);
  assert.match(methodSource, /160℃烤箱/);
  assert.match(methodSource, /210℃烤20—25分钟/);

  const dessertPhotos = [
    '00-double-skin-milk.webp','01-mango-pomelo-sago.webp','02-mango-sago.webp','03-red-bean-soup.webp',
    '04-tremella-pear.webp','05-caramel-flan.webp','06-basque-cheesecake.webp','07-tiramisu.webp',
    '08-brownie.webp','09-chiffon-cake.webp','10-portuguese-egg-tarts.webp','11-strawberry-cream-cup.webp',
  ];
  await Promise.all(dessertPhotos.map((file) => readFile(new URL(`public/dessert-photos/${file}`, root))));

  const cookingStepPhotos = [
    '00-wash.webp','01-chop.webp','02-mix-sauce.webp','03-marinate.webp',
    '04-stir-fry.webp','05-pan-fry.webp','06-simmer.webp','07-steam.webp',
    '08-bake.webp','09-whisk.webp','10-blend.webp','11-plate.webp',
    '12-deep-fry.webp','13-boil-noodles.webp','14-blanch.webp','15-braise.webp',
    '16-soup-ladle.webp','17-metal-steam.webp','18-rice-cooker.webp','19-bake-cake.webp',
    '20-water-bath.webp','21-pipe-cream.webp','22-scramble-eggs.webp','23-pour-sauce.webp',
    '24-sear-protein.webp','25-saute-aromatics.webp','26-add-vegetables.webp','27-toss-sauce.webp'
  ];
  await Promise.all(cookingStepPhotos.map((file) => readFile(new URL(`public/cooking-steps/${file}`, root))));
  const kungPaoStepPhotos = [
    '01-marinate-chicken.webp','02-stir-fry-chicken.webp',
    '03-fry-chili-peppercorn-scallion.webp','04-toss-chicken-sauce-peanuts.webp'
  ];
  await Promise.all(kungPaoStepPhotos.map((file) => readFile(new URL(`public/cooking-steps/recipes/kung-pao-chicken/${file}`, root))));
  const beijingSaucePorkStepPhotos = [
    '01-marinate-pork-scallion-tofu-skin.webp','02-stir-fry-pork-shreds.webp',
    '03-fry-sweet-bean-sauce.webp','04-plate-pork-scallion-tofu-skin.webp'
  ];
  await Promise.all(beijingSaucePorkStepPhotos.map((file) => readFile(new URL(`public/cooking-steps/recipes/beijing-sauce-pork/${file}`, root))));
  const dedicatedStepPhotoSets = {
    'tomato-mushroom-spaghetti': [
      '01-chop-tomato-mushroom-garlic.webp','02-saute-mushroom-garlic.webp',
      '03-simmer-tomato-mushroom-sauce.webp','04-toss-spaghetti-sauce.webp'
    ],
    'tomato-scrambled-eggs': [
      '01-whisk-eggs.webp','02-soft-scramble-eggs.webp',
      '03-stir-fry-tomatoes.webp','04-fold-eggs-tomatoes-scallion.webp'
    ],
    'onsen-egg-salad': [
      '01-wash-lettuce-cherry-tomatoes.webp','02-cook-onsen-egg.webp',
      '03-mix-vinaigrette.webp','04-plate-salad-onsen-egg.webp'
    ],
    'garlic-butter-shrimp': [
      '01-devein-dry-shrimp.webp','02-melt-butter-saute-garlic.webp',
      '03-sear-shrimp.webp','04-lemon-herb-finish.webp'
    ]
  };
  await Promise.all(Object.entries(dedicatedStepPhotoSets).flatMap(([folder,files]) =>
    files.map((file) => readFile(new URL(`public/cooking-steps/recipes/${folder}/${file}`, root)))
  ));
  assert.match(fragment, /id="xc-step-flow" aria-label="真实烹饪流程图"/);
  assert.doesNotMatch(fragment, /xc-step-dish-reference|xc-step-flow-dish|xc-step-dish-name/);
  assert.match(fragment, /const cookingStepPhotoCatalog = \{/);
  assert.doesNotMatch(fragment, /recipeSpecificPhotoFor|const recipePhoto =|dishReference/);
  assert.match(fragment, /const cookingStepPhotoSequenceFor = \(steps,recipeName=''\) =>/);
  assert.match(fragment, /const recipeStepPhotoOverrides = \{/);
  assert.match(fragment, /'宫保鸡丁':\[/);
  assert.match(fragment, /01-marinate-chicken\.webp'.*label:'鸡腿肉丁加生抽、淀粉和油腌制'/);
  assert.match(fragment, /03-fry-chili-peppercorn-scallion\.webp'.*label:'干辣椒、花椒和葱段爆香'/);
  assert.match(fragment, /04-toss-chicken-sauce-peanuts\.webp'.*label:'鸡丁、宫保汁和花生合炒'/);
  assert.match(fragment, /'京酱肉丝':\[/);
  assert.match(fragment, /01-marinate-pork-scallion-tofu-skin\.webp'.*label:'里脊丝腌制，葱丝和豆腐皮备好'/);
  assert.match(fragment, /03-fry-sweet-bean-sauce\.webp'.*label:'甜面酱加糖和水炒至油亮'/);
  assert.match(fragment, /04-plate-pork-scallion-tofu-skin\.webp'.*label:'酱肉丝盛在葱丝上，配豆腐皮'/);
  assert.match(fragment, /'番茄蘑菇意面':\[/);
  assert.match(fragment, /04-toss-spaghetti-sauce\.webp'.*label:'意面拌入番茄口蘑酱'/);
  assert.match(fragment, /'番茄滑蛋':\[/);
  assert.match(fragment, /04-fold-eggs-tomatoes-scallion\.webp'.*label:'滑蛋回锅与番茄轻拌，撒葱花'/);
  assert.match(fragment, /'温泉蛋蔬菜沙拉':\[/);
  assert.match(fragment, /02-cook-onsen-egg\.webp'.*label:'巴氏鸡蛋在68℃水中加热'/);
  assert.match(fragment, /'蒜香黄油虾仁':\[/);
  assert.match(fragment, /03-sear-shrimp\.webp'.*label:'虾仁在蒜香黄油中煎至卷曲变红'/);
  assert.match(fragment, /if \(recipePhotos\?\.length === steps\.length\) return recipePhotos/);
  assert.match(fragment, /if \(primary\.file !== previousFile\)/);
  assert.match(fragment, /\.find\(photo => photo && photo\.file !== previousFile\) \|\| primary/);
  assert.match(fragment, /const photos = cookingStepPhotoSequenceFor\(steps,recipe\.name\)/);
  assert.match(fragment, /\$\{recipe\.name\} · \$\{photo\.label\} · \$\{photo\.tool\}/);
  assert.match(fragment, /deepFry:\{ file:'\/cooking-steps\/12-deep-fry\.webp'.*tool:'深炒锅＋漏勺'/);
  assert.match(fragment, /metalSteam:\{ file:'\/cooking-steps\/17-metal-steam\.webp'.*tool:'金属蒸锅＋耐热盘'/);
  assert.match(fragment, /waterBath:\{ file:'\/cooking-steps\/20-water-bath\.webp'.*tool:'深烤盘＋布丁杯＋隔热手套'/);
  assert.match(fragment, /riceCooker:\{ file:'\/cooking-steps\/18-rice-cooker\.webp'.*tool:'电饭煲＋饭勺'/);
  assert.match(fragment, /searProtein:\{ file:'\/cooking-steps\/24-sear-protein\.webp'.*label:'肉丁滑炒至变色'/);
  assert.match(fragment, /sauteAromatics:\{ file:'\/cooking-steps\/25-saute-aromatics\.webp'.*label:'香料小火爆香'/);
  assert.match(fragment, /tossSauce:\{ file:'\/cooking-steps\/27-toss-sauce\.webp'.*label:'裹汁翻炒收浓'/);
  assert.doesNotMatch(fragment, /querySelector\('#xc-step-visual'\)\.textContent = step\.visual/);

  assert.match(fragment, /缺少已核对做法，已阻止万能步骤进入页面/);
  assert.match(fragment, /未收录已核对做法，已阻止自动生成万能步骤/);
  assert.match(fragment, /recipe\.verified = true/);
  assert.match(fragment, /verified:true, standard:'已核对的家常标准做法'/);
  assert.match(fragment, /禽肉最厚处应达到 74℃/);
  assert.match(fragment, /绞肉中心应达到 71℃/);
  assert.match(fragment, /鱼和海鲜中心建议达到 63℃/);
  assert.match(fragment, /可生食的巴氏杀菌鸡蛋/);
  assert.match(fragment, /保持 68℃ 煮 30 分钟/);
  assert.match(fragment, /<span class="xc-meta">35分钟 · 轻食<\/span>/);
  assert.match(fragment, /保持小火微沸 60—75 分钟/);
  assert.match(methodSource, /均达到74℃才可捞出；不能只凭汁水颜色判断/);
});

test("all remaining recipes have distinct dedicated step photos", async () => {
  const source = await readFile(new URL("public/recipe-step-photo-overrides.js", root), "utf8");
  const context = { window: {} };
  runInNewContext(source, context);
  const overrides = context.window.XIANCHI_RECIPE_STEP_PHOTOS;
  const recipes = Object.entries(overrides);

  assert.equal(recipes.length, 104);
  assert.equal(recipes.reduce((total, [, photos]) => total + photos.length, 0), 460);
  for (const [name, photos] of recipes) {
    assert.equal(new Set(photos.map((photo) => photo.file)).size, photos.length, `${name} repeats a step photo`);
    for (const photo of photos) {
      assert.match(photo.file, /^\/cooking-steps\/recipes\/r\d{3}\/\d{2}\.webp$/);
      assert.ok(photo.label.length > 0, `${name} has a missing photo label`);
      assert.ok(photo.tool.length > 0, `${name} has a missing tool label`);
      await access(new URL(`public${photo.file}`, root));
    }
  }
});

test("database migration includes users, verification codes, and sessions", async () => {
  const migrationFiles = (await readdir(new URL("drizzle/", root))).filter((file) => file.endsWith(".sql"));
  const migration = (await Promise.all(
    migrationFiles.map((file) => readFile(new URL(`drizzle/${file}`, root), "utf8")),
  )).join("\n");
  assert.match(migration, /CREATE TABLE `users`/);
  assert.match(migration, /CREATE TABLE `verification_codes`/);
  assert.match(migration, /CREATE TABLE `sessions`/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_users_email`/);
  assert.match(migration, /`avatar` text/);
  assert.match(migration, /`cooking_level` text/);
  assert.match(migration, /SELECT "id", "email", "name", NULL, NULL, NULL/);
});
