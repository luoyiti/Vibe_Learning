# 知识沉淀系统的多 Agent 架构：原理与使用

本仓库的「多 Agent」并非多个独立进程，而是 **四份 Markdown 提示词契约**（`agents/*.md`），由对话中的 AI 按用户意图切换扮演；所有确定性读写收口在 **`ks` CLI 工具层**。

## 核心循环

**提问 → Agent 自由讲解 → 双产出（自包含产物 + 元数据信封）→ `ks ingest` 落盘 → 派生索引 → 按需复盘**

## 四层架构

| 层 | 职责 |
|---|---|
| ① Agent | 判断 / 生成 / 分析；四份契约，永不直接碰文件 |
| ② 工具 `ks` | 全部 I/O：`ingest` / `delete` / `query` / `reindex` / `serve` |
| ③ 存储 | `notes/` 为唯一真相；`index/`、`graph/` 可重建 |
| ④ 展示 | `ks serve` 只读 Web UI |

写入沿层向下、读取沿层向上；层间不跨越。

## 四份契约

1. **learning-guide（学习指导）**：自由讲解，必须产出产物 + 草稿（`note.md` + `meta.json`），自动交接 persistence。
2. **persistence（内容持久化）**：**唯一写者**。先 `ks query` 找 relations，再 `ks ingest`；删除用 `ks delete`。
3. **global-analysis（全局分析）**：**只读**。仅 `ks query`，产出复盘报告，无复习调度状态。
4. **project-modification（项目修改）**：唯一可改项目源码 / schema / 测试；复现 → 最小改动 → pytest 全绿。

## 路由（Step 0）

动手前先分类：**看用户根本目的，不看表面动词**。「用 firecrawl 搜 X 做 HTML 讲解」仍是 learning-guide。无法映射到四契约之一 → 拒绝（Scope lock）。

## 六条铁律

1. 文件即事实来源  
2. 判断与执行分离  
3. 机器严格（`meta.json` schema）/ 人类自由（正文与产物）  
4. ID（ULID）即身份  
5. 单写者（仅 persistence → ingest/delete）  
6. 索引不依赖图谱  

## 易错点

- 不要手改 `notes/`、`index/`、`graph/`。  
- `ks ingest` 校验失败则**不落盘**——修草稿 `meta.json` 后重试。  
- 学习请求默认会沉淀，除非用户明确说「先别存」。  
- 删除已沉淀单元必须走 `ks delete <id>`，先 `--dry-run`。

## 配套产物

`artifact/index.html` 为自包含学术风 React 单页（esbuild 内联打包），含四层架构图、契约卡片、路由模拟器、`ks` 命令表与典型工作流；源码在 `artifact/source/`。
