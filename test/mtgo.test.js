import test from "node:test";
import assert from "node:assert/strict";
import { expandMtgoSources } from "../lib/mtgo.js";
import { isDeckResultPage } from "../lib/deck.js";
import { toIsoDate } from "../lib/util.js";

test("MTGO includes previous months in the environment rather than only the current month", () => {
  const urls = expandMtgoSources(["https://www.mtgo.com/decklists", "https://mtgtop8.com/format?f=MO"], "2025-12-25", "2026-02-01", "2026-01-02");
  assert.deepEqual(urls, ["https://www.mtgo.com/decklists", "https://www.mtgo.com/decklists/2025/12", "https://mtgtop8.com/format?f=MO"]);
  assert.equal(isDeckResultPage(urls[0], urls), false);
  assert.deepEqual(expandMtgoSources([urls[0]], "2026-09-25", "2026-09-30", "2026-10-02"), ["https://www.mtgo.com/decklists/2026/09"]);
});

test("MTGO archive URLs use the official two-digit month route across a month boundary", () => {
  // The site's year/month picker emits /2026/09; /2026/9 silently returns the current month.
  assert.deepEqual(expandMtgoSources(["https://www.mtgo.com/decklists"], "2026-09-25", "2026-10-03", "2026-10-03"),
    ["https://www.mtgo.com/decklists", "https://www.mtgo.com/decklists/2026/09"]);
  assert.deepEqual(expandMtgoSources(["https://www.mtgo.com/decklists"], "2026-01-31", "2026-02-01", "2026-10-03"),
    ["https://www.mtgo.com/decklists/2026/02", "https://www.mtgo.com/decklists/2026/01"]);
});

test("Japanese calendar dates preserve the printed day regardless of local timezone", () => {
  assert.equal(toIsoDate("2026/9/26 00:00"), "2026-09-26");
  assert.equal(toIsoDate("2026-09-26T00:00:00+09:00"), "2026-09-26");
});
