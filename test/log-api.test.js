import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { app } from "../app.mjs";
import { meleeClient } from "../lib/melee.js";
import { issueSession } from "../lib/auth.js";
import { withHostedRuntime } from "../lib/runtime.js";

test("HTTP log streams enforce the authenticated session, including replay and guessed run IDs", async t => {
  const config = { hash: createHash("sha256").update("test password").digest("hex"), key: "test-only-log-api-signing-key-at-least-32" };
  const env = { SITE_PASSWORD_SHA256: config.hash, SESSION_SECRET: config.key, DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } };
  const cookies = [issueSession(config), issueSession(config)].map(token => `mtg_session=${token}`);
  const request = (path, cookie) => withHostedRuntime(env, {}, () => app.fetch(new Request(`https://test.local${path}`, { headers: cookie ? { cookie } : {} }), env));
  t.mock.method(meleeClient, "catalog", async () => { console.log("synthetic-session-A-only"); return { events: [] }; });
  assert.equal((await request("/api/melee/tournaments", cookies[0])).status, 200);
  const readLogs = async cookie => {
    const response = await request("/api/logs?logRunId=guessed&sessionScope=other", cookie);
    const reader = response.body.getReader(); let text = "";
    try {
      while (!text.includes("event: ping")) {
        const chunk = await reader.read(); if (chunk.done) break;
        text += new TextDecoder().decode(chunk.value);
      }
      return text;
    } finally { await reader.cancel(); }
  };
  const [a, b] = await Promise.all(cookies.map(readLogs));
  assert.match(a, /synthetic-session-A-only/);
  assert.doesNotMatch(b, /synthetic-session-A-only/);
  assert.equal((await request("/api/logs")).status, 401);
});
