import test from "node:test";
import assert from "node:assert/strict";
import { createRequestPacer } from "../lib/request-pacer.js";

test("request pacing reserves spaced starts without awaiting another request's timer", async () => {
  const waits = [], resolvers = [];
  const reserve = createRequestPacer({ now: () => 1000, sleep: ms => { waits.push(ms); return new Promise(resolve => resolvers.push(resolve)); } });
  await reserve(550);
  const abandoned = reserve(550);
  const later = reserve(550);
  assert.deepEqual(waits, [550, 1100]);
  resolvers[1]();
  await later; // Finishes even if the previous invocation has been cancelled.
  resolvers[0](); await abandoned;
});

test("an idle pacer starts immediately and preserves the selected endpoint interval", async () => {
  let now = 1000;
  const waits = [], reserve = createRequestPacer({ now: () => now, sleep: async ms => waits.push(ms) });
  await reserve(125);
  await reserve(550);
  now = 5000;
  await reserve(550);
  await reserve(125);
  assert.deepEqual(waits, [550, 125]);
});
