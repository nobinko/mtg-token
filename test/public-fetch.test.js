import test from "node:test";
import assert from "node:assert/strict";
import { publicSourceUrl, fetchPublicResponse, responseBytes } from "../lib/public-fetch.js";
import { defaultSources } from "../lib/data.js";

test("all four formats retain their public sources, private URL variants are refused", () => {
  for (const source of Object.values(defaultSources).flat()) assert.equal(publicSourceUrl(source), source);
  for (const url of ["http://mtgtop8.com/", "https://mtgtop8.com:444/", "https://user:pass@mtgtop8.com/", "https://mtgtop8.com./", "https://[::1]/", "https://2130706433/", "file:///etc/passwd", "https://api.scryfall.com/cards?api_key=private", "https://www.hareruyamtg.com/decks/1?display%5ftoken=private", "https://magic.gg/?redirect=https://private.test"]) assert.throws(() => publicSourceUrl(url));
});

test("redirects cannot escape the allowlist or forward a POST body", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/internal" } });
  });
  await assert.rejects(fetchPublicResponse("https://mtgtop8.com/"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(calls[0].options.credentials, "omit");
  await assert.rejects(fetchPublicResponse("https://api.scryfall.com/cards/collection", { method: "POST", body: "private fixture" }, { json: true }));
  assert.equal(calls.length, 2);
});

test("safe redirects work and cycles are bounded", async t => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => ++count === 2 ? new Response("ok") : new Response(null, { status: 301, headers: { location: "/decklists" } }));
  assert.equal(await (await fetchPublicResponse("https://www.mtgo.com/")).text(), "ok");
  await assert.rejects(fetchPublicResponse("https://www.mtgo.com/"));
  assert.equal(count, 7);
});

test("response bodies are bounded even without a Content-Length", async () => {
  await assert.rejects(responseBytes(new Response("123456"), 5), /サイズ上限/);
  assert.equal(new TextDecoder().decode(await responseBytes(new Response("12345"), 5)), "12345");
});
