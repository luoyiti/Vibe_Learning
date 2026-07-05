import React, { useEffect, useMemo } from "react";
import { rng } from "./ml.js";
import { CartLab, ForestLab, BoostLab } from "./labs.jsx";
import { Timeline, GrowthAnim, BenchFig, References } from "./sections.jsx";

const Cite = ({ n }) => (
  <sup className="cite">
    {[].concat(n).map((k, i) => (
      <React.Fragment key={k}>{i > 0 && ","}<a href={"#ref-" + k}>[{k}]</a></React.Fragment>
    ))}
  </sup>
);

// 头图：一次真实的“递归划分”生成艺术——一个平面被种子化地反复切分。
function HeroArt() {
  const rects = useMemo(() => {
    const r = rng(20260704);
    const out = [];
    const split = (x, y, w, h, d) => {
      if (d === 0 || w < 60 || h < 46) {
        out.push({ x, y, w, h, tint: r() });
        return;
      }
      const vertical = w / h > 1.15 ? true : h / w > 1.15 ? false : r() > 0.5;
      const t = 0.3 + r() * 0.4;
      if (vertical) {
        split(x, y, w * t, h, d - 1);
        split(x + w * t, y, w * (1 - t), h, d - 1);
      } else {
        split(x, y, w, h * t, d - 1);
        split(x, y + h * t, w, h * (1 - t), d - 1);
      }
    };
    split(0, 0, 1200, 300, 6);
    return out;
  }, []);
  const palette = ["#2a78d6", "#1baf7a", "#eda100"];
  return (
    <svg viewBox="0 0 1200 300" preserveAspectRatio="xMidYMid slice" className="hero-art" aria-hidden="true">
      <rect width="1200" height="300" fill="#f4f3ef" />
      {rects.map((q, i) => (
        <rect key={i} x={q.x} y={q.y} width={q.w} height={q.h}
          fill={q.tint < 0.24 ? palette[Math.floor(q.tint * 12.5) % 3] : "#fcfcfb"}
          fillOpacity={q.tint < 0.24 ? 0.16 + q.tint * 0.5 : 1}
          stroke="#0b0b0b" strokeOpacity="0.5" strokeWidth="1" />
      ))}
    </svg>
  );
}

function Section({ id, no, title, children }) {
  return (
    <section id={id} className="reveal">
      <h2><span className="sec-no">{no}</span>{title}</h2>
      {children}
    </section>
  );
}

function Figure({ no, caption, children }) {
  return (
    <figure className="fig">
      {children}
      <figcaption><b>图 {no}</b> ｜ {caption}</figcaption>
    </figure>
  );
}

export default function App() {
  useEffect(() => {
    const obs = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.06 }
    );
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="paper">
      <div className="masthead">
        <span>知识蒸馏系统 · 学习单元</span>
        <span>树模型专题 · 2026 年 7 月</span>
      </div>

      <header className="hero">
        <HeroArt />
        <div className="hero-text">
          <p className="kicker">A LIVING SURVEY · 可交互综述</p>
          <h1>树模型六十年</h1>
          <p className="subtitle">从递归划分到表格基础模型：历史发展历程与最新前沿方向</p>
        </div>
      </header>

      <div className="abstract reveal">
        <h3>摘要</h3>
        <p>
          树模型是机器学习中寿命最长的思想之一：<b>用一连串简单的阈值判断，把输入空间递归地切成局部同质的区域</b>。
          本文沿三条主线展开：(i) <b>历史</b>——从 1963 年调查统计中的 AID，经 CART/ID3/C4.5 的单树成熟期、
          Bagging/AdaBoost/随机森林/GBM 的集成革命，到 XGBoost/LightGBM/CatBoost 的工业化十年；
          (ii) <b>证据</b>——为什么在异质的表格数据上，树集成压制了深度学习二十年；
          (iii) <b>前沿</b>——2023–2026 年，以 TabPFN 为代表的表格基础模型首次在树的主场将其稳定击败，
          以及可微树、最优稀疏树、概率化 GBDT、树×LLM 等方向。
          文中图 2–4 不是示意图：它们在你的浏览器里<b>用真实算法在真实数据上现场训练</b>
          （Fisher 的 Iris 150 条样本、Auto MPG 392 条样本），所有超参数可拖动验证。
        </p>
        <p className="keywords"><b>关键词：</b>决策树 · CART · 随机森林 · 梯度提升 · XGBoost · 表格数据 · 归纳偏置 · TabPFN · 表格基础模型</p>
      </div>

      <Section id="s1" no="1" title="六十年年表：三次范式转移">
        <p>
          树模型的历史可以读成三次范式转移：<b>单棵树</b>（1963–1993，追求一棵更好的树）、
          <b>树的集成</b>（1995–2018，接受单树的不完美，用统计聚合取胜）、
          <b>被挑战与再出发</b>（2022–，树集成成为衡量一切新方法的基线，并第一次遇到真正的对手）。
          点击任意条目展开细节与关键创新。
        </p>
        <Figure no="1" caption="交互年表：1963–2026 年 16 个里程碑，按三个时代分组。点击展开算法细节与创新点。">
          <Timeline />
        </Figure>
      </Section>

      <Section id="s2" no="2" title="一棵树如何长成：CART 实验台">
        <p>
          CART<Cite n={3} /> 把“长树”定义为一个贪心优化：在每个节点穷举所有特征×所有阈值，
          选出让子节点<b>基尼不纯度</b> <i>G</i> = 1 − Σ<sub>k</sub> p<sub>k</sub>²
          加权下降最多的二叉切分，递归直到触发停止条件；ID3/C4.5<Cite n={[4, 5]} /> 则用熵与信息增益（率）扮演同一角色。
          下面是一个完整的 CART 实现（穷举切分 + 基尼准则），在 Fisher 1936 年的 Iris 数据集上现场训练——
          150 条真实测量数据，70/30 训练测试划分。
        </p>
        <Figure no="2" caption="CART 实验台（真实算法 · 真实数据）。左：二维特征平面上的决策边界（底色为模型预测区域）；下：当前这棵树的完整结构，内部节点标注切分条件与基尼值。拖动 max_depth 与 min_leaf 观察欠拟合→过拟合的完整过程。">
          <CartLab />
        </Figure>
        <p>
          注意树的两个天性：边界永远<b>与坐标轴平行</b>（每次只切一个特征），且模型是<b>分段常数</b>——
          这既是它对单调变换免疫、无需归一化的原因，也是它难以外推、难学平滑函数的原因。
          单棵树的另一个致命弱点是<b>高方差</b>：训练数据轻微扰动就会改变切分序列，让整棵树面目全非。
          这个弱点恰恰是下一章的起点。
        </p>
      </Section>

      <Section id="s3" no="3" title="集成革命：方差、偏差与两条路线">
        <p>
          1990 年代的两大发明沿相反方向解决单树的缺陷。<b>Bagging</b><Cite n={6} />（Breiman, 1996）
          攻方差：对训练集自助重采样，训练多棵互相略有不同的深树再投票——不稳定性越强的学习器获益越大。
          <b>Boosting</b><Cite n={7} />（AdaBoost, Freund & Schapire）攻偏差：顺序训练弱学习器，
          每轮重加权、盯住此前分错的样本。<b>随机森林</b><Cite n={8} />（2001）给 Bagging 加上第二重随机性——
          每次分裂只在随机特征子集中选优，让树相互去相关，并用袋外（OOB）样本免费估计泛化误差。
        </p>
        <Figure no="3" caption="随机森林实验台（真实算法 · Iris 全集 150 样本）。左：前 m 棵树多数投票的决策边界；右：OOB 误差随树数下降的实测曲线（黄色竖线为当前 m）。">
          <ForestLab />
        </Figure>
      </Section>

      <Section id="s4" no="4" title="梯度提升与工业化十年">
        <p>
          Friedman 2001 年的洞察<Cite n={9} />是把 boosting 重写成<b>函数空间中的梯度下降</b>：
          对任意可微损失 L，第 m 轮用一棵小回归树 h<sub>m</sub> 拟合当前负梯度（平方损失下即残差 y − F<sub>m−1</sub>），
          然后 F<sub>m</sub> = F<sub>m−1</sub> + ν·h<sub>m</sub>，学习率 ν 即“收缩”。
          下图在真实的 Auto MPG 数据（392 辆汽车的马力→油耗）上逐轮重放这一算法。
        </p>
        <Figure no="4" caption="梯度提升实验台（真实算法 · Auto MPG 数据，75/25 训练测试划分）。左：集成预测曲线从全局均值逐轮长出非线性；右上：当前残差与下一棵树学到的形状；右下：训练/测试 MSE 随迭代的演化。">
          <BoostLab />
        </Figure>
        <p>
          2014–2018 年，三个系统把这套数学变成了工业基础设施，各自的核心创新正好构成一张对照表：
        </p>
        <div className="table-scroll">
          <table className="cmp">
            <thead>
              <tr><th></th><th>XGBoost 2016<Cite n={11} /></th><th>LightGBM 2017<Cite n={12} /></th><th>CatBoost 2018<Cite n={13} /></th></tr>
            </thead>
            <tbody>
              <tr><th>优化</th><td>二阶泰勒展开，叶权重有闭式解；对叶数/权重显式 L1/L2 正则</td><td>直方图分裂 + GOSS：保大梯度样本、降采样小梯度样本</td><td>有序提升：按随机排列只用“过去”的样本算梯度，消除预测偏移</td></tr>
              <tr><th>树形</th><td>level-wise 逐层生长（见图 5 左）</td><td>leaf-wise 最大增益优先（见图 5 右）</td><td>oblivious 对称树，同层同一切分，推理极快</td></tr>
              <tr><th>数据面</th><td>稀疏感知：缺失值学习“默认方向”</td><td>EFB 把互斥稀疏特征捆成一列</td><td>类别特征原生：有序目标统计编码</td></tr>
              <tr><th>一句话</th><td>正则化 + 系统工程，Kaggle 时代王者</td><td>同精度最快提速 20×，大数据首选</td><td>类别多、不想调参时的默认答案</td></tr>
            </tbody>
          </table>
        </div>
        <Figure no="5" caption="同样的分裂预算，两种生长策略：level-wise 对称展开（XGBoost 默认）vs leaf-wise 永远切增益最大的叶子（LightGBM）。">
          <GrowthAnim />
        </Figure>
      </Section>

      <Section id="s5" no="5" title="为什么树在表格数据上统治了二十年">
        <p>
          2022 年的两项系统研究给出了定量答案。Shwartz-Ziv & Armon<Cite n={15} /> 发现各深度表格模型
          离开自家论文的数据集就普遍不敌 XGBoost，且调参成本更高；Grinsztajn et al.<Cite n={14} />
          在 45 个数据集的基准上确认：中等规模（~1 万样本）表格数据上树集成仍是 SOTA，并把原因归结为
          <b>三个归纳偏置的错配</b>——
        </p>
        <ol className="claims">
          <li><b>对无信息特征鲁棒。</b>表格数据充满无关列；树的切分搜索天然忽略它们，而 MLP 类模型会被拖累。</li>
          <li><b>保持数据的方向性。</b>表格的行列没有空间/序列结构可供卷积或注意力利用；旋转不变的 NN 反而抹掉了单个特征的语义。</li>
          <li><b>易学不规则函数。</b>真实表格目标常是分段、跳变的；分段常数的树天生擅长，平滑偏置的 NN 天生吃亏。</li>
        </ol>
        <p>
          再加上工程现实——默认参数即强、CPU 可训、TreeSHAP 可解释<Cite n={19} />——
          “表格数据先上 GBDT”成了二十年的行业铁律。TabZilla 等后续大基准<Cite n={23} />细化了边界：
          数据越大、越平滑，NN 越有机会；但在最常见的中小异质表格上，树稳赢。
        </p>
      </Section>

      <Section id="s6" no="6" title="前沿：2023–2026，铁律松动之处">
        <h3>6.1 表格基础模型：树的主场首次失守</h3>
        <p>
          TabPFN v2<Cite n={16} />（Hollmann et al., <i>Nature</i> 2025）代表了范式级变化：
          在 1.3 亿个由随机因果图生成的<b>合成数据集</b>上预训练一个行×列双向注意力的 Transformer，
          推理时把整个训练集放进上下文，<b>一次前向完成“训练+预测”</b>（in-context learning，无梯度下降）。
          在 ≤1 万样本的基准上，它以 2.8 秒超过调参 4 小时的 CatBoost/XGBoost（提速约 5000×），且自带校准的不确定性。
          2025–2026 年该方向爆发：TabPFN-2.5 扩到 5 万样本×2000 特征、对默认 XGBoost 胜率 100%<Cite n={18} />；
          TabICL 扩到 50 万样本；TabArena 活基准的单模型榜首已全部是基础模型。
        </p>
        <Figure no="6" caption="两个真实发表的对比。左：Nature 2025 报告的归一化 ROC AUC（≤1 万样本分类任务）；右：TabArena 活基准（2026）单模型 Elo。">
          <BenchFig />
        </Figure>
        <h3>6.2 可微的树：让树进入梯度世界</h3>
        <p>
          NODE<Cite n={17} />（2019）把 oblivious 树软化成可反向传播的模块并层层堆叠；
          GRANDE<Cite n={24} />（ICLR 2024）用端到端梯度下降直接训练硬轴对齐的树集成，
          在 19 个二分类数据集上超过 XGBoost 与 CatBoost。动机：保留树的归纳偏置，
          换取 GPU 加速、与深度网络/多模态管线的可组合性。
        </p>
        <h3>6.3 可解释性：从事后归因到最优稀疏树</h3>
        <p>
          TreeSHAP<Cite n={19} /> 利用树结构在多项式时间内精确计算 Shapley 值，成为金融、医疗等
          受监管行业的事实标准；Rudin 学派的 GOSDT<Cite n={20} /> 则反其道而行——用分支定界
          直接求<b>全局最优</b>的稀疏小树，在许多任务上以十几个节点逼近黑盒集成的精度，主张“高风险决策用天生可解释的模型”。
        </p>
        <h3>6.4 不确定性：从点预测到分布</h3>
        <p>
          NGBoost<Cite n={21} /> 让 GBDT 输出整个概率分布的参数（以自然梯度训练），
          分位数回归森林与 conformal 方法给树预测配上可保证覆盖率的区间——
          这也是 TabPFN 天生带校准不确定性形成压力的方向。
        </p>
        <h3>6.5 树 × 大语言模型</h3>
        <p>
          CAAFE<Cite n={22} /> 让 LLM 读数据集的语义描述、自动生成候选特征，再交给树模型/TabPFN 验证收益——
          LLM 贡献世界知识与特征语义，树贡献可靠的表格归纳偏置。加上 Isolation Forest<Cite n={25} />
          在异常检测、LambdaMART 在排序中的长期地位，树的思想仍在不断进入新领域。
        </p>
      </Section>

      <Section id="s7" no="7" title="结语：2026 年的选型直觉">
        <p>
          六十年的曲线可以压缩成三句话：<b>树赢在归纳偏置与工程性价比；集成把这份偏置的方差抹平；
          基础模型正在用“元学习到的先验”蚕食它最后的精度优势。</b>
          实践直觉：≤5 万样本先试 TabPFN 系（免调参、带不确定性）；大数据、低延迟、CPU 预算、
          强解释合规场景，GBDT 三件套仍是默认答案；两者的集成常常还能再涨一截<Cite n={15} />。
          树没有被淘汰——它变成了所有新方法必须击败的那条基线，而这正是一个思想最体面的晚年。
        </p>
      </Section>

      <Section id="refs" no="※" title="参考文献">
        <References />
      </Section>

      <footer className="foot">
        知识蒸馏系统 · 本单元由 learning-guide 契约产出，交互实验中的算法（CART / 随机森林 / 梯度提升）
        为浏览器内的完整实现，数据为真实数据集（Iris 150 条，UCI；Auto MPG 392 条，UCI）。
      </footer>
    </div>
  );
}
