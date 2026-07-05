# 展示层（④）· 已实现：`ks serve`

> 本目录**不含代码**——展示层的实现在 [`src/ks/serve.py`](../src/ks/serve.py)（只读
> HTTP 服务）与 [`src/ks/webui/index.html`](../src/ks/webui/index.html)（自包含单文件
> SPA「知识手账」）。这里记录它的契约与端点,供后续修改对齐。

## 定位

展示层是**只读前端**:浏览、检索、筛选所有已沉淀的知识单元,并可点开每个单元的
自包含产物与(若记录了)原始对话。它从不写存储,也不旁路工具层。

```bash
ks reindex && ks serve --open        # 默认 http://127.0.0.1:8765
```

## 端点

| 端点 | 说明 |
|---|---|
| `GET /` | 单文件 SPA(内联 CSS/JS,零外部请求,系统字体) |
| `GET /api/units` | **直通 `ks query`**:参数 `tag`/`concept`(可重复,AND)、`domain`、`status`、`since`、`until`、`text`、`sort`、`limit`;响应与 `ks query` 的 JSON 数组逐字节一致 |
| `GET /api/facets` | 筛选侧栏聚合:各 tag/domain/concept/status 计数、`created_at` 范围、`fts` 是否可用 |
| `GET /files/<根相对路径>` | 静态文件(产物/对话/资产),**严格限制在 `notes/` 之下**;路径穿越、绝对路径、`notes/` 之外一律 403;只支持 GET/HEAD |
| 其他方法 | POST/PUT/DELETE/PATCH → 405(`Allow: GET, HEAD`) |

产物 URL 由客户端拼接:`/files/{path}/{artifact.entry}`(两者都来自 query 记录)。
对话:`source.transcript` 是 `http(s)` URL 时直接外链;否则视为单元目录内的相对路
径,客户端先 HEAD 探测,文件存在则给「查看原始对话」链接,否则仅显示来源标识文本。

## 数据红线(必须遵守)

- **数据只来自索引/查询层**(`query.query()` 与对 `catalog.db` 的只读聚合)。展示层
  从不解析 `notes/**/meta.json` —— 详情页所需的 `original_question`/`confidence`/
  `references`/`source` 已投影进 catalog 并随 query 输出。
- **索引/检索绝不依赖图谱**:`serve.py` 不 import `graph`、不读 `graph/`。图谱视图
  (`/api/graph`)不在当前范围;`ks graph build` 落地后再接入,列表/检索界面必须在
  没有图谱时完整可用。
- **展示层只读**:任何"编辑/纠错"动作都必须回到 `ks ingest`(经内容持久化 agent),
  不得直接写 `notes/`。服务器只实现 GET/HEAD。

## 现状

- `ks serve` 已落地(检索/列表 + 卡片 + 详情 + 产物/对话打开);图谱视图仍待
  `ks graph build` 从占位变为真实后接入。
- 升级 `ks` 后旧的 `catalog.db` 会被明确拒绝(缺新列),跑一次 `ks reindex` 即可。
