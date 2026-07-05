// Timeline, tree-growth animation, benchmark figures, and reference list.
import React, { useState, useEffect, useMemo } from "react";
import { rng } from "./ml.js";
import { COLORS, INK, scaleLinear } from "./charts.jsx";

// ---------------- 图 1 · 交互年表 ----------------
const ERAS = [
  {
    era: "单棵树时代 · 1963–1993",
    items: [
      { year: 1963, name: "AID", who: "Morgan & Sonquist", ref: 1,
        line: "递归划分的起点：为调查数据自动探测交互效应",
        detail: "在调查统计里，交互项难以事先写进线性模型。AID 反复寻找能最大程度降低残差方差的切分，把样本切成愈发同质的子群——现代回归树的全部要素（递归划分、停止规则、可解释的分段结构）在这里首次出现。",
        innovations: ["递归划分范式", "以方差缩减选切分", "早期停止/剪枝意识"] },
      { year: 1980, name: "CHAID", who: "Kass", ref: 2,
        line: "用卡方检验驱动切分，支持多路分裂与类别合并",
        detail: "CHAID 把假设检验引入树的生长：对每个候选变量做与目标的卡方检验（含多重检验校正），把统计上不可区分的类别先合并，再选证据最强的变量分裂。适合高基数类别变量，在商业分析软件中流行至今。",
        innovations: ["显著性检验选切分", "多路分裂", "类别自动合并"] },
      { year: 1984, name: "CART", who: "Breiman, Friedman, Olshen & Stone", ref: 3,
        line: "决策树的奠基专著：基尼不纯度、二叉分裂、代价复杂度剪枝",
        detail: "CART 把树的构建形式化为优化问题：穷举二叉切分最小化不纯度（分类用基尼指数、回归用方差），先长满再用代价复杂度剪枝配合交叉验证选子树，并以替代分裂（surrogate splits）处理缺失值。它同时是后来所有集成方法的基学习器。",
        innovations: ["基尼不纯度 + 二叉分裂", "代价复杂度剪枝", "替代分裂处理缺失值"] },
      { year: 1986, name: "ID3", who: "Quinlan", ref: 4,
        line: "信息论视角：以信息增益（熵减）选择属性",
        detail: "与统计学派的 CART 平行，Quinlan 从符号 AI 出发，用熵和信息增益贪心选属性，天然支持类别属性的多路分裂，并提出 windowing 等工程技巧。树 = 一组 if–then 规则的观点由此而来。",
        innovations: ["信息增益准则", "多路类别分裂", "规则视角"] },
      { year: 1993, name: "C4.5", who: "Quinlan", ref: 5,
        line: "增益率、连续特征、缺失值、规则抽取——单棵树的成熟形态",
        detail: "C4.5 用增益率修正信息增益偏好高基数属性的缺陷，通过阈值搜索处理连续特征，用基于误差估计的剪枝对抗噪声，并能把树转成可独立化简的规则集。它是 1990 年代最常用的 ML 算法之一。",
        innovations: ["增益率", "连续属性阈值化", "误差剪枝与规则抽取"] },
    ],
  },
  {
    era: "集成革命 · 1995–2006",
    items: [
      { year: 1996, name: "Bagging", who: "Breiman", ref: 6,
        line: "自助采样 + 平均：不稳定学习器的方差被投票抹平",
        detail: "对训练集有放回重采样，训出多棵（不剪枝的深）树后投票/平均。关键洞察：树是高方差的“不稳定”学习器，恰恰最适合被平均。图 3 里可以亲手复现这一点。",
        innovations: ["Bootstrap 重采样", "投票聚合降方差", "“不稳定性是资产”"] },
      { year: 1997, name: "AdaBoost", who: "Freund & Schapire", ref: 7,
        line: "自适应重加权：让每个新的弱学习器盯住此前分错的样本",
        detail: "AdaBoost 顺序训练弱学习器（常为决策树桩），每轮放大误分类样本的权重、按错误率给学习器加权投票。理论上可将任意“略好于随机”的弱学习器提升为强学习器，赢得 2003 年哥德尔奖。",
        innovations: ["样本重加权", "加权多数投票", "弱学习器可提升定理"] },
      { year: 2001, name: "Random Forests", who: "Breiman", ref: 8,
        line: "Bagging + 每次分裂随机抽特征子集 = 去相关的树的森林",
        detail: "在 Bagging 之上，每个节点只在随机特征子集中找最优切分，进一步去相关各树；配套 OOB 误差（免费验证）与变量重要性。几乎不需调参、极其鲁棒，成为其后二十年的默认基线。",
        innovations: ["每分裂随机特征子集", "OOB 误差估计", "变量重要性/邻近度"] },
      { year: 2001, name: "GBM", who: "Friedman", ref: 9,
        line: "函数空间的梯度下降：每棵新树拟合当前损失的负梯度",
        detail: "“Greedy Function Approximation” 把 boosting 统一为函数空间的分阶段梯度下降：任意可微损失都可用，每轮用小回归树拟合伪残差，配学习率（收缩）与子采样。图 4 完整复现了这一算法。",
        innovations: ["负梯度 = 伪残差", "任意可微损失", "收缩与随机子采样"] },
      { year: 2006, name: "Extra Trees", who: "Geurts, Ernst & Wehenkel", ref: 10,
        line: "连切分阈值也随机：更快、更多样、常常同样准",
        detail: "极端随机树不再穷举最优阈值，而是为每个候选特征随机抽阈值再择优。牺牲局部最优换取全局多样性与速度，说明“随机化本身就是一种正则化”。",
        innovations: ["随机切分阈值", "全样本（不重采样）", "随机化即正则化"] },
    ],
  },
  {
    era: "工业化 GBDT · 2014–2018",
    items: [
      { year: 2016, name: "XGBoost", who: "Chen & Guestrin", ref: 11,
        line: "二阶梯度 + 显式正则 + 稀疏感知 + 分布式——Kaggle 时代的王者",
        detail: "把目标函数二阶泰勒展开求出叶权重的闭式解，对叶子数与叶权重显式 L1/L2 正则；缺失值学“默认方向”；加权分位数草图近似分裂、缓存感知与核外计算支撑十亿级样本。2015 年 Kaggle 冠军方案 29 个中有 17 个使用它。",
        innovations: ["二阶梯度优化", "正则化目标 + 闭式叶权重", "稀疏感知/分布式系统设计"] },
      { year: 2017, name: "LightGBM", who: "Ke et al.（Microsoft）", ref: 12,
        line: "GOSS 采样 + 互斥特征捆绑 + 按叶生长：训练最快提速 20×",
        detail: "GOSS 保留大梯度样本、按比例下采样小梯度样本；EFB 把几乎不同时非零的稀疏特征捆成一列；直方图算法 + leaf-wise 生长（见图 5）。在同精度下比传统 GBDT 快一个数量级。",
        innovations: ["梯度单边采样 GOSS", "互斥特征捆绑 EFB", "直方图 + leaf-wise 生长"] },
      { year: 2018, name: "CatBoost", who: "Prokhorenkova et al.（Yandex）", ref: 13,
        line: "有序提升消除目标泄漏，类别特征原生处理，默认参数即强",
        detail: "指出传统 GBDT 用同一批数据既算梯度又建树会产生“预测偏移”（一种目标泄漏），提出基于随机排列的有序提升与有序目标编码；配合对称（oblivious）树，推理极快、默认参数即有强表现。",
        innovations: ["有序提升 (ordered boosting)", "有序目标统计编码类别", "对称树"] },
    ],
  },
  {
    era: "反思与新前沿 · 2022–2026",
    items: [
      { year: 2022, name: "两篇基准论文", who: "Shwartz-Ziv & Armon；Grinsztajn et al.", ref: 14,
        line: "系统证据：中等规模表格数据上，树集成仍胜过深度学习",
        detail: "前者发现各深度表格模型在自家论文数据集之外普遍不敌 XGBoost 且更难调参；后者用 45 个数据集的大规模基准确认树的统治，并给出三个归纳偏置解释：对无信息特征鲁棒、保持数据方向性、易学不规则函数。",
        innovations: ["公平基准方法论", "归纳偏置解释", "“DL 补树”混合集成"] },
      { year: 2025, name: "TabPFN v2", who: "Hollmann et al.（Nature）", ref: 16,
        line: "在 1 亿+合成数据集上预训练的 Transformer，一次前向超过调参 4 小时的 GBDT",
        detail: "表格基础模型（TFM）：在海量合成因果任务上元训练，推理时把整个训练集放进上下文做一次前向（in-context learning），≤1 万样本任务上全面超越调参后的 CatBoost/XGBoost，速度快约 5000 倍，且自带校准的不确定性。树模型 60 年来第一次在其主场被稳定击败。",
        innovations: ["先验拟合网络 PFN", "行×列双向注意力", "免训练的摊销贝叶斯推断"] },
      { year: 2026, name: "TFM 竞赛时代", who: "TabPFN-2.5 / TabICL v2 / Mitra …", ref: 18,
        line: "TabArena 榜首已全是基础模型；GBDT 守住成本与大数据防线",
        detail: "TabPFN-2.5 扩展到 5 万样本×2000 特征，对默认 XGBoost 胜率 100%，追平 4 小时 AutoGluon 集成；TabICL 扩到 50 万样本。TabArena 上最强 GBDT 落后榜首约 240 Elo——但它在 CPU 上运行、成本低一个量级，大数据、低延迟与强解释场景仍是树的主场。",
        innovations: ["规模扩展（行/列/回归）", "真实数据继续预训练", "活基准 TabArena"] },
    ],
  },
];

export function Timeline() {
  const [open, setOpen] = useState("1984-CART");
  return (
    <div className="timeline">
      {ERAS.map((e) => (
        <div key={e.era} className="tl-era">
          <div className="tl-era-name">{e.era}</div>
          {e.items.map((it) => {
            const id = `${it.year}-${it.name}`;
            const isOpen = open === id;
            return (
              <div key={id} className={"tl-item" + (isOpen ? " open" : "")}>
                <button className="tl-head" onClick={() => setOpen(isOpen ? null : id)}
                  aria-expanded={isOpen}>
                  <span className="tl-year">{it.year}</span>
                  <span className="tl-name">{it.name}</span>
                  <span className="tl-line">{it.line}</span>
                  <span className="tl-toggle">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && (
                  <div className="tl-body">
                    <p><span className="tl-who">{it.who}</span> {it.detail} <sup className="cite">[{it.ref}]</sup></p>
                    <div className="tl-tags">{it.innovations.map((v) => <span key={v}>{v}</span>)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---------------- 图 5 · level-wise vs leaf-wise 生长动画 ----------------
function simulateGrowth(leafWise, budget) {
  // 每个节点一个确定性“增益”；每步分裂一个叶子：level-wise 按 BFS，leaf-wise 挑增益最大的叶子。
  const r = rng(5);
  const gain = new Map([[1, 1]]);
  const g = (id) => {
    if (!gain.has(id)) gain.set(id, gain.get(id >> 1) * (0.35 + r() * 0.6));
    return gain.get(id);
  };
  let leaves = [1];
  const order = [];
  for (let k = 0; k < budget; k++) {
    let pick;
    // BFS 序（最小编号叶子）= level-wise；最大增益叶子 = leaf-wise
    pick = leafWise ? leaves.reduce((a, b) => (g(b) > g(a) ? b : a)) : Math.min(...leaves);
    order.push(pick);
    leaves = leaves.filter((l) => l !== pick).concat([pick * 2, pick * 2 + 1]);
    g(pick * 2); g(pick * 2 + 1);
  }
  return { order, finalLeaves: leaves };
}

function GrowthTree({ leafWise, step, budget, title, color }) {
  const sim = useMemo(() => simulateGrowth(leafWise, budget), [leafWise, budget]);
  const splitSet = new Set(sim.order.slice(0, step));
  // 最终形态的全部节点，按叶序布局
  const nodes = useMemo(() => {
    const all = new Set([1]);
    for (const id of sim.order) { all.add(id * 2); all.add(id * 2 + 1); }
    const list = [...all].sort((a, b) => a - b);
    const leaves = list.filter((id) => !all.has(id * 2));
    let i = 0;
    const xpos = new Map();
    const assign = (id) => {
      if (!all.has(id * 2)) { xpos.set(id, i++); return xpos.get(id); }
      const x = (assign(id * 2) + assign(id * 2 + 1)) / 2;
      xpos.set(id, x);
      return x;
    };
    assign(1);
    const maxD = Math.max(...list.map((id) => Math.floor(Math.log2(id))));
    return { list, xpos, nLeaves: leaves.length, maxD, all };
  }, [sim]);

  const W = 430, H = 40 + (nodes.maxD + 1) * 42;
  const sx = scaleLinear([-0.5, nodes.nLeaves - 0.5], [16, W - 16]);
  const sy = (d) => 22 + d * 42;
  const visible = (id) => id === 1 || splitSet.has(id >> 1);
  const isVisible = (id) => {
    // 节点可见 ⟺ 它是根，或其父已分裂且父可见
    let cur = id;
    while (cur > 1) {
      if (!splitSet.has(cur >> 1)) return false;
      cur = cur >> 1;
    }
    return true;
  };

  return (
    <div className="growth-tree">
      <div className="growth-title" style={{ color }}>{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        {nodes.list.map((id) => {
          if (id === 1 || !isVisible(id)) return null;
          const p = id >> 1;
          const d = Math.floor(Math.log2(id));
          return (
            <line key={"l" + id} x1={sx(nodes.xpos.get(p))} y1={sy(d - 1)} x2={sx(nodes.xpos.get(id))} y2={sy(d)}
              stroke={INK.axis} strokeWidth="1.2" />
          );
        })}
        {nodes.list.map((id) => {
          if (!isVisible(id)) return null;
          const d = Math.floor(Math.log2(id));
          const split = splitSet.has(id);
          return (
            <circle key={id} cx={sx(nodes.xpos.get(id))} cy={sy(d)} r={split ? 6 : 5}
              fill={split ? color : "#fcfcfb"} stroke={split ? color : INK.muted} strokeWidth="1.5" />
          );
        })}
      </svg>
    </div>
  );
}

export function GrowthAnim() {
  const BUDGET = 14;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setStep((s) => (s + 1) % (BUDGET + 6)), 620);
    return () => clearInterval(t);
  }, [playing]);
  const k = Math.min(step, BUDGET);
  return (
    <div className="lab">
      <div className="controls">
        <button className="btn" onClick={() => setPlaying((p) => !p)}>{playing ? "⏸ 暂停" : "▶ 播放"}</button>
        <span className="ctl-label">相同的分裂预算：<b>{k} / {BUDGET}</b> 次分裂</span>
      </div>
      <div className="lab-row">
        <GrowthTree leafWise={false} step={k} budget={BUDGET} color={COLORS[0]}
          title="level-wise（XGBoost 默认）：逐层展开，树形对称、易并行" />
        <GrowthTree leafWise={true} step={k} budget={BUDGET} color={COLORS[2]}
          title="leaf-wise（LightGBM）：永远分裂增益最大的叶子，同预算损失降得更快" />
      </div>
      <p className="stat-note">
        同样 {BUDGET} 次分裂：leaf-wise 长出更深、不对称的树，把预算集中在“最值得切”的区域，
        因而同复杂度下拟合更强——代价是小数据上更易过拟合，需要 max_depth / num_leaves 约束。
      </p>
    </div>
  );
}

// ---------------- 图 6 · 基准对比（真实发表数字） ----------------
export function BenchFig() {
  const groups = [
    { label: "默认参数", tab: 0.939, cat: 0.752 },
    { label: "调参后", tab: 0.952, cat: 0.822 },
  ];
  const W = 460, H = 250, M = { l: 56, r: 14, t: 16, b: 40 };
  const w = W - M.l - M.r, h = H - M.t - M.b;
  const sy = scaleLinear([0.5, 1.0], [M.t + h, M.t]);
  const bw = 52, gap = 10;

  const elo = [
    { name: "TabPFN-2.6（基础模型，默认）", v: 1624, color: COLORS[0] },
    { name: "LightGBM（调参 + 集成，最强 GBDT）", v: 1433, color: COLORS[2] },
  ];
  const sx2 = scaleLinear([1300, 1700], [0, 1]);

  return (
    <div className="lab">
      <div className="lab-row">
        <div>
          <div className="plot-wrap" style={{ maxWidth: W }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
              {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((t) => (
                <g key={t}>
                  <line x1={M.l} x2={M.l + w} y1={sy(t)} y2={sy(t)} stroke={INK.grid} />
                  <text x={M.l - 8} y={sy(t) + 3.5} fontSize="11" fill={INK.muted} textAnchor="end">{t.toFixed(1)}</text>
                </g>
              ))}
              {groups.map((g, gi) => {
                const cx = M.l + w * (gi === 0 ? 0.28 : 0.72);
                return (
                  <g key={gi}>
                    <rect x={cx - bw - gap / 2} y={sy(g.tab)} width={bw} height={sy(0.5) - sy(g.tab)} fill={COLORS[0]} rx="4" />
                    <rect x={cx + gap / 2} y={sy(g.cat)} width={bw} height={sy(0.5) - sy(g.cat)} fill={COLORS[2]} rx="4" />
                    <text x={cx - gap / 2 - bw / 2} y={sy(g.tab) - 6} fontSize="11.5" fontWeight="600" fill={INK.primary} textAnchor="middle">{g.tab.toFixed(3)}</text>
                    <text x={cx + gap / 2 + bw / 2} y={sy(g.cat) - 6} fontSize="11.5" fontWeight="600" fill={INK.primary} textAnchor="middle">{g.cat.toFixed(3)}</text>
                    <text x={cx} y={M.t + h + 18} fontSize="11.5" fill={INK.secondary} textAnchor="middle">{g.label}</text>
                  </g>
                );
              })}
              <line x1={M.l} x2={M.l + w} y1={sy(0.5)} y2={sy(0.5)} stroke={INK.axis} />
            </svg>
          </div>
          <div className="legend">
            <span className="legend-item"><span className="legend-swatch" style={{ background: COLORS[0] }} />TabPFN v2（一次前向，2.8 秒）</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: COLORS[2] }} />CatBoost（最强树基线，调参 4 小时）</span>
          </div>
          <p className="fig-sub">归一化 ROC AUC，29 个 ≤1 万样本分类数据集（AutoML Benchmark + CTR23）。Hollmann et al., <i>Nature</i> 2025<sup className="cite">[16]</sup></p>
        </div>
        <div>
          <div className="elo-bars">
            {elo.map((e) => (
              <div key={e.name} className="elo-row">
                <div className="elo-name">{e.name}</div>
                <div className="elo-track">
                  <div className="elo-fill" style={{ width: (sx2(e.v) * 100) + "%", background: e.color }} />
                  <span className="elo-val">{e.v} Elo</span>
                </div>
              </div>
            ))}
          </div>
          <p className="fig-sub">TabArena 活基准（v0.1.4，2026）单模型 Elo：榜首前四名均为表格基础模型，最强 GBDT 约落后 240 Elo（对局期望胜率约 1:4）——但 LightGBM 在 CPU 上运行，推理成本低一个数量级。<sup className="cite">[18]</sup></p>
          <p className="stat-note">
            读法提醒：这不是“树被淘汰”。&gt;10 万样本、低延迟在线推理、强合规解释的场景，GBDT 仍是默认答案；
            被改写的是 “≤5 万样本时该先试什么”。
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------- 参考文献 ----------------
export const REFS = [
  { n: 1, t: "Morgan & Sonquist (1963). Problems in the Analysis of Survey Data, and a Proposal. JASA 58(302).", u: "https://www.jstor.org/stable/3008131" },
  { n: 2, t: "Kass, G. V. (1980). An Exploratory Technique for Investigating Large Quantities of Categorical Data (CHAID). Applied Statistics 29(2).", u: "https://www.jstor.org/stable/2986296" },
  { n: 3, t: "Breiman, Friedman, Olshen & Stone (1984). Classification and Regression Trees. Wadsworth.", u: "https://www.taylorfrancis.com/books/mono/10.1201/9781315139470" },
  { n: 4, t: "Quinlan, J. R. (1986). Induction of Decision Trees. Machine Learning 1, 81–106.", u: "https://link.springer.com/article/10.1007/BF00116251" },
  { n: 5, t: "Quinlan, J. R. (1993). C4.5: Programs for Machine Learning. Morgan Kaufmann.", u: "https://www.sciencedirect.com/book/monograph/9780080500584/c4-5" },
  { n: 6, t: "Breiman, L. (1996). Bagging Predictors. Machine Learning 24, 123–140.", u: "https://www.stat.berkeley.edu/~breiman/bagging.pdf" },
  { n: 7, t: "Freund & Schapire (1997). A Decision-Theoretic Generalization of On-Line Learning and an Application to Boosting. JCSS 55(1).", u: "https://www.sciencedirect.com/science/article/pii/S002200009791504X" },
  { n: 8, t: "Breiman, L. (2001). Random Forests. Machine Learning 45, 5–32.", u: "https://www.stat.berkeley.edu/~breiman/randomforest2001.pdf" },
  { n: 9, t: "Friedman, J. H. (2001). Greedy Function Approximation: A Gradient Boosting Machine. Annals of Statistics 29(5).", u: "https://projecteuclid.org/journals/annals-of-statistics/volume-29/issue-5/Greedy-function-approximation-A-gradient-boosting-machine/10.1214/aos/1013203451.short" },
  { n: 10, t: "Geurts, Ernst & Wehenkel (2006). Extremely Randomized Trees. Machine Learning 63, 3–42.", u: "https://link.springer.com/article/10.1007/s10994-006-6226-1" },
  { n: 11, t: "Chen & Guestrin (2016). XGBoost: A Scalable Tree Boosting System. KDD 2016. arXiv:1603.02754.", u: "https://arxiv.org/abs/1603.02754" },
  { n: 12, t: "Ke et al. (2017). LightGBM: A Highly Efficient Gradient Boosting Decision Tree. NeurIPS 2017.", u: "https://proceedings.neurips.cc/paper/6907-lightgbm-a-highly-efficient-gradient-boosting-decision-tree.pdf" },
  { n: 13, t: "Prokhorenkova et al. (2018). CatBoost: Unbiased Boosting with Categorical Features. NeurIPS 2018. arXiv:1706.09516.", u: "https://arxiv.org/abs/1706.09516" },
  { n: 14, t: "Grinsztajn, Oyallon & Varoquaux (2022). Why Do Tree-Based Models Still Outperform Deep Learning on Typical Tabular Data? NeurIPS 2022 D&B.", u: "https://openreview.net/forum?id=Fp7__phQszn" },
  { n: 15, t: "Shwartz-Ziv & Armon (2022). Tabular Data: Deep Learning Is Not All You Need. Information Fusion 81. arXiv:2106.03253.", u: "https://arxiv.org/abs/2106.03253" },
  { n: 16, t: "Hollmann et al. (2025). Accurate Predictions on Small Data with a Tabular Foundation Model (TabPFN v2). Nature 637, 319–326.", u: "https://www.nature.com/articles/s41586-024-08328-6" },
  { n: 17, t: "Popov, Morozov & Babenko (2019). Neural Oblivious Decision Ensembles (NODE). arXiv:1909.06312.", u: "https://arxiv.org/abs/1909.06312" },
  { n: 18, t: "Prior Labs (2025). TabPFN-2.5: Advancing the State of the Art in Tabular Foundation Models. arXiv:2511.08667；TabArena 排行榜（2026）.", u: "https://arxiv.org/abs/2511.08667" },
  { n: 19, t: "Lundberg et al. (2020). From Local Explanations to Global Understanding with Explainable AI for Trees (TreeSHAP). Nature Machine Intelligence 2, 56–67.", u: "https://www.nature.com/articles/s42256-019-0138-9" },
  { n: 20, t: "Lin, Zhong, Hu, Rudin & Seltzer (2020). Generalized and Scalable Optimal Sparse Decision Trees (GOSDT). ICML 2020. arXiv:2006.08690.", u: "https://arxiv.org/abs/2006.08690" },
  { n: 21, t: "Duan et al. (2020). NGBoost: Natural Gradient Boosting for Probabilistic Prediction. ICML 2020. arXiv:1910.03225.", u: "https://arxiv.org/abs/1910.03225" },
  { n: 22, t: "Hollmann, Müller & Hutter (2023). CAAFE: Context-Aware Automated Feature Engineering with LLMs. NeurIPS 2023. arXiv:2305.03403.", u: "https://arxiv.org/abs/2305.03403" },
  { n: 23, t: "McElfresh et al. (2023). When Do Neural Nets Outperform Boosted Trees on Tabular Data? (TabZilla). NeurIPS 2023 D&B. arXiv:2305.02997.", u: "https://arxiv.org/abs/2305.02997" },
  { n: 24, t: "Marton et al. (2024). GRANDE: Gradient-Based Decision Tree Ensembles for Tabular Data. ICLR 2024. arXiv:2309.17130.", u: "https://arxiv.org/abs/2309.17130" },
  { n: 25, t: "Liu, Ting & Zhou (2008). Isolation Forest. ICDM 2008.", u: "https://ieeexplore.ieee.org/document/4781136" },
];

export function References() {
  return (
    <ol className="refs">
      {REFS.map((r) => (
        <li key={r.n} id={"ref-" + r.n}>
          {r.t} <a href={r.u} target="_blank" rel="noreferrer">{r.u.replace("https://", "")}</a>
        </li>
      ))}
    </ol>
  );
}
