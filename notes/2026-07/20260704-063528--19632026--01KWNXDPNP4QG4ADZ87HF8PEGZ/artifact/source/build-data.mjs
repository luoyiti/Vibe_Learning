// Convert the downloaded real CSVs into src/data.js (embedded at build time).
import { readFileSync, writeFileSync } from "node:fs";

const csv = (p) => {
  const [head, ...rows] = readFileSync(p, "utf8").trim().split("\n");
  const cols = head.split(",");
  return rows.map((r) => {
    const v = r.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  });
};

const iris = csv("../data/iris.csv").map((r) => [
  +r.sepal_length, +r.sepal_width, +r.petal_length, +r.petal_width, r.species,
]);

const mpg = csv("../data/mpg.csv")
  .filter((r) => r.horsepower !== "" && r.horsepower != null)
  .map((r) => [+r.horsepower, +r.mpg])
  .filter(([h, m]) => Number.isFinite(h) && Number.isFinite(m));

writeFileSync(
  "src/data.js",
  `// Real datasets, embedded at build time.
// IRIS: Fisher (1936), 150 rows — via seaborn-data (UCI ML Repository).
// MPG: Auto MPG, ${mpg.length} rows with valid horsepower — via seaborn-data (UCI).
export const IRIS = ${JSON.stringify(iris)};
export const IRIS_FEATURES = ["花萼长 sepal_length","花萼宽 sepal_width","花瓣长 petal_length","花瓣宽 petal_width"];
export const IRIS_ABBR = ["SL","SW","PL","PW"];
export const SPECIES = ["setosa","versicolor","virginica"];
export const MPG = ${JSON.stringify(mpg)};
`
);
console.log(`iris rows: ${iris.length}, mpg rows: ${mpg.length}`);
