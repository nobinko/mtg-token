import assert from "node:assert/strict";
import test from "node:test";

import { isFreshCacheEntry } from "../lib/cache.js";

test("isFreshCacheEntry expires seed cache entries by age", () => {
  const now = Date.now();
  const fresh = { fetchedAt: new Date(now - 60 * 1000).toISOString() };
  const old = { fetchedAt: new Date(now - 7 * 60 * 60 * 1000).toISOString() };
  const sixHours = 6 * 60 * 60 * 1000;

  assert.equal(isFreshCacheEntry(fresh, sixHours), true);
  assert.equal(isFreshCacheEntry(old, sixHours), false);
});

test("isFreshCacheEntry treats missing max age as no expiry", () => {
  const ancient = { fetchedAt: "2020-01-01T00:00:00.000Z" };
  assert.equal(isFreshCacheEntry(ancient, 0), true);
  assert.equal(isFreshCacheEntry(ancient, undefined), true);
});

test("isFreshCacheEntry rejects entries without a readable fetchedAt when max age is set", () => {
  assert.equal(isFreshCacheEntry({}, 1000), false);
  assert.equal(isFreshCacheEntry({ fetchedAt: "not-a-date" }, 1000), false);
});
