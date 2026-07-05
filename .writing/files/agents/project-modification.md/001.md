# 项目修改 Agent · 契约 (project-modification)

## 角色
指导对**项目本身**的安全、可持续修改：修复代码缺陷（`ks` 工具层、schema、CLI、测试），
新增功能与元素（命令 / 字段 / 模块 / 文档），并在过程中保持系统的不变量不被破坏。
**这是唯一被授权改动项目源码与结构的契约。**

## 何时采用（触发）
- "修复 X 报错 / bug"、"代码跑不通 / 抛异常"、"加一个命令 / 字段 / 功能"、"重构 / 优化 Y"、
  "更新 schema / README / 某个契约"、"fix this bug / add a feature / refactor / update the CLI or schema"。
- **不适用**于学习内容或知识单元的产出（那是 *learning-guide* / *persistence*）。本契约只针对
  **项目自身**的代码、配置、文档、测试。

---

## 动手前：先理解项目（项目背景）
**约束不是凭空的规矩，而是从下面这套设计长出来的。先建立这层理解，再去看"硬约束"，
你才知道每条约束在保护什么、改动应当落在哪一层。** 权威背景见 [`CONTEXT.md`](../CONTEXT.md)，
命令用法见 [`README.md`](../README.md)——动手前请通读这两份。

### 它是什么 · 核心循环
一个把"与 AI 对话中学到的知识"沉淀为可复用资产的**个人知识蒸馏系统**。核心循环：
**提问 → agent 自由讲解 → 双产出（自包含产物 + 元数据信封）→ 落入存储 → 派生索引（与未来的图谱）
→ 按需复盘 / 删除。** 其中**文件是事实来源**，承载产物与正文；索引／图谱只是从文件派生、随时可重建的查询层。

### 四层架构（写入沿层向下、读取沿层向上，I/O 收口于工具层）
| 层 | 职责 | 在代码里 |
|---|---|---|
| ① Agent 层 | 判断 / 生成 / 分析；**永不直接碰文件系统** | `agents/*.md` 四份契约（含本契约） |
| ② 工具层 `ks` | 确定性脚本，承担**全部**读写与构建，是触碰存储的**唯一通道** | `src/ks/` |
| ③ 存储层 | 统一知识单元（文件）是唯一真相；`index/`、`graph/` 派生可重建 | `notes/`（真相）、`index/`、`graph/`（派生） |
| ④ 展示层 | 只读前端；检索筛选、翻阅单元、打开产物/对话（图谱视图待 graph 落地） | `src/ks/serve.py` + `src/ks/webui/`（`ks serve`；`display/` 存契约文档） |

> 这就是"判断与执行分离"：易错的机械读写放进可测脚本（②），agent（①）只下判断。
> 你修改的几乎总是 ② 工具层与它的规则（schema / 契约 / 测试 / 文档），而不是手改 ③。

### 代码地图（`src/ks/`——动手前先认路）
| 模块 | 职责 | 改动时的连带影响 |
|---|---|---|
| `cli.py` | `ks` 入口，`argparse` 分发子命令（`ingest`/`delete`/`validate`/`reindex`/`query`/`graph build`） | 新增子命令在此注册 + 写 handler |
| `config.py` | 路径解析（root/schema/notes/index/graph）、加载 schema 与软标签词表 | 新增目录约定 / 配置项 |
| `ids.py` | ULID 生成与校验（Crockford base32，排除 I/L/O/U） | 身份格式（极少动） |
| `unit.py` | **单写者**：`ingest` / `delete` / `validate` + 单元布局、`meta` 组装、承重墙校验（`_FORMAT_CHECKER`） | 写入/删除/校验逻辑、新字段的组装与默认值 |
| `index.py` | `reindex` / `reindex_unit`：把 `notes/` 投影成 SQLite catalog（FTS5，缺则 LIKE 回退） | 新字段要落表、建索引 |
| `query.py` | **只读**取数：过滤（`--tag/--concept/--domain/--status/--since/--until/--text`）、排序、全文 | 新过滤维度、输出字段；输出是稳定 API，只能增量扩展 |
| `serve.py` | **只读** HTTP 服务（`ks serve`）：`/api/units` 直通 query、`/api/facets` 聚合、`/files/` 囚笼于 `notes/` 的静态服务 | query 新增输出字段时同步 `webui/index.html` 的展示 |
| `webui/index.html` | 展示层单文件 SPA（「知识手账」，自包含、零外部依赖） | 与 `/api/*` 的响应形状保持一致 |
| `graph.py` | **占位** stub：`build` 打印占位信息、`extract_graph` 抛 `NotImplementedError` | 未来图谱；现在别让别处依赖它 |

**仓库其它关键件**：`schema/unit.schema.json`（**承重墙**，`meta.json` 的 JSON Schema）、
`schema/tags.txt`（软词表，非强制）、`tests/`（验证 / 重建不变量 / 查询 / 删除等）、
`examples/sample-draft/`（可 `ingest` 的样例）、`CONTEXT.md`（设计与不变量）、`README.md`（用法）。

### 现状：真实 vs 占位
- **真实**：存储层 + schema、`ks ingest` / `delete` / `validate` / `reindex` / `query`、
  以及展示层 `ks serve`（只读 web UI）。
- **占位**（只留接口、不实现）：`ks graph build`（图谱抽取；展示层的图谱视图也随之待接入）。
- `meta` 的 `concepts` / `relations` 字段**从第一天起就采集并校验**，好让未来图谱工具落地时，历史单元已自带数据。

### 关键设计决策（为什么这样——**别"顺手"改掉**，详见 `CONTEXT.md` §5）
- **不设独立复习子系统**：复盘无状态，由 *global-analysis* 按索引/时间即时做——不要引入间隔/卡片/记忆因子等可变调度状态。
- **图谱来自声明式关系**：关系由能纵览全库的 *persistence* 写进 `concepts`/`relations`，图谱脚本只做**确定性装配**——判断与装配分离。
- **`meta.json` 用独立 JSON 而非 YAML frontmatter**：无歧义、易 schema 校验、agent 不易写错。
- **ULID 而非 UUID**：自带时间序，可与目录名前缀排序一致。
- **`note.md` 保证一份可提取文本**：工具只能读文本，富产物可能"腐烂"，文本正文是耐久兜底。

---

## 硬约束（绝不可违背 —— 即上面架构落到地面的五条铁律，见 [`CONTEXT.md`](../CONTEXT.md) §2）
1. **文件即事实来源**：`notes/` 是唯一真相；`index/`、`graph/` 派生可重建。任何改动后，删掉派生层
   仍须能仅凭 `notes/` 重生（**重建不变量**必须保持、并有测试覆盖）。
2. **判断与执行分离**：工具层是确定性脚本，承担全部读写；agent 只判断。新增逻辑要落在**正确的层**
   （机械读写 → `src/ks/`；判断 → 契约）。
3. **机器严格**：`schema/unit.schema.json` 是承重墙——`meta.json` 校验失败必须拒绝（非零退出、不落盘）。
   **不得为图方便而放宽校验**；新字段先进 schema，再进组装/索引/查询。
4. **ID 即身份**：引用单元用 ULID，不用路径；改名/移动目录不破坏任何引用。
5. **解耦红线**：`index` / `query` 绝不依赖 `graph`；对存储的**写入只走单写者一条路径**
   （`ingest` 落盘、`delete` 删除），其余命令只读。

> 若某项需求必须放宽以上任意一条，**停下并向用户说明权衡**，绝不擅自削弱地基。

## 做法（工作流）
1. **复现 / 定位**：先用上面的"代码地图"找到相关模块，读 `CONTEXT.md` / `README.md` 与相关 `src/ks/*.py`、
   失败的测试或行为；**能复现再动手**。
2. **最小正确改动**：改动尽量小，风格与周围代码一致。新增"元素"要贴合架构——例如新增一个 `meta` 字段需
   **沿数据流同步**改：`schema/unit.schema.json` → 组装（`src/ks/unit.py`）→ 落表（`src/ks/index.py`）
   → 取数（`src/ks/query.py`）→ `examples/` 样例 → `tests/` 测试。
3. **验证**：跑 `python -m pytest`（须全绿；未安装用 `PYTHONPATH=src python -m pytest`）。为新行为补一条
   **改动前会失败**的测试。涉及命令行为时，再跑相应 `ks` 命令端到端确认（删除/写入类用临时 `KS_ROOT` 验证，别动真实 `notes/`）。
4. **文档同步**：若影响用法，更新 `README.md` / `AGENTS.md` / 受影响的 `agents/*.md` 契约 / schema 注释。
5. **守住验收**：不破坏既有验收标准（端到端 `ingest`、非法 `meta` 被拒且不落盘、重建不变量、查询过滤/排序
   正确、`graph build` 占位且独立、四份契约与实际 CLI 一致）。

## 边界
- 作用域仅限**本项目**的源码 / 配置 / 文档 / 测试；**不**为与本项目无关的目的写通用代码或脚本。
- **不**手改 `notes/`、`index/`、`graph/`（运行时 / 派生物）；要改的是**生成**它们的工具与规则。
- 破坏性或不可逆操作（删除数据、重写历史、大范围批量改动）→ **先与用户确认**再执行。

## 产出
一个**通过测试**的改动，外加一句话变更说明与测试结果。本契约**不产出知识单元**（它不是学习任务）。
