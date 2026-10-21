import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { meleeHostedFixture } from "./fixtures/melee-hosted.mjs";

// Local verification credentials only. Production credentials live in Sites.
const password = "local-verification-password-only";
const meleeFixture = meleeHostedFixture();
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
  name: "mtg-token",
  scriptPath: "dist/server/index.js", modules: true,
  compatibilityDate: "2026-10-01", compatibilityFlags: ["nodejs_compat"],
  r2Buckets: { BUCKET: "token-cache" }, d1Databases: { DB: "token-auth" },
  outboundService: request => meleeFixture.fetch(request),
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
  const loginB = await mf.dispatchFetch(`${origin}/login`, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ password }).toString(), redirect: "manual" });
  const headersB = { cookie: loginB.headers.get("set-cookie").split(";")[0], origin };
  assert.notEqual(headers.cookie, headersB.cookie);
  const page = await mf.dispatchFetch(`${origin}/`, { headers });
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /script-src 'self';/);
  assert.equal(page.headers.get("referrer-policy"), "same-origin");
  assert.match(await page.text(), /画像付き|deck-dialog/);
  assert.equal((await mf.dispatchFetch(`${origin}/app.js`, { headers })).status, 200);
  assert.equal((await mf.dispatchFetch(`${origin}/tournament-ui.js`, { headers })).status, 200);
  for (const path of ["/.env", "/.git/config", "/lib/auth.js", "/.cache/tournaments.json", "/%2e%2e%5c.env"]) assert.equal((await mf.dispatchFetch(`${origin}${path}`, { headers })).status, 404);
  for (const url of ["https://127.0.0.1/private", "https://mtgtop8.com/?token=private-fixture"]) {
    const before = meleeFixture.calls.length;
    const denied = await mf.dispatchFetch(`${origin}/api/token-cards`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ sources: [url] }) });
    assert.equal(denied.status, 400);
    assert.equal(meleeFixture.calls.length, before, "Invalid sources must cause no external requests");
    assert.doesNotMatch(await denied.text(), /private-fixture|127\.0\.0\.1/);
  }
  const catalogResponse = await mf.dispatchFetch(`${origin}/api/melee/tournaments?format=modern&days=90`, { headers });
  const catalog = await catalogResponse.json();
  assert.equal(catalogResponse.status, 200, JSON.stringify(catalog));
  assert.equal(catalog.events.length, 1);
  assert.equal(catalog.events[0].locationScope, "jp");
  const acquireResponse = await mf.dispatchFetch(`${origin}/api/tournament`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ action: "fetch", url: meleeFixture.tournamentUrl }) });
  const acquired = await acquireResponse.json();
  assert.equal(acquireResponse.status, 200, JSON.stringify(acquired));
  assert.equal(acquired.deckCount, 1);
  assert.equal(acquired.coverageComplete, true);
  assert.equal(acquired.decks[0].mainboardCount, 60);
  assert.equal(acquired.decks[0].sideboardCount, 15);
  const redirectedResponse = await mf.dispatchFetch(`${origin}/api/tournament`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ action: "fetch-api", url: meleeFixture.tournamentUrl, credentials: { id: "verification-only", secret: "not-a-real-credential" } }) });
  assert.equal(redirectedResponse.status, 502);
  assert.match((await redirectedResponse.json()).error, /HTTP 302/);
  assert.ok(meleeFixture.calls.every(url => new URL(url).hostname === "melee.gg"), "Never forward Melee credentials to a redirect target");
  const tournamentUrl = "https://melee.gg/Tournament/View/411350";
  const importResponse = await mf.dispatchFetch(`${origin}/api/tournament`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({
    action: "import", url: tournamentUrl, format: "modern", targetDate: "2026-10-03", participants: 537,
    files: [{ content: "Player: Local Verification\nDeck\n60 Island\nSideboard\n15 Dispel" }]
  }) });
  const tournament = await importResponse.json();
  assert.equal(importResponse.status, 200, JSON.stringify(tournament));
  assert.equal(tournament.deckCount, 1);
  assert.equal(tournament.missingCount, 536);
  assert.equal(importResponse.headers.get("cache-control"), "private, no-store");
  assert.equal(tournament.decks[0].mainboard[0].name, "Island");
  const bucket = await mf.getR2Bucket("BUCKET");
  assert.equal((await bucket.list()).objects.length, 0, "Private imported lists must not be persisted to shared R2.");
  const loadTournament = () => mf.dispatchFetch(`${origin}/api/tournament`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ action: "load", url: tournamentUrl }) });
  const deniedLoad = await loadTournament();
  assert.equal(deniedLoad.status, 410, "A tournament URL must not expose another browser's lists.");
  assert.equal((await deniedLoad.json()).decks, undefined);
  const deniedOther = await mf.dispatchFetch(`${origin}/api/tournament`, { method: "POST", headers: { ...headersB, "content-type": "application/json" }, body: JSON.stringify({ action: "load", url: tournamentUrl }) });
  assert.equal(deniedOther.status, 410);
  assert.doesNotMatch(await deniedOther.text(), /Local Verification|Island/);
  const logResponse = await mf.dispatchFetch(`${origin}/api/logs`, { headers: headersB });
  const reader = logResponse.body.getReader();
  const firstLog = new TextDecoder().decode((await reader.read()).value);
  assert.doesNotMatch(firstLog, /Local Verification|private-upstream-body|verification-only|not-a-real-credential/);
  await reader.cancel();
  const version = await (await mf.dispatchFetch(`${origin}/api/version`, { headers })).json();
  const buildInfo = JSON.parse(await readFile("dist/build-info.json", "utf8"));
  assert.equal(version.commitSha, buildInfo.commitSha);
  assert.match(version.commitSha, /^[a-f0-9]{40}$/);
  if (process.argv.includes("--release")) assert.equal(version.dirty, false, "未コミットの変更を含むビルドです。");
  const status = await (await mf.dispatchFetch(`${origin}/api/environment/status`, { headers })).json();
  assert.equal(status.revision, "同梱版");
  await bucket.put("cache/pages/hosted-verification.json", "page-cache-fixture");
  await bucket.put("cache/hosted-state-verification.json", "persistent-cache-fixture");
  assert.equal((await mf.dispatchFetch(`${origin}/api/cache/clear`, { method: "POST", headers })).status, 200);
  assert.equal(await bucket.get("cache/pages/hosted-verification.json"), null);
  assert.equal(await (await bucket.get("cache/hosted-state-verification.json")).text(), "persistent-cache-fixture");
  assert.equal((await loadTournament()).status, 410, "Cache clearing must not restore shared tournament access.");
  const logout = await mf.dispatchFetch(`${origin}/logout?clear=1`, { method: "POST", headers: headersB, redirect: "manual" });
  assert.equal(logout.status, 303);
  assert.equal(logout.headers.get("clear-site-data"), '"cache", "storage"');
  assert.equal((await mf.dispatchFetch(`${origin}/api/formats`, { headers: headersB })).status, 401);
  assert.equal((await mf.dispatchFetch(`${origin}/api/formats`, { headers })).status, 200);
  console.log("Hosted Worker: auth, session revocation/isolation, security headers, private import/R2 isolation, unsafe URL rejection and Melee redirect refusal verified.");
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
