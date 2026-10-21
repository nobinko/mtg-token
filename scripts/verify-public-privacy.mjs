import assert from "node:assert/strict";

// The password is read from hidden stdin, never command arguments or a file.
// Requests use two fresh sessions; the user's browser session/saves are untouched.
process.stdout.write("Ready for hidden verification input\n");
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const input = await new Promise((resolve, reject) => {
  let value = "";
  const receive = chunk => {
    value += chunk.toString();
    if (value.includes("\u0003") || value.length > 8192) { cleanup(); reject(new Error("Verification input cancelled")); }
    else if (/[\r\n]/.test(value)) { cleanup(); resolve(value.trim()); }
  };
  const cleanup = () => { process.stdin.off("data", receive); if (process.stdin.isTTY) process.stdin.setRawMode(false); process.stdin.pause(); };
  process.stdin.on("data", receive);
});
const settings = JSON.parse(input);
const origin = new URL(settings.url).origin;
assert.equal(new URL(origin).protocol, "https:");
const request = (path, cookie = "", body, extra = {}) => fetch(`${origin}${path}`, {
  method: body === undefined ? "GET" : "POST", redirect: "manual", signal: AbortSignal.timeout(45000),
  headers: { origin, ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...extra
});
const report = { checkedAt: new Date().toISOString(), url: origin, checks: [] };
const check = name => report.checks.push(name);
let a, b;
try {
  for (const path of ["/api/session", "/api/logs", "/api/tournament", "/api/version"]) assert.equal((await request(path)).status, 401);
  for (const path of ["/", "/app.js", "/privacy.html", "/.env"]) assert.equal((await request(path)).status, 303);
  check("anonymous pages, assets and APIs denied");
  const login = async () => {
    const response = await request("/login", "", {}, { headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ password: settings.password }).toString() });
    assert.equal(response.status, 303);
    const cookie = response.headers.get("set-cookie");
    for (const flag of ["HttpOnly", "Secure", "SameSite=Lax"]) assert.ok(cookie.includes(flag));
    return cookie.split(";")[0];
  };
  a = await login(); b = await login(); settings.password = "";
  assert.ok(a !== b);
  const page = await request("/", a);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("cache-control"), /no-store/);
  assert.match(page.headers.get("content-security-policy"), /script-src 'self';/);
  assert.equal(page.headers.get("referrer-policy"), "same-origin");
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  const version = await (await request("/api/version", a)).json();
  assert.equal(version.dirty, false);
  if (settings.commitSha) assert.equal(version.commitSha, settings.commitSha);
  report.commitSha = version.commitSha;
  check("release SHA, security headers and independent secure cookies verified");
  for (const path of ["/.env", "/.git/config", "/lib/auth.js", "/dist/build-info.json", "/.cache/tournaments.json", "/%2e%2e%5c.env"]) assert.equal((await request(path, a)).status, 404);
  check("internal files unavailable after login");
  for (const source of ["https://127.0.0.1/private", "https://www.hareruyamtg.com/decks/123?display_token=synthetic-private"]) {
    const response = await request("/api/token-cards", a, { sources: [source] });
    assert.equal(response.status, 400);
    assert.doesNotMatch(await response.text(), /synthetic-private|127\.0\.0\.1/);
  }
  check("unsafe URL inputs rejected without reflecting their contents");
  const csrf = await request("/api/cache/clear", a, {}, { headers: { cookie: a, origin: "https://unrelated.invalid", "content-type": "application/json" } });
  assert.equal(csrf.status, 403);
  check("cross-origin writes denied");
  const url = "https://melee.gg/Tournament/View/123";
  const imported = await request("/api/tournament", a, { action: "import", url, format: "modern", targetDate: "2026-10-01", files: [{ content: JSON.stringify([{ player: "Synthetic privacy check", email: "synthetic@example.invalid", password: "synthetic-hidden", mainboard: [{ name: "Island", count: 60 }], sideboard: [] }]) }] });
  assert.equal(imported.status, 200);
  const importedText = await imported.text();
  assert.doesNotMatch(importedText, /synthetic@example|synthetic-hidden/);
  const foreign = await request("/api/tournament", b, { action: "load", url });
  assert.equal(foreign.status, 410);
  assert.doesNotMatch(await foreign.text(), /Synthetic privacy check|Island/);
  check("synthetic private import excludes account fields and cannot be loaded by another session");
  const stream = await request("/api/logs?logRunId=guessed&sessionScope=other", b);
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value); await reader.cancel();
  assert.doesNotMatch(first, /Synthetic privacy check|synthetic-hidden|synthetic@example/);
  check("other session log replay excludes private import data");
  const logout = await request("/logout?clear=1", b, {});
  assert.equal(logout.status, 303);
  assert.equal(logout.headers.get("clear-site-data"), '"cache", "storage"');
  assert.equal((await request("/api/formats", b)).status, 401);
  assert.equal((await request("/api/formats", a)).status, 200);
  check("logout revokes the old cookie, preserves the other session and requests device cleanup");
  if (settings.clearPageCache) {
    assert.equal((await request("/api/cache/clear", a, {})).status, 200);
    check("old shared public-page cache cleared");
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const cookie of [a, b].filter(Boolean)) await request("/logout", cookie, {}).catch(() => {});
}
