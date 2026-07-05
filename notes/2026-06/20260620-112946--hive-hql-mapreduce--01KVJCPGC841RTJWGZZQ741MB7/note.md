# Hive 执行流程：从 HQL 到 MapReduce

**一句话总结：** Hive 把 SQL 风格的 HQL 编译成 Hadoop 上的分布式作业——Driver 查 Meta Store 拿 schema，生成执行计划，经 YARN 调度在 HDFS 数据上跑 MapReduce（或 Tez/Spark），结果再经 Driver 返回客户端。

## 架构两层

### Hive 服务层
- **用户界面**：CLI（最常用）、JDBC/ODBC（经 Thrift Server）、Web UI
- **Driver**：核心引擎，含 Compiler（编译）、Optimizer（优化）、Executor（执行）
- **Meta Store**：元数据存外部 RDBMS（MySQL/Derby），记录库表、列类型、分区、HDFS 路径

### Hadoop 生态层
- **HDFS**：Name Node（块映射）+ Data Node（实际存储表数据文件）
- **YARN**：Resource Manager（全局调度）+ Node Manager（本机 Container）

## 七步执行流程

1. **提交** — 用户经 CLI/JDBC/Web UI 提交 HQL
2. **Driver 接收** — Driver 接管查询生命周期
3. **元数据查询** — Driver 向 Meta Store 获取表结构与 HDFS 目录
4. **编译优化** — 词法/语法分析 → 逻辑计划 → 物理执行计划（写入 HDFS）
5. **提交 YARN** — Driver 联系 Name Node 定位数据，向 Resource Manager 提交作业
6. **分布式执行** — Node Manager 启动 Map/Reduce Task，Data Node 读取 HDFS 数据
7. **返回结果** — 作业完成后 Driver 将结果集回传客户端

## Driver 编译管线

| 阶段 | 作用 |
|------|------|
| 词法/语法分析 | 解析 HQL，构建 AST |
| 语义分析 | 绑定 schema，类型检查 |
| 逻辑计划 | Operator 树（Scan → Filter → Join → GroupBy） |
| 优化 | 谓词下推、列裁剪、分区裁剪、Join 重排 |
| 物理计划 | 映射为 MapReduce Stage 或 Tez/Spark DAG |

## Meta Store 三种模式

- **Embedded** — 内嵌 Derby，单用户开发
- **Local** — Meta Store 与 Hive 同机，共享远程 RDBMS
- **Remote** — 独立 Meta Store 服务，生产标准

## 要点与易错点

- Meta Store 只存元数据，**表数据物理在 HDFS**
- 删 Meta Store 记录不删 HDFS 文件；HDFS 文件被删则查询失败
- 现代 Hive 默认执行引擎可能是 Tez/Spark，但架构流程不变
- 性能问题常来自小文件过多、无分区、全表扫描等 HQL 写法
