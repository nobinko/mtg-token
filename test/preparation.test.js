import test from "node:test";
import assert from "node:assert/strict";
import { preparationWindow, preparationSources } from "../lib/preparation.js";
import { buildBulkObjects } from "../lib/tokens.js";
import { findCardMentions } from "../lib/search.js";
import { mergeEnvironmentEvents } from "../lib/environment.js";

const formats = ["standard", "pioneer", "modern", "legacy"];
const events = [
  { date: "2026-08-10", type: "banned-restricted", title: "previous", formatsAffected: formats },
  { date: "2026-09-25", type: "set-release", title: "new set", formatsAffected: formats }
];
test("all four formats use previous environment, never future decks or the new set window", () => {
  for (const format of formats) {
    const window = preparationWindow(events, format, "2026-10-03", { setCode: "FRA", startsAt: "2026-09-25" }, "2026-09-07");
    assert.equal(window.startDate, "2026-08-10");
    assert.equal(window.endDate, "2026-09-07");
    assert.equal(window.setCode, "fra");
    assert.equal(preparationWindow(events, format, "2026-10-03", { setCode: "fra", startsAt: "2026-09-25" }, "2026-10-03").endDate, "2026-09-24");
  }
});
test("invalid preparation boundaries are rejected", () => {
  for (const input of [{ setCode: "fra", startsAt: "2026-02-30" }, { setCode: "fra", startsAt: "2026-10-04" }, { setCode: "fra or legal:all", startsAt: "2026-09-25" }]) {
    assert.throws(() => preparationWindow(events, "modern", "2026-10-03", input));
  }
});
test("new set candidates exist without decks, known bans excluded, future legality labeled", async () => {
  const base = { id: "a", name: "Example", set: "fra", set_name: "Fixture", oracle_text: "Create a token that's a copy of target creature.", type_line: "Sorcery" };
  const cards = [{ ...base, legalities: { modern: "not_legal" } }, { ...base, id: "b", name: "Banned", legalities: { modern: "banned" } }];
  const sources = preparationSources(cards, "modern", "2026-09-25", "2026-09-07");
  assert.equal(sources.length, 1);
  assert.equal(sources[0].legalityUnconfirmed, true);
  const objects = await buildBulkObjects(sources, { enrichJapaneseAssets: false });
  assert.equal(objects.length, 1);
  assert.equal(objects[0].deckCount, 0);
  assert.equal(preparationSources(cards, "modern", "2026-09-25", "2026-10-03").length, 0);
});
test("same set official effective date overrides automatic global release date", () => {
  const manual = [{ ...events[1], setCode: "fra" }];
  assert.equal(mergeEnvironmentEvents(manual, [{ ...manual[0], date: "2026-10-02" }]).length, 1);
});
test("page prose cannot reintroduce cards outside extracted decks", () => {
  const cards = [{ id: "a", name: "Excluded Card" }];
  assert.equal(findCardMentions(cards, [{ text: "Excluded Card", deckEntries: [] }]).length, 0);
  assert.equal(findCardMentions(cards, [{ text: "Excluded Card", deckEntries: [{ cards: ["Other Card"], text: "", url: "a", pageUrl: "a" }] }]).length, 0);
});
test("full deck URL union prevents double counting beyond display limit", async () => {
  const urls = Array.from({ length: 60 }, (_, i) => `https://example.com/${i}`);
  const source = { name: "A", id: "a", set: "TST", setName: "Test", raw: { oracle_text: "Create a token that's a copy of target creature." }, deckCount: 60,
    deckUrls: urls, decks: urls.slice(0, 24).map((url) => ({ url })), sources: [] };
  const objects = await buildBulkObjects([source, { ...source, id: "b", name: "B" }], { enrichJapaneseAssets: false });
  assert.equal(objects[0].deckCount, 60);
});
