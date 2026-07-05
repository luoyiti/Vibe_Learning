// Bundle the React app and inline JS+CSS into ONE self-contained HTML file.
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

let js = "", css = "";
for (const f of out.outputFiles) {
  if (f.path.endsWith(".js")) js = f.text;
}
css = readFileSync("src/styles.css", "utf8");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>树模型六十年：从递归划分到表格基础模型</title>
<meta name="description" content="树模型机器学习的历史发展历程与最新前沿方向——一份可交互的学术综述，内含在浏览器中现场训练的 CART / 随机森林 / 梯度提升实验台（真实数据）。" />
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
writeFileSync("dist/index.html", html);
console.log(`dist/index.html: ${(html.length / 1024).toFixed(0)} KB`);
