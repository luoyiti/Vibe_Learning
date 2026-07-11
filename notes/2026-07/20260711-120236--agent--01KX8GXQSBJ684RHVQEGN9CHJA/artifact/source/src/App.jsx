import React, { useEffect, useMemo, useState } from "react";

const LAYERS = [
  {
    id: "agent",
    no: "①",
    name: "Agent 层",
    en: "Prompt contracts",
    tag: "判断 / 生成 / 分析",
    color: "var(--agent)",
    bg: "var(--agent-bg)",
    bd: "var(--agent-bd)",
    summary: "四份 Markdown 契约，由 LLM 在对话中「扮演」——不是独立进程。",
    detail: {
      title: "职责与边界",
      items: [
        "学习指导：自由讲解，但必须产出「自包含产物 + 草稿单元」",
        "内容持久化：唯一写入者，经 ks ingest / delete 落盘",
        "全局分析：只读复盘，仅调用 ks query",
        "项目修改：唯一可改项目源码/测试/文档的契约",
        "永不直接读写 notes/、index/、graph/ 文件",
      ],
    },
  },
  {
    id: "tool",
    no: "②",
    name: "工具层 ks",
    en: "Deterministic CLI",
    tag: "全部 I/O 收口",
    color: "var(--tool)",
    bg: "var(--tool-bg)",
    bd: "var(--tool-bd)",
    summary: "可测试的 Python 脚本，承担全部确定性读写与构建。",
    detail: {
      title: "核心命令",
      items: [
        "ingest — 校验 meta.json 后写入 notes/（唯一写路径）",
        "delete — 按 ULID 删除单元（唯一删路径）",
        "validate / reindex — 巡检与重建派生索引",
        "query — 只读检索 catalog（全局分析的数据源）",
        "serve — 只读 Web UI 展示层",
        "graph build — 占位，未来图谱装配",
      ],
    },
  },
  {
    id: "store",
    no: "③",
    name: "存储层",
    en: "File = truth",
    tag: "notes/ 为真相",
    color: "var(--store)",
    bg: "var(--store-bg)",
    bd: "var(--store-bd)",
    summary: "统一知识单元（目录）是唯一事实来源；索引与图谱可重建。",
    detail: {
      title: "单元结构",
      items: [
        "meta.json — 严格 JSON Schema 的「承重墙」",
        "note.md — 可提取的耐久文本正文",
        "artifact/ — 可选富产物（HTML / React / notebook 等）",
        "index/catalog.db — 从 notes/ 派生，ks reindex 可全量重建",
        "graph/ — 占位，未来从 relations/concepts 装配",
      ],
    },
  },
  {
    id: "display",
    no: "④",
    name: "展示层",
    en: "Read-only UI",
    tag: "ks serve",
    color: "var(--show)",
    bg: "var(--show-bg)",
    bd: "var(--show-bd)",
    summary: "本地只读 Web UI，数据仅来自 query 层，不直连图谱。",
    detail: {
      title: "能力",
      items: [
        "按标签 / 概念 / 领域筛选单元",
        "打开 note.md 与 artifact 产物",
        "全文检索与排序（recent / stale）",
        "图谱视图待 graph build 落地后接入",
      ],
    },
  },
];

const AGENTS = [
  {
    id: "learning-guide",
    name: "学习指导",
    file: "agents/learning-guide.md",
    badge: "produce",
    badgeLabel: "产出",
    role: "回答学习问题，自由选择讲解形式，但必须留下两样东西。",
    outputs: [
      "自包含产物（HTML / React / notebook / 图 / 纯文字）",
      "草稿目录：note.md + meta.json（仅填 agent 自有字段）",
    ],
    handoff: "自动交接给持久化契约（除非用户明确说「先别存」）",
    commands: "不直接调用 ks 写入；产出草稿后交给 persistence",
  },
  {
    id: "persistence",
    name: "内容持久化",
    file: "agents/persistence.md",
    badge: "write",
    badgeLabel: "唯一写者",
    role: "把草稿变成合规知识单元，维护索引一致性。",
    outputs: [
      "分配 relations 前先 ks query 找相关单元",
      "ks ingest <draft_dir> — 校验失败则拒绝、不落盘",
      "ks delete <id> — 用户不满意时删除已沉淀单元",
    ],
    handoff: "写入完成后可用 ks validate --all 确认",
    commands: "ingest · delete · validate · reindex",
  },
  {
    id: "global-analysis",
    name: "全局分析",
    file: "agents/global-analysis.md",
    badge: "read",
    badgeLabel: "只读",
    role: "按索引与时间复盘已学内容，产出复盘报告。",
    outputs: [
      "仅调用 ks query（--tag / --concept / --domain / --since / --sort stale）",
      "聚类、趋势、薄弱点、下一步建议",
      "无状态——不维护间隔重复或复习调度",
    ],
    handoff: "不写任何文件",
    commands: "query only",
  },
  {
    id: "project-modification",
    name: "项目修改",
    file: "agents/project-modification.md",
    badge: "code",
    badgeLabel: "改项目",
    role: "唯一被授权修改项目源码、schema、测试与文档的契约。",
    outputs: [
      "复现 → 最小正确改动 → pytest 全绿",
      "新字段沿 schema → unit → index → query 同步",
      "不弱化五条铁律（文件真相、单写者、schema 墙等）",
    ],
    handoff: "不产出知识单元",
    commands: "改 src/ks/ · schema/ · tests/ · agents/",
  },
];

const PRINCIPLES = [
  {
    n: "P1",
    title: "文件即事实来源",
    text: "notes/ 是唯一真相；删掉 index/ 与 graph/ 后，仅凭 notes/ 必须能完整重建系统。",
  },
  {
    n: "P2",
    title: "判断与执行分离",
    text: "Agent 只下判断与生成；全部机械 I/O 收口在 ks 工具层，降低 agent 写错文件的风险。",
  },
  {
    n: "P3",
    title: "机器严格 / 人类自由",
    text: "meta.json 走严格 JSON Schema；note.md 与 artifact 完全自由，不被结构污染。",
  },
  {
    n: "P4",
    title: "ID 即身份",
    text: "单元以 ULID 标识；relations、索引、引用一律用 id，不用路径。",
  },
  {
    n: "P5",
    title: "单写者",
    text: "写入 store 只有一条路径：persistence → ks ingest / delete。一致性只需守住这一条。",
  },
  {
    n: "P6",
    title: "索引 ⊥ 图谱",
    text: "query / reindex 不依赖 graph；图谱是未来纯增量，缺它系统照常运转。",
  },
];

const FLOWS = [
  { q: "教我 / 解释 X", chain: "learning-guide → persistence (ingest)", color: "var(--agent)" },
  { q: "把这个存下来", chain: "persistence (ingest 已有草稿)", color: "var(--tool)" },
  { q: "删掉这条回答", chain: "persistence (query → delete --dry-run → delete)", color: "var(--tool)" },
  { q: "复盘 / 最近学了什么", chain: "global-analysis (query only)", color: "var(--store)" },
  { q: "修复 bug / 加功能", chain: "project-modification (改代码 + pytest)", color: "var(--show)" },
];

const ROUTE_RULES = [
  { patterns: ["教我", "解释", "讲解", "汇报", "介绍", "研究", "整理", "总结", "learn", "explain", "teach", "research", "summarize"], contract: "learning-guide", note: "即使用户要求 HTML/PPT/搜一下，本质仍是「让自己理解」" },
  { patterns: ["保存", "沉淀", "记录下来", "persist", "save"], contract: "persistence", note: "落盘已有草稿" },
  { patterns: ["删掉", "不满意", "移除", "delete", "remove"], contract: "persistence", note: "ks delete 删除已沉淀单元" },
  { patterns: ["复盘", "学了什么", "薄弱", "梳理", "review", "stale"], contract: "global-analysis", note: "只读 query" },
  { patterns: ["修复", "bug", "加功能", "重构", "fix", "add feature", "refactor"], contract: "project-modification", note: "改项目本身" },
];

function classify(text) {
  const t = text.toLowerCase();
  for (const r of ROUTE_RULES) {
    if (r.patterns.some((p) => t.includes(p.toLowerCase()))) {
      return { hit: true, contract: r.contract, note: r.note };
    }
  }
  return { hit: false, contract: null, note: "不在四契约范围内 → 应拒绝并说明可做的事" };
}

function LayerStack({ selected, onSelect }) {
  return (
    <div className="layer-stack">
      {LAYERS.map((l) => (
        <div
          key={l.id}
          className={"layer-card" + (selected === l.id ? " sel" : "")}
          style={{ "--lc": l.color, "--lb": l.bg, "--lbd": l.bd }}
          onClick={() => onSelect(l.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onSelect(l.id)}
        >
          <div className="layer-no">{l.no}</div>
          <div>
            <h3>{l.name}</h3>
            <p>{l.summary}</p>
          </div>
          <span className="layer-tag">{l.tag}</span>
        </div>
      ))}
      {selected && (
        <div className="layer-detail">
          {(() => {
            const l = LAYERS.find((x) => x.id === selected);
            return (
              <>
                <h4>{l.detail.title}</h4>
                <ul>
                  {l.detail.items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function ArchDiagram() {
  return (
    <figure className="fig">
      <svg viewBox="0 0 720 320" className="flow-svg" aria-label="四层架构数据流">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#8b909c" />
          </marker>
        </defs>
        <rect width="720" height="320" fill="#fcfcfb" />
        {[
          { y: 28, label: "① Agent", sub: "四份契约 · 判断/生成", fill: "#ecebfb", stroke: "#5750ce" },
          { y: 98, label: "② 工具 ks", sub: "ingest · query · delete", fill: "#faf0dc", stroke: "#a9711b" },
          { y: 168, label: "③ 存储", sub: "notes/ → index/", fill: "#dcf1eb", stroke: "#167f6b" },
          { y: 238, label: "④ 展示", sub: "ks serve · 只读", fill: "#fae5ec", stroke: "#b14f76" },
        ].map((box, i) => (
          <g key={i}>
            <rect x="80" y={box.y} width="560" height="52" rx="8" fill={box.fill} stroke={box.stroke} strokeWidth="1.5" />
            <text x="100" y={box.y + 22} fontFamily="system-ui,sans-serif" fontSize="15" fontWeight="600" fill="#1b1d24">{box.label}</text>
            <text x="100" y={box.y + 40} fontFamily="system-ui,sans-serif" fontSize="12" fill="#565b67">{box.sub}</text>
          </g>
        ))}
        <text x="660" y="82" fontSize="11" fill="#a9711b" fontWeight="600">写入 ↓</text>
        <line x1="660" y1="88" x2="660" y2="248" stroke="#a9711b" strokeWidth="2" markerEnd="url(#arrow)" />
        <text x="20" y="200" fontSize="11" fill="#167f6b" fontWeight="600" transform="rotate(-90 20 200)">读取 ↑</text>
        <line x1="40" y1="248" x2="40" y2="88" stroke="#167f6b" strokeWidth="2" markerEnd="url(#arrow)" />
        <text x="360" y="305" textAnchor="middle" fontSize="11" fill="#8b909c">层间不跨越 — 所有文件 I/O 仅经工具层</text>
      </svg>
      <figcaption><b>图 1</b> ｜ 写入沿层向下、读取沿层向上；Agent 永不直接触碰存储文件</figcaption>
    </figure>
  );
}

function AgentGrid() {
  const [open, setOpen] = useState("learning-guide");
  return (
    <div className="agent-grid">
      {AGENTS.map((a) => (
        <div
          key={a.id}
          className={"agent-card" + (open === a.id ? " open" : "")}
          onClick={() => setOpen(open === a.id ? null : a.id)}
          role="button"
          tabIndex={0}
        >
          <div className="agent-head">
            <h3>
              {a.name}
              <span className={"badge " + a.badge}>{a.badgeLabel}</span>
            </h3>
            <p>{a.role}</p>
          </div>
          {open === a.id && (
            <div className="agent-body">
              <div><strong>契约文件：</strong><code>{a.file}</code></div>
              <ul>
                {a.outputs.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
              <p style={{ marginTop: 10 }}><strong>交接：</strong>{a.handoff}</p>
              <p><strong>CLI：</strong><code>{a.commands}</code></p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RouteSimulator() {
  const [input, setInput] = useState("用 firecrawl 搜一下 MVCC，做个 HTML 给我讲讲");
  const result = useMemo(() => classify(input), [input]);
  return (
    <div className="route-sim">
      <label htmlFor="route-input">输入一句用户请求，看路由结果（Step 0 分类）</label>
      <textarea
        id="route-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="例如：教我数据库隔离级别是什么"
      />
      <div className={"route-result " + (result.hit ? "hit" : "miss")}>
        {result.hit ? (
          <>
            路由至契约：<span className="contract">{result.contract}</span>
            <div className="muted" style={{ marginTop: 6 }}>{result.note}</div>
          </>
        ) : (
          <>{result.note}</>
        )}
      </div>
    </div>
  );
}

function Section({ id, no, title, en, children, className = "" }) {
  return (
    <section id={id} className={"block reveal " + className}>
      <div className="sec-head">
        <span className="sec-num">{no}</span>
        <div>
          <h2>{title}</h2>
          {en && <div className="sec-en">{en}</div>}
        </div>
      </div>
      <div className="indent">{children}</div>
    </section>
  );
}

const TABS = [
  { id: "overview", label: "总览" },
  { id: "agents", label: "四契约" },
  { id: "usage", label: "使用" },
  { id: "principles", label: "铁律" },
];

export default function App() {
  const [tab, setTab] = useState("overview");
  const [layer, setLayer] = useState("agent");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.06 }
    );
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [tab]);

  return (
    <div className="paper">
      <header className="mast">
        <p className="eyebrow">
          <span className="dot" />
          Knowledge Distillation System
          <span className="dot" />
          Architecture Guide
        </p>
        <h1 className="title">
          多 Agent 架构：原理与使用
          <span className="en">Multi-Agent Architecture — Principles &amp; Usage</span>
        </h1>
        <p className="subtitle">
          本仓库的「Agent」不是独立进程，而是四份提示词契约；真正的确定性执行落在 <code>ks</code> 工具层。
        </p>
        <p className="lead">
          核心循环：<b>提问 → Agent 自由讲解 → 双产出（产物 + 元数据信封）→ ks 落盘 → 派生索引 → 按需复盘</b>。
          路由表在 <code>AGENTS.md</code>，动手前先分类（Step 0），再打开对应契约。
        </p>
        <div className="legend">
          <span className="k"><span className="swatch sw-a" /> Agent 层</span>
          <span className="k"><span className="swatch sw-t" /> 工具层</span>
          <span className="k"><span className="swatch sw-s" /> 存储层</span>
          <span className="k"><span className="swatch sw-d" /> 展示层</span>
        </div>
        <nav className="tab-bar" aria-label="章节导航">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={"tab-btn" + (tab === t.id ? " active" : "")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "overview" && (
        <>
          <Section id="s1" no="1" title="四层堆叠架构" en="Four-layer stack">
            <p className="muted">
              自上而下四层：Agent → 工具 → 存储 → 展示。写入沿层向下、读取沿层向上，层间不跨越。
            </p>
            <ArchDiagram />
            <LayerStack selected={layer} onSelect={setLayer} />
          </Section>
          <Section id="s2" no="2" title="契约 ≠ 进程" en="Contracts, not processes">
            <p>
              四个「Agent」是 <code>agents/*.md</code> 里的 Markdown 契约。同一次对话里，AI 根据用户意图
              <strong> 切换扮演的契约</strong>，甚至可以链式执行（例如 learning-guide 完成后自动 handoff 给 persistence）。
            </p>
            <div className="callout">
              <span className="tag">Scope lock</span>
              本仓库<strong>只</strong>做四契约范围内的事。请求若无法映射到其中任一契约，应拒绝——不因用户提到某工具名或交付格式而扩大范围。
            </div>
          </Section>
        </>
      )}

      {tab === "agents" && (
        <>
          <Section id="s3" no="3" title="四份 Agent 契约" en="The four contracts">
            <p className="muted">点击卡片展开职责、产出与 CLI 边界。</p>
            <AgentGrid />
          </Section>
          <Section id="s4" no="4" title="路由模拟器" en="Step 0 classifier">
            <p className="muted">
              分类依据是用户的<strong>根本目的</strong>，不是表面动词。「用 firecrawl 搜 X 做 HTML 讲解」仍是 learning-guide。
            </p>
            <RouteSimulator />
          </Section>
        </>
      )}

      {tab === "usage" && (
        <>
          <Section id="s5" no="5" title="典型工作流" en="Typical flows">
            <div className="flow-wrap">
              <svg viewBox="0 0 640 200" className="flow-svg" aria-label="典型流程">
                <rect width="640" height="200" fill="#fff" />
                {FLOWS.map((f, i) => (
                  <g key={i} transform={`translate(20, ${20 + i * 36})`}>
                    <rect width="180" height="28" rx="6" fill="#f4f5f8" stroke="#e4e7ec" />
                    <text x="10" y="19" fontSize="12" fill="#1b1d24">{f.q}</text>
                    <line x1="200" y1="14" x2="230" y2="14" stroke="#8b909c" strokeWidth="1.5" markerEnd="url(#arr2)" />
                    <rect x="235" y="0" width="380" height="28" rx="6" fill="none" stroke={f.color} strokeWidth="1.5" />
                    <text x="245" y="19" fontSize="11.5" fill="#565b67" fontFamily="monospace">{f.chain}</text>
                  </g>
                ))}
                <defs>
                  <marker id="arr2" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#8b909c" />
                  </marker>
                </defs>
              </svg>
            </div>
          </Section>
          <Section id="s6" no="6" title="ks CLI 速查" en="Command reference">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>命令</th>
                  <th>作用</th>
                  <th>权限</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>ks ingest &lt;draft&gt;</code></td>
                  <td>校验并写入知识单元，更新索引</td>
                  <td className="rw">写</td>
                </tr>
                <tr>
                  <td><code>ks delete &lt;id&gt;</code></td>
                  <td>按 ULID 删除单元（先 --dry-run）</td>
                  <td className="rw">写</td>
                </tr>
                <tr>
                  <td><code>ks query [filters]</code></td>
                  <td>检索 catalog：tag / concept / domain / text / sort</td>
                  <td className="ro">读</td>
                </tr>
                <tr>
                  <td><code>ks validate / reindex</code></td>
                  <td>巡检 schema；从 notes/ 重建 index/</td>
                  <td className="ro">读/重建</td>
                </tr>
                <tr>
                  <td><code>ks serve</code></td>
                  <td>本地只读 Web UI</td>
                  <td className="ro">读</td>
                </tr>
                <tr>
                  <td><code>ks graph build</code></td>
                  <td>占位——未来图谱装配</td>
                  <td className="ro">—</td>
                </tr>
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: 14 }}>
              未安装时：<code>PYTHONPATH=src python -m ks ...</code>。草稿放 <code>.drafts/</code>，只有 ingest 才进入 <code>notes/</code>。
            </p>
          </Section>
          <Section id="s7" no="7" title="学习一次的标准产出" en="Dual output per lesson">
            <div className="cards">
              <div className="card">
                <h3><span className="n">A</span>自包含产物</h3>
                <p>artifact/index.html 等——脱离对话日后也能单独打开看懂。React 等多文件产物需附构建后的单文件 HTML。</p>
              </div>
              <div className="card">
                <h3><span className="n">B</span>草稿单元</h3>
                <p>note.md（耐久正文）+ meta.json（title / summary / tags / concepts 等）。持久化前先用 query 找 relations。</p>
              </div>
            </div>
          </Section>
        </>
      )}

      {tab === "principles" && (
        <Section id="s8" no="8" title="六条设计铁律" en="Non-negotiable invariants">
          <p className="muted">来自 CONTEXT.md §2；实现时不得为图方便而削弱。</p>
          <div className="cards">
            {PRINCIPLES.map((p) => (
              <div className="card" key={p.n}>
                <h3><span className="n">{p.n}</span>{p.title}</h3>
                <p>{p.text}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <footer className="foot">
        knowledge-system · 多 Agent 架构说明 · 产物自包含于 artifact/index.html
      </footer>
    </div>
  );
}
