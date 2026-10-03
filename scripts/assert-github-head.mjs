import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const git = args => execFileSync("git", args, { encoding: "utf8", timeout: 60_000 }).trim();
const manifest = JSON.parse(await readFile(".openai/hosting.json", "utf8"));
assert.equal(manifest.project_id, "appgprj_6ac055f0be7c8191bb686c041d36c953", "公開先が一致しません。");
assert.equal(git(["status", "--porcelain"]), "", "未コミットの変更があるため公開を止めました。先にGitHubのmainへpushしてください。");
const head = git(["rev-parse", "HEAD"]);
const latest = git(["ls-remote", "https://github.com/nobinko/mtg-token.git", "refs/heads/main"]).split(/\s+/)[0];
assert.match(latest, /^[a-f0-9]{40}$/);
assert.equal(head, latest, "GitHubのmainの最新版ではありません。fetchしてfast-forwardしてから公開してください。");
console.log(JSON.stringify({ repository: "nobinko/mtg-token", branch: "main", commitSha: head, projectId: manifest.project_id }));
