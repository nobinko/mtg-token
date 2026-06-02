import assert from "node:assert/strict";
import test from "node:test";

import { maxMatchedCards, scryfallCacheTtlMs, scryfallSearchDelayMs } from "../lib/config.js";

test("source-card object matching cap covers the largest supported deck search", () => {
  assert.ok(maxMatchedCards >= 600);
});

test("Scryfall search requests stay under the documented rate limit", () => {
  assert.ok(scryfallSearchDelayMs >= 500);
});

test("Scryfall candidate cache lasts at least one day", () => {
  assert.ok(scryfallCacheTtlMs >= 24 * 60 * 60 * 1000);
});
