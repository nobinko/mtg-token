import { build } from "esbuild";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8" };
const assets = {};
for (const file of await readdir("public", { withFileTypes: true })) {
  if (!file.isFile() || !types[extname(file.name)]) continue;
  assets[`/${file.name}`] = { body: await readFile(join("public", file.name), "utf8"), type: types[extname(file.name)] };
}
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await build({
  entryPoints: ["worker.mjs"], outfile: "dist/server/index.js", bundle: true, format: "esm", platform: "neutral", target: "es2022", conditions: ["workerd", "worker", "import"], external: ["node:*"],
  plugins: [{ name: "public-assets", setup(builder) {
    builder.onResolve({ filter: /^virtual:public-assets$/ }, () => ({ path: "public-assets", namespace: "assets" }));
    builder.onLoad({ filter: /.*/, namespace: "assets" }, () => ({ contents: `export default ${JSON.stringify(assets)}`, loader: "js" }));
  } }],
});
await writeFile("dist/.openai/hosting.json", await readFile(".openai/hosting.json", "utf8"));
console.log(`Built hosted Worker with ${Object.keys(assets).length} protected assets.`);
