import test from "node:test";
import assert from "node:assert/strict";
import { crawlSources } from "../lib/crawl.js";

test("cold public search aborts slow sources and declares incomplete coverage", async t => {
  const keepAlive = setTimeout(() => {}, 1000); t.after(() => clearTimeout(keepAlive));
  t.mock.method(globalThis, "fetch", async (url, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  const result = await crawlSources(["https://mtgtop8.com/format?f=MO"], 20, { useCache: false, maxDurationMs: 20 });
  assert.equal(result.timeLimited, true);
  assert.equal(result.sourceExhausted, false);
  assert.equal(result.deckEntryCount, 0);
  assert.match(result.warnings.join(" "), /未取得分/);
});

test("failed fetches count toward the crawl safety limit", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("unavailable", { status: 503 }); });
  const urls = Array.from({ length: 130 }, (_, i) => `https://mtgtop8.com/event?e=${i + 1}`);
  const result = await crawlSources(urls, 20, { useCache: false });
  assert.equal(calls, 100);
  assert.match(result.warnings.join(" "), /巡回回数/);
});
