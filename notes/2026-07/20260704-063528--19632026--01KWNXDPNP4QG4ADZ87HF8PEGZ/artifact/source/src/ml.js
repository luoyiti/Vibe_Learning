// Real tree-learning algorithms, run live in the browser.
// CART (Gini), bagging / random forest (bootstrap + OOB), and
// least-squares gradient boosting — no approximations beyond small-data limits.

// ---------- deterministic RNG (mulberry32) ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function trainTestSplit(n, testRatio, seed) {
  const idx = Array.from({ length: n }, (_, i) => i);
  const r = rng(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const nTest = Math.round(n * testRatio);
  return { test: idx.slice(0, nTest), train: idx.slice(nTest) };
}

// ---------- CART classification (Gini impurity) ----------
function gini(counts, n) {
  if (n === 0) return 0;
  let s = 0;
  for (const c of counts) s += (c / n) * (c / n);
  return 1 - s;
}

function classCounts(y, idx, k) {
  const c = new Array(k).fill(0);
  for (const i of idx) c[y[i]]++;
  return c;
}

// Exhaustive best split over candidate features (midpoints of sorted values).
function bestSplit(X, y, idx, k, features) {
  const n = idx.length;
  const parentCounts = classCounts(y, idx, k);
  const parentGini = gini(parentCounts, n);
  let best = null;
  for (const f of features) {
    const sorted = [...idx].sort((a, b) => X[a][f] - X[b][f]);
    const left = new Array(k).fill(0);
    const right = [...parentCounts];
    for (let i = 0; i < n - 1; i++) {
      const yi = y[sorted[i]];
      left[yi]++; right[yi]--;
      if (X[sorted[i]][f] === X[sorted[i + 1]][f]) continue;
      const nl = i + 1, nr = n - nl;
      const g = (nl / n) * gini(left, nl) + (nr / n) * gini(right, nr);
      const gain = parentGini - g;
      if (!best || gain > best.gain) {
        best = { feature: f, thr: (X[sorted[i]][f] + X[sorted[i + 1]][f]) / 2, gain };
      }
    }
  }
  return best;
}

export function buildTree(X, y, idx, k, opts, depth = 0) {
  const { maxDepth = 4, minLeaf = 1, mtry = null, rand = null } = opts;
  const counts = classCounts(y, idx, k);
  const n = idx.length;
  const pred = counts.indexOf(Math.max(...counts));
  const node = { n, counts, pred, gini: gini(counts, n), depth };
  const pure = counts.filter((c) => c > 0).length <= 1;
  if (depth >= maxDepth || n < 2 * minLeaf || pure) return node;

  let features = Array.from({ length: X[0].length }, (_, i) => i);
  if (mtry && rand && mtry < features.length) {
    // random feature subset per node — the Random Forest ingredient
    for (let i = features.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [features[i], features[j]] = [features[j], features[i]];
    }
    features = features.slice(0, mtry);
  }
  const split = bestSplit(X, y, idx, k, features);
  if (!split || split.gain <= 1e-12) return node;
  const li = idx.filter((i) => X[i][split.feature] <= split.thr);
  const ri = idx.filter((i) => X[i][split.feature] > split.thr);
  if (li.length < minLeaf || ri.length < minLeaf) return node;
  node.feature = split.feature;
  node.thr = split.thr;
  node.gain = split.gain;
  node.left = buildTree(X, y, li, k, opts, depth + 1);
  node.right = buildTree(X, y, ri, k, opts, depth + 1);
  return node;
}

export function predictTree(node, x) {
  while (node.left) node = x[node.feature] <= node.thr ? node.left : node.right;
  return node.pred;
}

export function accuracy(tree, X, y, idx, predictFn) {
  let ok = 0;
  for (const i of idx) if (predictFn(tree, X[i]) === y[i]) ok++;
  return ok / idx.length;
}

// ---------- bagging / random forest with OOB ----------
export function buildForest(X, y, trainIdx, k, opts) {
  const { nTrees = 50, maxDepth = 10, bootstrap = true, mtry = null, seed = 7 } = opts;
  const r = rng(seed);
  const trees = [];
  const oobSets = [];
  for (let t = 0; t < nTrees; t++) {
    let idx;
    if (bootstrap) {
      idx = Array.from({ length: trainIdx.length }, () =>
        trainIdx[Math.floor(r() * trainIdx.length)]
      );
      const inBag = new Set(idx);
      oobSets.push(trainIdx.filter((i) => !inBag.has(i)));
    } else {
      idx = trainIdx;
      oobSets.push([]);
    }
    trees.push(buildTree(X, y, idx, k, { maxDepth, minLeaf: 1, mtry, rand: r }));
  }
  return { trees, oobSets };
}

export function predictForest(trees, x, k) {
  const votes = new Array(k).fill(0);
  for (const t of trees) votes[predictTree(t, x)]++;
  return votes.indexOf(Math.max(...votes));
}

// OOB error using only the first m trees — lets a slider replay the ensemble growing.
export function oobErrorCurve(forest, X, y, trainIdx, k) {
  const { trees, oobSets } = forest;
  const votes = new Map(trainIdx.map((i) => [i, new Array(k).fill(0)]));
  const curve = [];
  for (let m = 0; m < trees.length; m++) {
    for (const i of oobSets[m]) votes.get(i)[predictTree(trees[m], X[i])]++;
    let err = 0, cnt = 0;
    for (const i of trainIdx) {
      const v = votes.get(i);
      const tot = v.reduce((a, b) => a + b, 0);
      if (tot === 0) continue;
      cnt++;
      if (v.indexOf(Math.max(...v)) !== y[i]) err++;
    }
    curve.push(cnt ? err / cnt : null);
  }
  return curve;
}

// ---------- least-squares gradient boosting (1-D regression trees) ----------
function buildRegTree(xs, res, idx, maxDepth, minLeaf, depth = 0) {
  const mean = idx.reduce((s, i) => s + res[i], 0) / idx.length;
  const node = { value: mean, n: idx.length };
  if (depth >= maxDepth || idx.length < 2 * minLeaf) return node;
  const sorted = [...idx].sort((a, b) => xs[a] - xs[b]);
  let sl = 0, sql = 0;
  let sr = 0, sqr = 0;
  for (const i of idx) { sr += res[i]; sqr += res[i] * res[i]; }
  let best = null;
  const n = idx.length;
  for (let i = 0; i < n - 1; i++) {
    const v = res[sorted[i]];
    sl += v; sql += v * v; sr -= v; sqr -= v * v;
    if (xs[sorted[i]] === xs[sorted[i + 1]]) continue;
    const nl = i + 1, nr = n - nl;
    if (nl < minLeaf || nr < minLeaf) continue;
    const sse = (sql - (sl * sl) / nl) + (sqr - (sr * sr) / nr);
    if (!best || sse < best.sse) best = { thr: (xs[sorted[i]] + xs[sorted[i + 1]]) / 2, sse };
  }
  if (!best) return node;
  node.thr = best.thr;
  node.left = buildRegTree(xs, res, idx.filter((i) => xs[i] <= best.thr), maxDepth, minLeaf, depth + 1);
  node.right = buildRegTree(xs, res, idx.filter((i) => xs[i] > best.thr), maxDepth, minLeaf, depth + 1);
  return node;
}

function predictReg(node, x) {
  while (node.left) node = x <= node.thr ? node.left : node.right;
  return node.value;
}

// Friedman (2001): F_m = F_{m-1} + lr * tree(residuals). Returns staged state.
export function gbdtFit(xs, ys, trainIdx, testIdx, { nIter = 100, lr = 0.1, depth = 2, minLeaf = 5 }) {
  const f0 = trainIdx.reduce((s, i) => s + ys[i], 0) / trainIdx.length;
  const F = new Array(xs.length).fill(f0);
  const trees = [];
  const mse = (idx) => idx.reduce((s, i) => s + (ys[i] - F[i]) ** 2, 0) / idx.length;
  const trainLoss = [mse(trainIdx)];
  const testLoss = [mse(testIdx)];
  const res = new Array(xs.length).fill(0);
  for (let m = 0; m < nIter; m++) {
    for (const i of trainIdx) res[i] = ys[i] - F[i]; // negative gradient of ½(y−F)²
    const tree = buildRegTree(xs, res, trainIdx, depth, minLeaf);
    trees.push(tree);
    for (let i = 0; i < xs.length; i++) F[i] += lr * predictReg(tree, xs[i]);
    trainLoss.push(mse(trainIdx));
    testLoss.push(mse(testIdx));
  }
  return { f0, lr, trees, trainLoss, testLoss };
}

// Prediction of the ensemble truncated at stage m, on arbitrary x.
export function gbdtPredict(model, x, m) {
  let f = model.f0;
  for (let i = 0; i < m; i++) f += model.lr * predictReg(model.trees[i], x);
  return f;
}

export function gbdtTreePredict(model, x, m) {
  return m >= 1 ? predictReg(model.trees[m - 1], x) : 0;
}
