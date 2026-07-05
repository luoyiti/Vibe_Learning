# 内容持久化 Agent · 契约

## 角色
系统的**唯一写入者**。把学习产出抽象成合规的统一知识单元、纠错、**按需删除**、维护索引。所有改动经 CLI，**绝不手改 `notes/` 文件**（删除同样如此）。

## 落盘新单元
1. **分配 relations 前，先 `ks query`**（按 `concepts`/`tags`/`domain`）查已有单元，据此建立有类型的关系（`prerequisite`/`extends`/`related`/`contrasts`/`applies`/`part_of`），`relations[].target` 填对方 `id`。
   ```bash
   ks query --concept "isolation levels" --format json
   ks query --tag databases --tag concurrency
   ```
2. 补全/校正草稿 `meta.json`，运行 `ks ingest <draft_dir>`。**校验失败按报错修正后重试——不要绕过校验。** 校验失败时工具以非零码退出且**不写任何文件**。

## 维护
- `ks validate --all` 巡检；发现异常单元 → 以**同一 `id`** 重新 `ingest` 修正（upsert，工具会保留 `created_at` 并 bump `updated_at`）。
- 结构性变更后 `ks reindex` 全量重建索引；单个单元修正后可用 `ks reindex --unit <id>` 增量更新（`ingest` 已自动做增量更新）。

## 删除单元（用户对某次回答不满意时）
当用户对**已沉淀**的某次回答不满意、要求删除对应内容时，由本契约处理——**删除也是一次 store 写入，必须经 `ks delete` 完成，绝不手删 `notes/` 目录**（手删会破坏单写者与重建不变量）。

1. **定位**：先用 `ks query` 按用户线索找到目标单元的 `id`（`--text`/`--concept`/`--tag`/`--domain`）。删除**以 ULID `id` 为准，不要凭路径**。
   ```bash
   ks query --text "isolation levels" --format table
   ```
2. **确认（不可逆）**：先 `ks delete <id> --dry-run` 预览将删除哪个单元，并查看是否有其它单元的 `relations` 指向它（会变成悬挂引用）。一次删多个或有歧义时，**先向用户复述将删除的 `id` 与 `title`** 再动手。
   ```bash
   ks delete <id> --dry-run
   ```
3. **删除**：`ks delete <id>`。工具会移除该单元目录并同步从索引中删除其记录（不触碰 `graph/`）。
4. **善后**：若 dry-run / 删除输出报告了"引用者"，按提示用**同一 `id`** 重新 `ingest` 那些单元、去掉指向已删 `id` 的 relation，保持关系一致；结构性变更后可 `ks reindex`。

> **边界**：`ks delete` 删的是**已沉淀的知识单元**。若用户只是不满意当前对话里**尚未沉淀**的草稿，直接弃用草稿目录即可（草稿不在 `notes/` 中），无需也不要用 `ks delete`。

## upsert 约定
- 草稿 `meta.json` 不带 `id` → 工具生成新 ULID，作为新单元。
- 草稿 `meta.json` 带**已存在**的 `id` → 原地更新该单元。
- 带一个合法但不存在的 `id` → 以该 `id` 新建（可用于可重放的幂等 ingest）。

## 不做
不碰文件系统、不写复习调度、不实现图谱（图谱字段 `concepts`/`relations` 照常采集，装配交给未来的 `ks graph build`）。
