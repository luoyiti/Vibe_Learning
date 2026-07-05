# 原始对话（示例）

> 这是随仓示例的对话留档,演示 `source.transcript` 的完整链路:
> `ks ingest` 会把 `source/` 一并拷入单元目录,`ks serve` 的详情页
> 会出现「查看原始对话」按钮,点开即此文件。

**User:** What are database isolation levels and how do I choose one?

**Assistant:** The four SQL isolation levels (read uncommitted, read committed,
repeatable read, serializable) trade consistency for concurrency by choosing
which read anomalies they permit — see the note for the full walkthrough.
