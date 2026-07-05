# Hive 桶（Bucket）机制原理与作用

Hive 桶是一种基于哈希的数据分片策略，将数据按 `hash(col) % N` 均匀分布到 N 个物理文件中，用于高效采样、Map-side Join 和数据组织。

## 核心原理

### 哈希分桶机制

桶表写入时，Hive 对每一行计算 `hash(bucket_column) % num_buckets`，结果决定该行落入哪个桶文件。每个桶是一个独立的物理文件（如 `000000_0`、`000001_0`），位于表目录或分区目录下。

```
bucket_number = hash(bucket_column) % num_buckets
```

在 MapReduce 执行中，Reducer 数量等于桶数量，每个 Reducer 负责写出一个桶文件——这保证了同一个桶的所有行由同一个进程写入。

### 与分区的本质区别

| | 桶 (Bucket) | 分区 (Partition) |
|---|---|---|
| 物理层级 | 文件级 | 目录级 |
| 分片方式 | hash % N | 按列值创建子目录 |
| 适用列 | 高基数 (user_id) | 低基数 (date, country) |
| 数量 | 建表时固定 | 可动态增加 |
| 剪枝 | 不提供分区剪枝 | 提供分区剪枝 |
| Join 优化 | Map-side / SMB Join | 一般不直接用于 Join |

两者是互补关系，最常见的高性能表结构是"分区 + 桶"组合。

## 主要使用场景

### 1. 高效采样 (TABLESAMPLE)

```sql
SELECT * FROM t TABLESAMPLE(BUCKET 1 OUT OF 64 ON col);
```

直接从指定桶文件读取，无需全表扫描。适合开发测试和近似分析。

### 2. Map-side Join

两张表按相同 Join Key 分桶且桶数相同（或倍数关系），Hive 可在 Map 阶段直接按桶 Join——相同 key 必然在同一桶中，无需 Shuffle。需开启 `hive.optimize.bucketmapjoin=true`。

### 3. Sort-Merge Bucket (SMB) Join

在 Map-side Join 基础上进一步要求桶内数据已按 Join Key 排序。Mapper 对两个表对应桶文件做归并，全程无 Shuffle、无 Sort，是目前 Hive 中最快的 Join 方式。建表时需同时指定 `CLUSTERED BY ... SORTED BY ...`。

### 4. 数据组织

合理分桶控制文件大小（桶数 = 文件数），避免小文件过多或单文件过大。对 ORC/Parquet 列存的谓词下推也有帮助。

## 创建与使用

```sql
-- 基础桶表
CREATE TABLE t (col1 INT, col2 STRING)
CLUSTERED BY (col1) INTO 64 BUCKETS
STORED AS ORC;

-- 排序桶表 (支持 SMB Join)
CREATE TABLE t (col1 INT, col2 STRING)
CLUSTERED BY (col1) SORTED BY (col1) INTO 64 BUCKETS
STORED AS ORC;
```

写入前必须 `SET hive.enforce.bucketing = true;`，并通过 INSERT 写入（不可用 LOAD DATA 直接拷贝文件）。

## 关键注意事项

1. **桶数不可变**：建表时确定，无法 ALTER 动态增减。改变桶数需重建表。
2. **强制分桶开关**：写入前必须 `SET hive.enforce.bucketing=true`，否则 Reducer 数可能不等于桶数。
3. **不可绕过桶逻辑**：LOAD DATA 或直接 HDFS put 会破坏桶结构，必须用 INSERT。
4. **桶数建议取 2 的幂**：方便 Map-side Join 时桶配对更灵活（如 32、64、128）。
5. **SMB Join 条件严格**：两表必须相同分桶列、相同桶数、相同排序列。
6. **与分区配合使用**：分区 + 桶是最佳实践——分区做粗粒度裁剪、桶做数据均匀分布。
