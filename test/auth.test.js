import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Hono } from "hono";
import { passwordGate, validSession, issueSession } from "../lib/auth.js";
import { withHostedRuntime } from "../lib/runtime.js";

const password = "test-only-password-very-long";
const config = { hash: createHash("sha256").update(password).digest("hex"), key: "test-only-session-secret-at-least-32-characters" };
const env = () => {
  const revoked = new Map();
  return { SITE_PASSWORD_SHA256: config.hash, SESSION_SECRET: config.key, DB: {
    prepare(sql) { return { bind(key, expiry) { return {
      first: async () => sql.startsWith("SELECT") ? (revoked.has(key) ? { token_hash: key } : null) : { attempts: 1 },
      run: async () => { if (sql.startsWith("INSERT OR IGNORE")) revoked.set(key, expiry); return { success: true }; }
    }; } }; }
  } };
};
function fixture(bindings = env()) {
  const app = new Hono();
  app.use("*", passwordGate());
  app.get("/", c => c.text("private app"));
  app.get("/app.js", c => c.text("private source"));
  app.get("/api/logs", c => c.text("private logs"));
  app.post("/api/token-cards", c => c.json({ private: true }));
  return input => withHostedRuntime(bindings, {}, () => app.fetch(typeof input === "string" ? new Request(input) : input, bindings));
}

test("hosted pages, assets, APIs and logs require login and fail closed without secrets", async () => {
  const fetcher = fixture();
  assert.equal((await fetcher("https://test.local/")).headers.get("location"), "/login");
  assert.equal((await fetcher("https://test.local/app.js")).status, 303);
  assert.equal((await fetcher("https://test.local/api/logs")).status, 401);
  assert.equal((await fetcher(new Request("https://test.local/api/token-cards", { method: "POST" }))).status, 401);
  const locked = await fixture({})("https://test.local/");
  assert.equal(locked.status, 503);
  assert.doesNotMatch(await locked.text(), /private app/);
});

test("password login issues a secure cookie, unlocks requests, rejects forgery and cross-site actions", async () => {
  const fetcher = fixture();
  const login = value => new Request("https://test.local/login", { method: "POST", headers: { origin: "https://test.local", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ password: value }) });
  assert.equal((await fetcher(login("wrong"))).status, 401);
  assert.equal((await fetcher(login("x".repeat(9000)))).status, 401);
  const response = await fetcher(login(password));
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const authenticated = new Request("https://test.local/", { headers: { cookie: cookie.split(";")[0] } });
  assert.equal(await (await fetcher(authenticated)).text(), "private app");
  const forged = new Request("https://test.local/", { headers: { cookie: "mtg_session=123.invalid.signature" } });
  assert.equal((await fetcher(forged)).status, 303);
  assert.equal((await fetcher(new Request("https://test.local/login", { method: "POST", headers: { origin: "https://other.local" }, body: new URLSearchParams({ password }) }))).status, 403);
  const logout = await fetcher(new Request("https://test.local/logout", { method: "POST", headers: { cookie: cookie.split(";")[0], origin: "https://test.local" } }));
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await fetcher(authenticated.clone())).status, 303, "A copied cookie is invalid after logout");
});

test("logout revokes only that session and clearing device storage is explicit", async () => {
  const fetcher = fixture();
  const login = async () => {
    const response = await fetcher(new Request("https://test.local/login", { method: "POST", body: new URLSearchParams({ password }) }));
    return response.headers.get("set-cookie").split(";")[0];
  };
  const a = await login(), b = await login();
  assert.notEqual(a, b);
  const response = await fetcher(new Request("https://test.local/logout?clear=1", { method: "POST", headers: { cookie: a } }));
  assert.equal(response.headers.get("clear-site-data"), '"cache", "storage"');
  assert.equal((await fetcher(new Request("https://test.local/api/logs", { headers: { cookie: a } }))).status, 401);
  const other = await fetcher(new Request("https://test.local/", { headers: { cookie: b } }));
  assert.equal(other.status, 200);
  assert.match(other.headers.get("content-security-policy"), /script-src 'self';/);
  assert.equal(other.headers.get("referrer-policy"), "same-origin");
  assert.equal(other.headers.get("clear-site-data"), null);
});

test("sessions expire, fail after password rotation, and login attempts are throttled", async () => {
  const now = Date.now();
  const token = issueSession(config, now);
  assert.equal(validSession(token, config, now), true);
  assert.equal(validSession(token, config, now + 7 * 24 * 60 * 60 * 1000), false);
  assert.equal(validSession(token, { ...config, hash: "a".repeat(64) }, now), false);
  const bindings = env();
  bindings.DB.prepare = () => ({ bind: () => ({ first: async () => ({ attempts: 21 }), run: async () => ({ success: true }) }) });
  const response = await fixture(bindings)(new Request("https://test.local/login", { method: "POST", body: new URLSearchParams({ password }) }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "600");
});

test("malformed Unicode session signatures fail closed without throwing", () => {
  const token = issueSession(config).split(".");
  token[2] = "あ".repeat(43);
  assert.equal(validSession(token.join("."), config), false);
});
