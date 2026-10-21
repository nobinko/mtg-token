import test from "node:test";
import assert from "node:assert/strict";
import { createRequestLogs, logContext } from "../lib/request-logs.js";

const flush = () => new Promise(resolve => setImmediate(resolve));
test("logs isolate replay and live streams by server session, even with an identical client run ID", async () => {
  const logs = createRequestLogs();
  const a = { sessionScope: "server-session-a", runId: "same-client-run" };
  const b = { sessionScope: "server-session-b", runId: "same-client-run" };
  logs.publish(a, "A replay"); logs.publish(b, "B replay");
  await Promise.all([a, b].map(context => logContext.run(context, async () => {
    await flush(); logs.publish(logContext.getStore(), `${context === a ? "A" : "B"} live`);
  })));
  logs.publish(undefined, "process secret");
  logs.publish({ ...a, privateTournament: true }, "private player");
  await flush();
  assert.deepEqual(logs.since(a.sessionScope).map(item => item.entry.line), ["A replay", "A live"]);
  assert.deepEqual(logs.since(b.sessionScope).map(item => item.entry.line), ["B replay", "B live"]);
  const cursor = logs.since(a.sessionScope).at(-1).id;
  assert.deepEqual(logs.since(a.sessionScope, cursor), []);
  logs.clear(a.sessionScope);
  assert.deepEqual(logs.since(a.sessionScope), []);
});

test("log buffers expire, are bounded, and omit URL credentials and query strings", async () => {
  let now = 1000;
  const logs = createRequestLogs({ now: () => now, maxEntries: 2, ttlMs: 100 });
  const context = { sessionScope: "a" };
  logs.publish(context, "discarded"); logs.publish(context, "retained");
  logs.publish(context, "https://synthetic:secret@mtgtop8.com/event?token=private#private password=private");
  const lines = logs.since("a").map(item => item.entry.line);
  assert.equal(lines.length, 2); assert.doesNotMatch(lines.join(" "), /secret|private|synthetic|discarded/);
  now += 101;
  assert.deepEqual(logs.since("a"), []);
});
