import test from "node:test";
import assert from "node:assert/strict";
import { createRequestLogs, logContext } from "../lib/request-logs.js";

const flush = () => new Promise(resolve => setImmediate(resolve));
test("logs isolate replay and live streams by server session, even with an identical client run ID", async () => {
  const logs = createRequestLogs();
  const receivedA = [], receivedB = [];
  const a = { sessionScope: "server-session-a", runId: "same-client-run" };
  const b = { sessionScope: "server-session-b", runId: "same-client-run" };
  logs.publish(a, "A replay"); logs.publish(b, "B replay");
  const offA = logs.subscribe(a.sessionScope, entry => receivedA.push(entry.line));
  const offB = logs.subscribe(b.sessionScope, entry => receivedB.push(entry.line));
  await Promise.all([a, b].map(context => logContext.run(context, async () => {
    await flush(); logs.publish(logContext.getStore(), `${context === a ? "A" : "B"} live`);
  })));
  logs.publish(undefined, "process secret");
  logs.publish({ ...a, privateTournament: true }, "private player");
  await flush();
  assert.deepEqual(receivedA, ["A replay", "A live"]);
  assert.deepEqual(receivedB, ["B replay", "B live"]);
  offA(); offB(); logs.clear(a.sessionScope);
  const afterLogout = []; logs.subscribe(a.sessionScope, entry => afterLogout.push(entry)); await flush();
  assert.deepEqual(afterLogout, []);
});

test("log buffers expire, are bounded, and omit URL credentials and query strings", async () => {
  let now = 1000;
  const logs = createRequestLogs({ now: () => now, maxEntries: 2, ttlMs: 100 });
  const context = { sessionScope: "a" };
  logs.publish(context, "discarded"); logs.publish(context, "retained");
  logs.publish(context, "https://synthetic:secret@mtgtop8.com/event?token=private#private password=private");
  const lines = []; logs.subscribe("a", entry => lines.push(entry.line)); await flush();
  assert.equal(lines.length, 2); assert.doesNotMatch(lines.join(" "), /secret|private|synthetic|discarded/);
  now += 101;
  const expired = []; logs.subscribe("a", entry => expired.push(entry)); await flush(); assert.deepEqual(expired, []);
});
