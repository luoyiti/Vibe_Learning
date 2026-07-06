一句话：这是一个把「向 AI 提问学到的知识」沉淀成可检索、可复盘、可独立打开的个人学习系统。

## 它解决什么问题

和 AI 对话时，解释往往散落在聊天记录里：过几天就找不到，也串不成体系。**knowledge-system** 把每次学习固定成一条「知识单元」，同时保留：

1. **耐久正文**（`note.md`）——以后检索、复盘都读它；
2. **自包含产物**（`artifact/`，可选）——HTML、notebook、图等，单独打开也能看懂；
3. **结构化元数据**（`meta.json`）——标题、标签、概念、单元间关系、原始问题等。

核心循环：**提问 → AI 讲解 → 双产出 → 入库 → 索引查询 → 按需复盘**。

## 四层架构

| 层 | 职责 |
|---|---|
| ① Agent 契约 | 四个 Markdown 契约（非独立进程）：学习指导、持久化、全局分析、项目修改 |
| ② 工具层 `ks` | 唯一读写存储的 CLI；校验 schema 后才写入 |
| ③ 存储层 | `notes/` 是唯一事实来源；`index/`、`graph/` 可重建 |
| ④ 展示层 | `ks serve` 本地只读 Web UI（知识手账） |

## 四个 Agent 契约（`agents/`）

- **learning-guide**：回答学习问题，必须产出「自由产物 + 草稿目录」。
- **persistence**：唯一写入者；`ks query` 找相关单元后 `ks ingest` 落盘；不满意可 `ks delete`。
- **global-analysis**：只读复盘，仅调用 `ks query`。
- **project-modification**：唯一能改项目源码/测试/文档的契约。

`AGENTS.md` 是路由器：先判断用户意图属于哪个契约，再按契约执行。

## 一条知识单元长什么样

```
notes/2026-06/20260620-103800--logistic-regression--01KVJ9.../
├── meta.json      # 严格 JSON Schema 校验的元数据信封
├── note.md        # 耐久正文（检索与复盘的文本地基）
├── artifact/      # 可选：自包含 HTML / notebook 等
├── assets/        # 可选：图片、数据
└── source/        # 可选：原始对话留档
```

单元以 **ULID `id`** 标识，不用路径做引用；关系写在 `meta.relations` 里（prerequisite / extends / related 等）。

## 关键不变量（设计地基）

1. **文件即事实来源**——删了 `index/` 也能从 `notes/` 重建。
2. **判断与执行分离**——Agent 不直接改 `notes/`；所有 I/O 走 `ks`。
3. **机器严格 / 人类自由**——只有 `meta.json` 承重墙校验；正文和产物格式自由。
4. **单写者**——只有 persistence 契约通过 `ks ingest` / `ks delete` 写库。

## 常用命令

```bash
ks ingest <draft_dir>    # 校验 + 写入（唯一写入口）
ks query [filters]       # 按 tag/concept/domain/全文检索
ks serve --open          # 本地浏览已学内容
ks validate --all        # 巡检 schema
ks reindex               # 从 notes/ 重建索引
ks graph build           # 占位，尚未实现
```

## 易错点

- 不要手改 `notes/`、`index/`——会破坏单写者与可重建性。
- `ks ingest` 校验失败时**不会写任何文件**；应修草稿 `meta.json` 后重试。
- 知识图谱字段（`concepts` / `relations`）已在采集，但 `graph build` 仍是占位；索引与查询**不依赖**图谱。
