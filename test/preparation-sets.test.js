import assert from "node:assert/strict";
import test from "node:test";
import { preparationSetChoices } from "../lib/preparation-sets.js";

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
