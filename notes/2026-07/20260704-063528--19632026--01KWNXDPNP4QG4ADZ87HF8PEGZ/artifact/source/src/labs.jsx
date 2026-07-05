// Interactive figures: each one trains the real algorithm live on real data.
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { IRIS, IRIS_FEATURES, IRIS_ABBR, SPECIES, MPG } from "./data.js";
import {
  buildTree, predictTree, accuracy, trainTestSplit,
  buildForest, predictForest, oobErrorCurve, gbdtFit, gbdtPredict, gbdtTreePredict,
} from "./ml.js";
import { BoundaryPlot, TreeDiagram, LineChart, Frame, scaleLinear, COLORS, INK } from "./charts.jsx";

const IRIS_X = IRIS.map((r) => [r[0], r[1], r[2], r[3]]);
const IRIS_Y = IRIS.map((r) => SPECIES.indexOf(r[4]));

function pad(vals) {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const p = (hi - lo) * 0.08;
  return [lo - p, hi + p];
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it, i) => (
        <span key={i} className="legend-item">
          <span className="legend-swatch" style={{ background: it.color }} />{it.label}
        </span>
      ))}
    </div>
  );
}

function Controls({ children }) {
  return <div className="controls">{children}</div>;
}

function Slider({ label, value, onChange, min, max, step = 1, fmt = (v) => v }) {
  return (
    <label className="ctl">
      <span className="ctl-label">{label} <b>{fmt(value)}</b></span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="ctl">
      <span className="ctl-label">{label}</span>
      <select value={value} onChange={(e) => onChange(+e.target.value)}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </label>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// ============================================================
// 图 2 — CART：真实的基尼不纯度递归划分（Iris，150 条真实样本）
// ============================================================
export function CartLab() {
  const [fx, setFx] = useState(2);
  const [fy, setFy] = useState(3);
  const [maxDepth, setMaxDepth] = useState(3);
  const [minLeaf, setMinLeaf] = useState(2);

  const split = useMemo(() => trainTestSplit(IRIS.length, 0.3, 42), []);
  const X2 = useMemo(() => IRIS_X.map((r) => [r[fx], r[fy]]), [fx, fy]);

  const tree = useMemo(
    () => buildTree(X2, IRIS_Y, split.train, 3, { maxDepth, minLeaf }),
    [X2, maxDepth, minLeaf, split]
  );
  const predict = useCallback((p) => predictTree(tree, p), [tree]);

  const xd = useMemo(() => pad(X2.map((r) => r[0])), [X2]);
  const yd = useMemo(() => pad(X2.map((r) => r[1])), [X2]);
  const points = useMemo(
    () => IRIS.map((r, i) => ({ x: r[fx], y: r[fy], c: IRIS_Y[i], extra: SPECIES[IRIS_Y[i]] })),
    [fx, fy]
  );
  const accTr = accuracy(tree, X2, IRIS_Y, split.train, predictTree);
  const accTe = accuracy(tree, X2, IRIS_Y, split.test, predictTree);
  const countLeaves = (n) => (n.left ? countLeaves(n.left) + countLeaves(n.right) : 1);

  return (
    <div className="lab">
      <Controls>
        <Select label="横轴特征" value={fx} onChange={setFx}
          options={IRIS_FEATURES.map((f, i) => ({ v: i, label: f })).filter((o) => o.v !== fy)} />
        <Select label="纵轴特征" value={fy} onChange={setFy}
          options={IRIS_FEATURES.map((f, i) => ({ v: i, label: f })).filter((o) => o.v !== fx)} />
        <Slider label="最大深度 max_depth =" value={maxDepth} onChange={setMaxDepth} min={1} max={6} />
        <Slider label="叶最小样本 min_leaf =" value={minLeaf} onChange={setMinLeaf} min={1} max={20} />
      </Controls>
      <div className="lab-row">
        <div>
          <BoundaryPlot predict={predict} points={points} xd={xd} yd={yd}
            xLabel={IRIS_FEATURES[fx] + "（cm）"} yLabel={IRIS_FEATURES[fy] + "（cm）"}
            colors={COLORS} names={SPECIES} />
          <Legend items={SPECIES.map((s, i) => ({ label: s, color: COLORS[i] }))} />
        </div>
        <div className="stats-col">
          <Stat label="训练准确率（105 样本）" value={(accTr * 100).toFixed(1) + "%"} />
          <Stat label="测试准确率（45 样本）" value={(accTe * 100).toFixed(1) + "%"} />
          <Stat label="叶子数" value={countLeaves(tree)} />
          <p className="stat-note">
            把 max_depth 拉到 6、min_leaf 调到 1：训练准确率逼近 100%，而测试准确率往往回落——
            这正是 CART 一书用<em>代价复杂度剪枝</em>对抗的过拟合现象。
          </p>
        </div>
      </div>
      <div className="tree-scroll">
        <TreeDiagram tree={tree} featureAbbr={[IRIS_ABBR[fx], IRIS_ABBR[fy]]} classNames={SPECIES} colors={COLORS} />
      </div>
    </div>
  );
}

// ============================================================
// 图 3 — Bagging → 随机森林：自助采样 + 每分裂随机特征 + OOB 误差
// ============================================================
export function ForestLab() {
  const FX = 2, FY = 3;
  const N_MAX = 60;
  const [nTrees, setNTrees] = useState(1);
  const [mtry1, setMtry1] = useState(true);
  const [seed, setSeed] = useState(3);

  const X2 = useMemo(() => IRIS_X.map((r) => [r[FX], r[FY]]), []);
  const trainIdx = useMemo(() => Array.from({ length: IRIS.length }, (_, i) => i), []);

  const forest = useMemo(
    () => buildForest(X2, IRIS_Y, trainIdx, 3, { nTrees: N_MAX, maxDepth: 8, bootstrap: true, mtry: mtry1 ? 1 : null, seed }),
    [X2, trainIdx, mtry1, seed]
  );
  const oobCurve = useMemo(() => oobErrorCurve(forest, X2, IRIS_Y, trainIdx, 3), [forest, X2, trainIdx]);

  const active = forest.trees.slice(0, nTrees);
  const predict = useCallback((p) => predictForest(active, p, 3), [forest, nTrees]);

  const xd = useMemo(() => pad(X2.map((r) => r[0])), [X2]);
  const yd = useMemo(() => pad(X2.map((r) => r[1])), [X2]);
  const points = useMemo(
    () => IRIS.map((r, i) => ({ x: r[FX], y: r[FY], c: IRIS_Y[i], extra: SPECIES[IRIS_Y[i]] })),
    []
  );
  const oobNow = oobCurve[nTrees - 1];

  return (
    <div className="lab">
      <Controls>
        <Slider label="树的数量 n_estimators =" value={nTrees} onChange={setNTrees} min={1} max={N_MAX} />
        <label className="ctl ctl-check">
          <input type="checkbox" checked={mtry1} onChange={(e) => setMtry1(e.target.checked)} />
          <span className="ctl-label">每次分裂随机抽 1 个特征（Breiman 2001 的关键改动；关掉即纯 Bagging）</span>
        </label>
        <button className="btn" onClick={() => setSeed((s) => s + 1)}>换一组自助采样</button>
      </Controls>
      <div className="lab-row">
        <div>
          <BoundaryPlot predict={predict} points={points} xd={xd} yd={yd}
            xLabel={IRIS_FEATURES[FX] + "（cm）"} yLabel={IRIS_FEATURES[FY] + "（cm）"}
            colors={COLORS} names={SPECIES} />
          <Legend items={SPECIES.map((s, i) => ({ label: s, color: COLORS[i] }))} />
        </div>
        <div>
          <LineChart width={430} height={330}
            xd={[1, N_MAX]} yd={[0, Math.max(0.14, ...oobCurve.filter((v) => v != null)) * 1.1]}
            xLabel="树的数量" yLabel="OOB 误差（袋外估计）"
            series={[{ name: "OOB 误差", color: COLORS[0], pts: oobCurve.map((v, i) => [i + 1, v ?? 0]) }]}
            ann={<line x1={scaleLinear([1, N_MAX], [56, 56 + 430 - 70])(nTrees)} x2={scaleLinear([1, N_MAX], [56, 56 + 430 - 70])(nTrees)} y1={12} y2={330 - 46} stroke={COLORS[2]} strokeWidth="1.6" />}
            fmtY={(v) => (v * 100).toFixed(1) + "%"} />
          <p className="stat-note">
            当前 {nTrees} 棵树的袋外误差 <b>{oobNow != null ? (oobNow * 100).toFixed(1) + "%" : "—"}</b>。
            OOB 用每棵树没抽到的 ~37% 样本做“免费验证集”，无需另留数据。
          </p>
        </div>
      </div>
      <p className="stat-note">
        只有 1 棵深树时边界破碎、贴着噪声走；拖到 30+ 棵，投票平均把方差抹平，边界明显变稳。
        点“换一组自助采样”：单棵树的边界剧烈变化（高方差），而 60 棵树的集成几乎不动——这就是 Bagging 的全部秘密。
      </p>
    </div>
  );
}

// ============================================================
// 图 4 — 梯度提升：函数空间的梯度下降（Auto MPG，392 条真实样本）
// ============================================================
export function BoostLab() {
  const N_ITER = 120;
  const [lr, setLr] = useState(0.1);
  const [depth, setDepth] = useState(2);
  const [iter, setIter] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);

  const xs = useMemo(() => MPG.map((r) => r[0]), []);
  const ys = useMemo(() => MPG.map((r) => r[1]), []);
  const split = useMemo(() => trainTestSplit(MPG.length, 0.25, 11), []);

  const model = useMemo(
    () => gbdtFit(xs, ys, split.train, split.test, { nIter: N_ITER, lr, depth, minLeaf: 8 }),
    [xs, ys, split, lr, depth]
  );

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setIter((m) => {
        if (m >= N_ITER) { setPlaying(false); return m; }
        return m + 1;
      });
    }, 90);
    return () => clearInterval(timer.current);
  }, [playing]);

  const W = 470, H = 340, M = { l: 52, r: 14, t: 12, b: 46 };
  const w = W - M.l - M.r, h = H - M.t - M.b;
  const xd = pad(xs), yd = pad(ys);
  const sx = scaleLinear(xd, [M.l, M.l + w]);
  const sy = scaleLinear(yd, [M.t + h, M.t]);

  const curveX = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 260; i++) pts.push(xd[0] + (i / 260) * (xd[1] - xd[0]));
    return pts;
  }, []);
  const fPath = curveX.map((x, i) => `${i ? "L" : "M"}${sx(x)},${sy(gbdtPredict(model, x, iter))}`).join("");

  // 残差图（当前阶段）+ 下一棵树要拟合的形状
  const RH = 190;
  const resid = split.train.map((i) => [xs[i], ys[i] - gbdtPredict(model, xs[i], iter)]);
  const rMax = Math.max(8, ...resid.map((r) => Math.abs(r[1]))) * 1.1;
  const sry = scaleLinear([-rMax, rMax], [RH - 40, 10]);
  const nextTreePath = iter < N_ITER
    ? curveX.map((x, i) => `${i ? "L" : "M"}${sx(x)},${sry(gbdtTreePredict(model, x, iter + 1))}`).join("")
    : null;

  const lossMax = Math.max(model.trainLoss[0], model.testLoss[0]) * 1.05;
  const trainNow = model.trainLoss[iter], testNow = model.testLoss[iter];

  return (
    <div className="lab">
      <Controls>
        <button className="btn btn-primary" onClick={() => { if (iter >= N_ITER) setIter(0); setPlaying((p) => !p); }}>
          {playing ? "⏸ 暂停" : "▶ 训练"}
        </button>
        <Slider label="迭代轮数 m =" value={iter} onChange={(v) => { setPlaying(false); setIter(v); }} min={0} max={N_ITER} />
        <Select label="学习率 ν" value={lr} onChange={(v) => { setLr(v); setIter(0); }}
          options={[{ v: 0.05, label: "0.05" }, { v: 0.1, label: "0.1" }, { v: 0.3, label: "0.3" }, { v: 1, label: "1.0（无收缩）" }]} />
        <Select label="树深度" value={depth} onChange={(v) => { setDepth(v); setIter(0); }}
          options={[{ v: 1, label: "1（树桩）" }, { v: 2, label: "2" }, { v: 3, label: "3" }, { v: 4, label: "4" }]} />
      </Controls>

      <div className="lab-row">
        <div>
          <div className="plot-wrap" style={{ maxWidth: W }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
              <Frame x={M.l} y={M.t} w={w} h={h} xd={xd} yd={yd} xLabel="马力 horsepower" yLabel="油耗 mpg" />
              {split.train.map((i) => (
                <circle key={i} cx={sx(xs[i])} cy={sy(ys[i])} r="2.6" fill={INK.muted} opacity="0.5" />
              ))}
              <path d={fPath} fill="none" stroke={COLORS[0]} strokeWidth="2.4" strokeLinejoin="round" />
              <text x={M.l + 8} y={M.t + 16} fontSize="11.5" fill={COLORS[0]} fontWeight="600">
                F{iter === 0 ? "₀（全局均值）" : `_${iter}(x)`}
              </text>
            </svg>
          </div>
          <p className="fig-sub">集成预测 F<sub>m</sub>(x)：从常数 F₀ 出发，每轮加上 ν·（新树对残差的拟合）</p>
        </div>
        <div>
          <div className="plot-wrap" style={{ maxWidth: W }}>
            <svg viewBox={`0 0 ${W} ${RH}`} style={{ width: "100%", display: "block" }}>
              <line x1={M.l} x2={W - M.r} y1={sry(0)} y2={sry(0)} stroke={INK.axis} strokeWidth="1" />
              {resid.map(([x, r], i) => (
                <circle key={i} cx={sx(x)} cy={sry(r)} r="2.4" fill={INK.muted} opacity="0.5" />
              ))}
              {nextTreePath && <path d={nextTreePath} fill="none" stroke={COLORS[2]} strokeWidth="2.2" />}
              <text x={M.l + 8} y={16} fontSize="11.5" fill={COLORS[2]} fontWeight="600">第 {Math.min(iter + 1, N_ITER)} 棵树学到的形状</text>
              <text x={W - M.r - 4} y={sry(0) - 6} fontSize="10" fill={INK.muted} textAnchor="end">残差 y − F_m = 0</text>
            </svg>
          </div>
          <p className="fig-sub">当前残差（负梯度）与下一棵回归树的拟合——“每棵新树只学前面所有树没学会的部分”</p>
          <LineChart width={W} height={210}
            xd={[0, N_ITER]} yd={[0, lossMax]}
            xLabel="迭代轮数" yLabel="MSE"
            series={[
              { name: "训练", color: COLORS[0], pts: model.trainLoss.map((v, i) => [i, v]) },
              { name: "测试", color: COLORS[4], pts: model.testLoss.map((v, i) => [i, v]) },
            ]}
            ann={<line x1={scaleLinear([0, N_ITER], [56, W - 14])(iter)} x2={scaleLinear([0, N_ITER], [56, W - 14])(iter)} y1={12} y2={210 - 46} stroke={COLORS[2]} strokeWidth="1.4" />} />
        </div>
      </div>
      <p className="stat-note">
        m = {iter}：训练 MSE <b>{trainNow.toFixed(1)}</b>，测试 MSE <b>{testNow.toFixed(1)}</b>。
        试试 ν = 1.0 + 深度 4：训练误差俯冲、测试误差先降后升（过拟合）；换回 ν = 0.05
        则曲线平缓得多——Friedman 所说的“收缩换泛化”，也是 XGBoost 正则化设计的出发点。
      </p>
    </div>
  );
}
