import test from "node:test";
import assert from "node:assert/strict";
import { isPaperLegalCard } from "../lib/card-legality.js";
import { fetchSearchCandidates } from "../lib/scryfall.js";
import { preparationSources } from "../lib/preparation.js";
import { chooseTokenPrint } from "../lib/token-prints.js";

const paper = { name: "Castle Ardenvale", games: ["paper", "mtgo"], legalities: { modern: "legal" }, set: "inr" };
const invalid = [{ ...paper, digital: true }, { ...paper, games: ["arena"] }, { ...paper, legalities: { modern: "banned" } }, { ...paper, legalities: { modern: "not_legal" } }, { ...paper, games: undefined }];

test("paper source cards use card legality rather than a remastered set whitelist", () => {
  assert.equal(isPaperLegalCard(paper, "modern"), true);
  for (const card of invalid) assert.equal(isPaperLegalCard(card, "modern"), false);
  assert.equal(preparationSources([paper, ...invalid], "modern", "2026-09-25", "2026-10-02").length, 1);
});

test("saved candidates cannot reintroduce banned or digital source cards", async () => {
  const result = await fetchSearchCandidates("modern", { format: "modern", candidates: [paper, ...invalid], checkedAt: new Date().toISOString() });
  assert.deepEqual(result.cards, [paper]);
});

test("paper Human token from Innistrad Remastered remains valid regardless of token legalities", () => {
  const token = { id: "human", oracle_id: "human-white-1-1", name: "Human", type_line: "Token Creature — Human", colors: ["W"], power: "1", toughness: "1", set: "tinr", lang: "en", games: ["paper"], released_at: "2025-01-24", legalities: { modern: "not_legal" } };
  const sets = new Map([["tinr", { set_type: "token", parent_set_code: "inr" }], ["inr", { set_type: "masters" }]]);
  assert.equal(chooseTokenPrint(token, [token], sets).id, "human");
});
