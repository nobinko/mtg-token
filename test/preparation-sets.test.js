import assert from "node:assert/strict";
import test from "node:test";
import { preparationSetChoices } from "../lib/preparation-sets.js";
import { setReleaseEventsFromSets } from "../lib/set-events.js";

const sets = [
  { code: "hob", name: "The Hobbit", set_type: "expansion", released_at: "2026-08-14" },
  { code: "fra", name: "Reality Fracture", set_type: "expansion", released_at: "2026-10-02" },
  { code: "frc", name: "Reality Fracture Commander", set_type: "commander", released_at: "2026-10-02" },
  { code: "trk", name: "Star Trek", set_type: "expansion", released_at: "2026-11-13" },
  { code: "digital", name: "Digital", set_type: "expansion", digital: true, released_at: "2026-10-03" },
  { code: "tfra", name: "Tokens", set_type: "token", released_at: "2026-10-02" },
  { code: "old", name: "Old", set_type: "core", released_at: "2025-01-01" }
];
const formats = ["standard", "pioneer", "modern", "legacy"];
const events = [{ type: "set-release", setCode: "fra", setName: "リアリティ・フラクチャー / Reality Fracture", date: "2026-10-02", effectiveDate: "2026-09-25", title: "Reality Fracture tabletop legality", formatsAffected: formats }];

test("MBC preparation uses Legacy legality rather than its sales date", () => {
  const catalog = [{ code: "mbc", name: "Mystery Booster Commander Edition", set_type: "draft_innovation", released_at: "2026-10-19" }];
  const before = preparationSetChoices(catalog, [], "legacy", "2026-11-15");
  assert.equal(before.choices[0].startsAt, "2027-01-01");
  assert.equal(before.choices[0].eligible, false);
  assert.equal(before.choices[0].confirmed, true);
  assert.equal(before.recommendedCode, "");
  assert.equal(preparationSetChoices(catalog, [], "legacy", "2027-01-01").recommendedCode, "mbc");
});

test("direct-to-Modern supplemental sets are normal preparation choices and affect only their formats", () => {
  const catalog = [
    { code: "ltr", name: "The Lord of the Rings", set_type: "draft_innovation", released_at: "2023-06-23" },
    { code: "ltc", name: "Lord of the Rings Commander", set_type: "commander", parent_set_code: "ltr", released_at: "2023-06-23" },
    { code: "mh3", name: "Modern Horizons 3", set_type: "draft_innovation", released_at: "2024-06-14" },
    { code: "acr", name: "Assassin's Creed", set_type: "expansion", released_at: "2024-07-05" },
    { code: "inr", name: "Innistrad Remastered", set_type: "masters", released_at: "2024-07-01" }
  ];
  assert.equal(preparationSetChoices(catalog, [], "modern", "2023-07-01").recommendedCode, "ltr");
  assert.deepEqual(preparationSetChoices(catalog, [], "standard", "2023-07-01").choices, []);
  const choices = preparationSetChoices(catalog, [], "modern", "2024-07-10");
  assert.deepEqual(choices.choices.map((choice) => choice.code), ["acr", "mh3"]);
  assert.equal(choices.recommendedCode, "acr");
  assert.ok(choices.choices.every((choice) => choice.typeLabel === "モダン収録セット"));
  assert.deepEqual(preparationSetChoices(catalog, [], "pioneer", "2024-07-10").choices, []);
  const releases = setReleaseEventsFromSets(catalog);
  assert.deepEqual(releases.find((event) => event.setCode === "ltr").formatsAffected, ["modern", "legacy"]);
  assert.deepEqual(releases.find((event) => event.setCode === "acr").formatsAffected, ["modern", "legacy"]);
  assert.deepEqual(releases.find((event) => event.setCode === "ltc").formatsAffected, ["legacy"]);
  assert.equal(releases.some((event) => event.setCode === "inr"), false);
});

test("all formats recommend the pre-event expansion, using official effective date rather than release", () => {
  for (const format of formats) {
    const result = preparationSetChoices(sets, events, format, "2026-10-03");
    assert.equal(result.recommendedCode, "fra");
    const selected = result.choices.find((choice) => choice.code === "fra");
    assert.equal(selected.startsAt, "2026-09-25");
    assert.equal(selected.releasedAt, "2026-10-02");
    assert.equal(selected.daysBefore, 8);
    assert.equal(selected.confirmed, true);
    assert.match(selected.name, /リアリティ/);
    assert.equal(result.choices.find((choice) => choice.code === "trk").eligible, false);
    assert.ok(!result.choices.some((choice) => ["old", "digital", "tfra"].includes(choice.code)));
    assert.equal(result.choices.some((choice) => choice.code === "frc"), format === "legacy");
  }
});

test("changing event date changes recommendation; tentative dates are explicitly labeled", () => {
  const before = preparationSetChoices(sets, events, "modern", "2026-09-12");
  assert.equal(before.recommendedCode, "hob");
  assert.equal(before.choices.find((choice) => choice.code === "fra").eligible, false);
  const after = preparationSetChoices(sets, events, "modern", "2026-11-20");
  assert.equal(after.recommendedCode, "trk");
  assert.equal(after.choices.find((choice) => choice.code === "trk").confirmed, false);
  assert.match(after.choices.find((choice) => choice.code === "trk").description, /未確認/);
});

test("offline choices fall back to recorded set names, but unconfirmed events never become official", () => {
  const offline = preparationSetChoices([], events, "modern", "2026-10-03");
  assert.equal(offline.recommendedCode, "fra");
  assert.equal(offline.choices[0].releasedAt, "");
  const unconfirmed = preparationSetChoices(sets, [{ ...events[0], autoDetected: true }], "modern", "2026-10-03");
  assert.equal(unconfirmed.choices.find((choice) => choice.code === "fra").startsAt, "2026-10-02");
  assert.equal(unconfirmed.choices.find((choice) => choice.code === "fra").confirmed, false);
});

test("empty catalogs and invalid input cannot suggest arbitrary or future sets", () => {
  assert.deepEqual(preparationSetChoices([], [], "modern", "2026-10-03"), { choices: [], recommendedCode: "" });
  assert.equal(preparationSetChoices(sets, events, "modern", "2026-07-01").recommendedCode, "");
  assert.throws(() => preparationSetChoices(sets, events, "commander", "2026-10-03"));
  assert.throws(() => preparationSetChoices(sets, events, "modern", "2026-02-30"));
});
