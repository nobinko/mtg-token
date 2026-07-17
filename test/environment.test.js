import assert from "node:assert/strict";
import test from "node:test";

import { mergeEnvironmentEvents, resolveEnvironmentFromEvents } from "../lib/environment.js";
import { setReleaseEventsFromSets } from "../lib/set-events.js";

const banEvent = {
  date: "2026-06-29",
  type: "banned-restricted",
  title: "B&R June 29",
  formatsAffected: ["legacy"],
  formatsUnchanged: ["standard"],
  changes: { legacy: "Card was banned in Legacy.", standard: "No changes." }
};

test("setReleaseEventsFromSets keeps only paper expansions and cores", () => {
  const events = setReleaseEventsFromSets([
    { name: "Big Expansion", set_type: "expansion", released_at: "2026-06-26", digital: false, scryfall_uri: "https://scryfall.com/sets/big" },
    { name: "Core Set", set_type: "core", released_at: "2026-01-01", digital: false },
    { name: "Commander Product", set_type: "commander", released_at: "2026-06-26", digital: false },
    { name: "Digital Only", set_type: "expansion", released_at: "2026-06-26", digital: true },
    { name: "Unreleased", set_type: "expansion", digital: false }
  ]);

  assert.deepEqual(events.map((event) => event.title), ["Big Expansion tabletop release", "Core Set tabletop release"]);
  assert.equal(events[0].formatsAffected.length, 4);
  assert.equal(events[0].changes.standard, "Big Expansion became legal in Standard.");
});

test("mergeEnvironmentEvents prefers manual entries over same-day auto entries", () => {
  const manual = [{ date: "2026-06-26", type: "set-release", title: "Manual entry" }];
  const auto = [
    { date: "2026-06-26", type: "set-release", title: "Auto entry" },
    { date: "2026-08-14", type: "set-release", title: "Future set" }
  ];

  const merged = mergeEnvironmentEvents(manual, auto);

  assert.deepEqual(merged.map((event) => event.title), ["Manual entry", "Future set"]);
});

test("resolveEnvironmentFromEvents uses the latest affecting event as the start date", () => {
  const setEvent = setReleaseEventsFromSets([
    { name: "New Set", set_type: "expansion", released_at: "2026-06-26", digital: false }
  ]);
  const events = mergeEnvironmentEvents([banEvent], setEvent);

  const legacy = resolveEnvironmentFromEvents(events, "legacy", "2026-07-18");
  assert.equal(legacy.resolved, true);
  assert.equal(legacy.startDate, "2026-06-29");

  const standard = resolveEnvironmentFromEvents(events, "standard", "2026-07-18");
  assert.equal(standard.startDate, "2026-06-26");
});

test("resolveEnvironmentFromEvents ignores future events until the target date reaches them", () => {
  const events = setReleaseEventsFromSets([
    { name: "Current Set", set_type: "expansion", released_at: "2026-06-26", digital: false },
    { name: "The Hobbit", set_type: "expansion", released_at: "2026-08-14", digital: false }
  ]);

  const before = resolveEnvironmentFromEvents(events, "standard", "2026-07-18");
  assert.equal(before.startDate, "2026-06-26");

  const after = resolveEnvironmentFromEvents(events, "standard", "2026-08-15");
  assert.equal(after.startDate, "2026-08-14");
});

test("resolveEnvironmentFromEvents refuses to resolve without an affecting event", () => {
  const result = resolveEnvironmentFromEvents([banEvent], "modern", "2026-07-18");
  assert.equal(result.resolved, false);
  assert.equal(result.startDate, "");
});
