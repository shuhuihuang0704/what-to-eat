(function (global) {
  const phraseReplacements = [
    ['西红柿', '番茄'], ['蕃茄', '番茄'], ['马铃薯', '土豆'], ['意大利面', '意面'],
    ['芝士', '奶酪'], ['蛋塔', '蛋挞'], ['抄', '炒'], ['敦', '炖']
  ];
  const intentWords = /请问|麻烦|帮我|我想要|我想|想要|想吃|想做|要吃|要做|怎么做|如何做|的做法|做法|菜谱|食谱|搜索|搜一下|搜|找一下|找|来一道|来一份|来一个|来个|做一道|做一份|做一个|做个|这道菜|那道菜|一道菜|一道|一份|一个/g;

  const normalize = value => {
    let text = String(value || '').normalize('NFKC').toLowerCase();
    for (const [from, to] of phraseReplacements) text = text.replaceAll(from, to);
    return text
      .replace(intentWords, '')
      .replace(/[\s\p{P}\p{S}]+/gu, '')
      .replace(/^(?:我|要|吃|做|个|的)+|(?:呀|啊|吧|吗|呢|哦)+$/g, '');
  };

  const editDistance = (left, right) => {
    const a = [...left];
    const b = [...right];
    const row = Array.from({ length:b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      let diagonal = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const above = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
        diagonal = above;
      }
    }
    return row[b.length];
  };

  const bigrams = text => {
    const chars = [...text];
    if (chars.length < 2) return new Set(chars);
    return new Set(chars.slice(0, -1).map((char, index) => char + chars[index + 1]));
  };

  const similarity = (query, candidate) => {
    if (!query || !candidate) return 0;
    if (query === candidate) return 1;
    if (candidate.includes(query) || query.includes(candidate)) {
      return 0.82 + 0.16 * (Math.min(query.length, candidate.length) / Math.max(query.length, candidate.length));
    }
    const editScore = 1 - editDistance(query, candidate) / Math.max([...query].length, [...candidate].length);
    const queryPairs = bigrams(query);
    const candidatePairs = bigrams(candidate);
    const overlap = [...queryPairs].filter(pair => candidatePairs.has(pair)).length;
    const pairScore = overlap / Math.max(1, new Set([...queryPairs, ...candidatePairs]).size);
    return editScore * 0.78 + pairScore * 0.22;
  };

  const rank = (query, names, aliases = {}, limit = 6) => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return [];
    const aliasEntries = Object.entries(aliases).map(([alias, target]) => ({ alias:normalize(alias), target }));
    const directAlias = aliasEntries.find(entry => entry.alias === normalizedQuery && names.includes(entry.target));
    if (directAlias) return [{ name:directAlias.target, score:1, reason:'alias' }];

    const scored = [...new Set(names)].map(name => {
      const normalizedName = normalize(name);
      const relatedAliases = aliasEntries.filter(entry => entry.target === name).map(entry => entry.alias);
      const forms = [normalizedName, ...relatedAliases];
      const score = Math.max(...forms.map(form => similarity(normalizedQuery, form)));
      const reason = normalizedName === normalizedQuery ? 'exact' : relatedAliases.includes(normalizedQuery) ? 'alias' : (forms.some(form => form.includes(normalizedQuery) || normalizedQuery.includes(form)) ? 'partial' : 'fuzzy');
      return { name, score, reason };
    }).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, 'zh-CN'));

    const threshold = [...normalizedQuery].length <= 1 ? 0.97 : [...normalizedQuery].length === 2 ? 0.86 : [...normalizedQuery].length === 3 ? 0.50 : 0.58;
    const best = scored[0]?.score || 0;
    return scored.filter(item => item.score >= threshold && item.score >= best - 0.14).slice(0, limit);
  };

  global.XIANCHI_RECIPE_SEARCH = { normalize, similarity, rank };
})(window);
