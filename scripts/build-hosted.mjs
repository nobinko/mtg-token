import { build } from "esbuild";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { execFileSync } from "node:child_process";

const commitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== commitSha) throw new Error("GitHubの対象コミットとビルド元が一致しません。");
const buildInfo = {
  commitSha,
  dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
  repository: "nobinko/mtg-token",
  builtAt: new Date().toISOString(),
};

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
  define: { __MTG_BUILD_INFO__: JSON.stringify(buildInfo) },
  plugins: [{ name: "public-assets", setup(builder) {
    builder.onResolve({ filter: /^virtual:public-assets$/ }, () => ({ path: "public-assets", namespace: "assets" }));
    builder.onLoad({ filter: /.*/, namespace: "assets" }, () => ({ contents: `export default ${JSON.stringify(assets)}`, loader: "js" }));
  } }],
});
await writeFile("dist/.openai/hosting.json", await readFile(".openai/hosting.json", "utf8"));
await writeFile("dist/build-info.json", JSON.stringify(buildInfo, null, 2) + "\n");
console.log(`Built ${commitSha} with ${Object.keys(assets).length} protected assets${buildInfo.dirty ? " (local changes present)" : ""}.`);
