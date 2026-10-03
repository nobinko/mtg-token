import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Local verification credentials only. Production credentials live in Sites.
const password = "local-verification-password-only";
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
  name: "mtg-token",
  scriptPath: "dist/server/index.js", modules: true,
  compatibilityDate: "2026-10-01", compatibilityFlags: ["nodejs_compat"],
  r2Buckets: { BUCKET: "token-cache" }, d1Databases: { DB: "token-auth" },
  bindings: { SITE_PASSWORD_SHA256: createHash("sha256").update(password).digest("hex"), SESSION_SECRET: "local-verification-signing-secret-at-least-32-characters" },
}] }));
try {
  const db = await mf.getD1Database("DB");
  for (const file of await readdir("drizzle")) {
    if (!file.endsWith(".sql")) continue;
    for (const sql of (await readFile(`drizzle/${file}`, "utf8")).split("--> statement-breakpoint").filter(sql => sql.trim())) await db.prepare(sql).run();
  }
  const origin = "http://localhost";
  assert.equal((await mf.dispatchFetch(`${origin}/`, { redirect: "manual" })).status, 303);
  assert.equal((await mf.dispatchFetch(`${origin}/api/formats`)).status, 401);
  assert.equal((await mf.dispatchFetch(`${origin}/api/version`)).status, 401);
  assert.equal((await mf.dispatchFetch(`${origin}/api/tournament`, { method: "POST" })).status, 401);
  const login = await mf.dispatchFetch(`${origin}/login`, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ password }).toString(), redirect: "manual" });
  assert.equal(login.status, 303);
  const headers = { cookie: login.headers.get("set-cookie").split(";")[0], origin };
  const page = await mf.dispatchFetch(`${origin}/`, { headers });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /画像付き|deck-dialog/);
  assert.equal((await mf.dispatchFetch(`${origin}/app.js`, { headers })).status, 200);
  assert.equal((await mf.dispatchFetch(`${origin}/tournament-ui.js`, { headers })).status, 200);
  const tournamentUrl = "https://melee.gg/Tournament/View/411350";
  const importResponse = await mf.dispatchFetch(`${origin}/api/tournament`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({
    action: "import", url: tournamentUrl, format: "modern", targetDate: "2026-10-03", participants: 537,
    files: [{ content: "Player: Local Verification\nDeck\n60 Island\nSideboard\n15 Dispel" }]
  }) });
  const tournament = await importResponse.json();
  assert.equal(importResponse.status, 200, JSON.stringify(tournament));
  assert.equal(tournament.deckCount, 1);
  assert.equal(tournament.missingCount, 536);
  const loadTournament = () => mf.dispatchFetch(`${origin}/api/tournament`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ action: "load", url: tournamentUrl }) });
  assert.equal((await (await loadTournament()).json()).fetchedAt, tournament.fetchedAt);
  const version = await (await mf.dispatchFetch(`${origin}/api/version`, { headers })).json();
  const buildInfo = JSON.parse(await readFile("dist/build-info.json", "utf8"));
  assert.equal(version.commitSha, buildInfo.commitSha);
  assert.match(version.commitSha, /^[a-f0-9]{40}$/);
  if (process.argv.includes("--release")) assert.equal(version.dirty, false, "未コミットの変更を含むビルドです。");
  const status = await (await mf.dispatchFetch(`${origin}/api/environment/status`, { headers })).json();
  assert.equal(status.revision, "同梱版");
  assert.equal((await mf.dispatchFetch(`${origin}/api/cache/clear`, { method: "POST", headers })).status, 200);
  assert.equal((await (await loadTournament()).json()).deckCount, 1, "巡回キャッシュ削除で大会リストを消してはいけません。");
  console.log("Hosted Worker: login, protected assets/APIs, D1, R2 and tournament imports verified.");
  if (process.argv.includes("--live-search")) {
    const response = await mf.dispatchFetch(`${origin}/api/token-cards`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ format: "modern", targetDate: "2026-10-03", maxChildPages: 20, useCache: true }) });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.ok(result.searchedDeckCount >= 20, `Only ${result.searchedDeckCount} decks`);
    assert.ok(result.objects.length);
    assert.ok(result.searchedDecks.every(deck => deck.mainboard.length));
    console.log(`Hosted live search: ${result.searchedDeckCount} decks, ${result.objects.length} token objects with complete decklists.`);
  }
} finally { await mf.dispose(); }
