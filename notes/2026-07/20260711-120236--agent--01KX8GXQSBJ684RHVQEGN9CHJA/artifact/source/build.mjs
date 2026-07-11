import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const out = await build({
  entryPoints: ["src/index.jsx"],
  bundle: true,
  minify: true,
  write: false,
  jsx: "automatic",
  outdir: "dist",
  define: { "process.env.NODE_ENV": '"production"' },
});

let js = "";
for (const f of out.outputFiles) {
  if (f.path.endsWith(".js")) js = f.text;
}
const css = readFileSync("src/styles.css", "utf8");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>知识沉淀系统 · 多 Agent 架构原理与使用</title>
<meta name="description" content="四层架构、四份提示词契约、单写者与路由机制——一份可交互的学术风格说明。" />
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>
<script>
${js.replace(/<\/script>/g, "<\\/script>")}
</script>
</body>
</html>
`;

mkdirSync("dist", { recursive: true });
writeFileSync("../index.html", html);
console.log(`../index.html: ${(html.length / 1024).toFixed(0)} KB`);
