import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const secretPattern = /(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16})/;
const matches = [];
for (const file of files) {
  assert.ok(!/(^|\/)(?:\.env(?:\..+)?|\.cache|dist)(?:\/|$)/.test(file) || file === ".env.example", `Private/build file tracked: ${file}`);
  const contents = await readFile(file);
  if (secretPattern.test(contents.toString("utf8"))) matches.push(file);
}
assert.deepEqual(matches, [], "Possible credential patterns; inspect without printing secret values");
const publicFiles = await readdir("public");
assert.ok(!publicFiles.some(file => /\.(?:pem|key|map|env|log)$/.test(file)));
console.log(`Distribution check: ${files.length} tracked files, ${publicFiles.length} public entries; no targeted credential signatures or private runtime files found.`);
