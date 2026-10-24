import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUpdateStore, confirmedEvents, validateEnvironmentPack } from "../lib/updates.js";
import { resolveEnvironmentFromEvents } from "../lib/environment.js";
import { candidateQueryVersion } from "../lib/scryfall.js";
import { setEventVersion } from "../lib/set-events.js";

const pack = {
  schemaVersion: 1, minimumReaderVersion: 1,
  events: [
    { date: "2026-06-01", effectiveDate: "2026-06-03", type: "banned-restricted", title: "June", sourceUrl: "https://example.com/june", formatsAffected: ["modern"] },
    { date: "2026-08-01", effectiveDate: "2026-08-04", type: "banned-restricted", title: "August", sourceUrl: "https://example.com/august", formatsAffected: ["modern"] }
  ]
};
const deps = { fetchSets: async () => [{ date: "2026-05-01" }], fetchCandidates: async () => [{ name: "Candidate" }] };

test("bundled October announcement clears the old warning until the next announcement deadline", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mtg-update-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-11T23:59:59Z") });
  const store = createUpdateStore({ path: join(directory, "active.json") });
  const { pack: bundled } = await store.read();
  const announcement = bundled.events.find((event) => event.date === "2026-10-12");
  assert.equal(announcement.announcedAt, "2026-10-12");
  assert.equal(announcement.effectiveDate, "2026-10-12");
  assert.equal(announcement.nextAnnouncementDate, "2026-11-30");
  assert.equal((await store.status()).lastEvent, "2026-09-25");

  for (const date of ["2026-10-12T00:00:00Z", "2026-10-24T00:00:00Z", "2026-11-30T23:59:59Z"]) {
    t.mock.timers.setTime(Date.parse(date));
    const status = await store.status();
    assert.equal(status.announcementOverdue, false, date);
    assert.equal(status.lastEvent, "2026-10-12");
    assert.equal(status.verifiedThrough, null, "One verified announcement is not a full-history audit");
    assert.deepEqual(status.pending, []);
  }
  t.mock.timers.setTime(Date.parse("2026-12-01T00:00:00Z"));
  assert.equal((await store.status()).announcementOverdue, true);
});

test("old ZIP reader loads complete history, uses effective date, persists across restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mtg-update-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { path: join(directory, "active.json"), fetcher: async () => new Response(JSON.stringify(pack)) };
  const store = createUpdateStore(options);
  assert.equal((await store.status()).checkedAt, null);
  await store.update("modern", deps);
  const restored = await createUpdateStore(options).read();
  assert.equal(restored.pack.events.length, 2);
  assert.equal(restored.candidateQueryVersion, candidateQueryVersion);
  assert.equal(restored.setEventVersion, setEventVersion);
  assert.equal(resolveEnvironmentFromEvents(confirmedEvents(restored.pack), "modern", "2026-08-02").startDate, "2026-06-03");
  assert.equal(resolveEnvironmentFromEvents(confirmedEvents(restored.pack), "modern", "2026-09-07").startDate, "2026-08-04");
  const before = await readFile(options.path, "utf8");
  await assert.rejects(store.update("modern", { ...deps, fetchCandidates: async () => { throw new Error("offline"); } }), /offline/);
  assert.equal(await readFile(options.path, "utf8"), before);
  assert.match((await store.status()).error, /offline/);
});

test("unsupported or malformed downloads never replace active data", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mtg-update-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let responsePack = pack;
  const store = createUpdateStore({ path: join(directory, "active.json"), fetcher: async () => new Response(JSON.stringify(responsePack)) });
  await store.update("modern", deps);
  const before = await store.read();
  responsePack = { ...pack, schemaVersion: 2 };
  await assert.rejects(store.update("modern", deps), /本体の更新/);
  assert.equal(await store.read(), before);
  responsePack = { ...pack, events: [] };
  await assert.rejects(store.update("modern", deps), /不正/);
  assert.equal(await store.read(), before);
});

test("detected dates are not silently promoted to confirmed effective dates", () => {
  const pending = { ...pack, events: [{ ...pack.events[0], autoDetected: true }] };
  assert.equal(confirmedEvents(pending).length, 0);
  pending.events[0].confirmed = true;
  assert.equal(confirmedEvents(pending)[0].date, "2026-06-03");
  assert.throws(() => validateEnvironmentPack({ ...pack, events: [{ ...pack.events[0], effectiveDate: "2026-02-30" }] }));
});

test("concurrent updates are rejected and empty refresh cannot become success", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mtg-update-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const store = createUpdateStore({ path: join(directory, "active.json"), fetcher: async () => { await gate; return new Response(JSON.stringify(pack)); } });
  const first = store.update("modern", deps);
  await assert.rejects(store.update("modern", deps), /更新中/);
  release();
  await first;
  await assert.rejects(store.update("modern", { ...deps, fetchCandidates: async () => [] }), /空/);
  assert.equal(store.busy, false);
});
