import assert from "node:assert/strict";
import test from "node:test";
import { chooseTokenPrint, sameTokenIdentity, tokenPrintRank } from "../lib/token-prints.js";
import { fetchPreferredTokenPrint } from "../lib/scryfall.js";

const setList = [
  { code: "sld", set_type: "box" },
  { code: "ttdm", set_type: "token", parent_set_code: "tdm" },
  { code: "tdm", set_type: "expansion" },
  { code: "tcmd", set_type: "token", parent_set_code: "cmd" },
  { code: "cmd", set_type: "commander" }
];
const sets = new Map(setList.map((set) => [set.code, set]));
const original = { id: "special", oracle_id: "goblin-1-1", name: "Goblin", type_line: "Token Creature — Goblin", oracle_text: "", power: "1", toughness: "1", colors: ["R"], set: "sld", lang: "en", games: ["paper"], released_at: "2026-05-18", booster: false };
const regular = { ...original, id: "regular", set: "ttdm", released_at: "2025-04-11" };

test("regular booster product tokens outrank newer Secret Lair and commander prints even with booster:false", () => {
  const commander = { ...original, id: "commander", set: "tcmd", released_at: "2026-06-01" };
  assert.equal(tokenPrintRank(regular, sets), 0);
  assert.equal(chooseTokenPrint(original, [original, commander, regular], sets).id, "regular");
});

test("same name is insufficient: reject different abilities, size, color and oracle identity", () => {
  for (const delta of [{ oracle_id: "other" }, { power: "2" }, { colors: ["B"] }, { oracle_text: "Haste" }, { type_line: "Token Creature — Goblin Army" }]) {
    const different = { ...regular, ...delta };
    assert.equal(sameTokenIdentity(original, different), false);
    assert.equal(chooseTokenPrint(original, [different], sets), null);
  }
});

test("exclude digital and future prints; promos and special frames never count as regular", () => {
  const digital = { ...regular, games: ["mtgo"], digital: true };
  const future = { ...regular, released_at: "2099-01-01" };
  assert.equal(chooseTokenPrint(original, [digital, future], sets), null);
  assert.equal(tokenPrintRank({ ...regular, promo: true }, sets), 2);
  assert.equal(tokenPrintRank({ ...regular, frame_effects: ["showcase"] }, sets), 2);
});

test("Japanese images must match both token identity and selected product", () => {
  const jaRegular = { ...regular, id: "ja-regular", lang: "ja" };
  const jaSpecial = { ...original, id: "ja-special", lang: "ja" };
  assert.equal(chooseTokenPrint(regular, [jaSpecial, jaRegular], sets, { lang: "ja", sameSet: true }).id, "ja-regular");
  assert.equal(chooseTokenPrint(regular, [jaSpecial], sets, { lang: "ja", sameSet: true }), null);
});

test("print lookup follows pagination, preserves fallback and labels network failures", async (t) => {
  const queries = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/sets") return Response.json({ data: setList });
    queries.push(parsed.searchParams.get("q"));
    if (parsed.searchParams.get("q")?.includes("oracleid:failed")) return new Response("unavailable", { status: 400 });
    if (parsed.searchParams.get("q")?.includes("oracleid:only-special")) return Response.json({ data: [{ ...original, id: "only", oracle_id: "only-special" }] });
    if (parsed.searchParams.get("q")?.includes("lang:ja")) return Response.json({ data: [{ ...original, lang: "ja" }] });
    return Response.json(parsed.searchParams.has("page")
      ? { data: [regular], has_more: false }
      : { data: [original], has_more: true, next_page: "https://api.scryfall.com/cards/search?page=2" });
  });
  const selected = await fetchPreferredTokenPrint(original);
  assert.equal(selected.card.id, "regular");
  assert.equal(selected.note, "");
  const ja = await fetchPreferredTokenPrint(regular, { lang: "ja" });
  assert.equal(ja.card, null);
  assert.ok(queries.some((q) => q?.includes("set:ttdm")));
  const fallback = await fetchPreferredTokenPrint({ ...original, id: "only", oracle_id: "only-special" });
  assert.equal(fallback.card.id, "only");
  assert.match(fallback.note, /通常パック版を確認できない/);
  const failed = await fetchPreferredTokenPrint({ ...original, id: "failed", oracle_id: "failed" });
  assert.equal(failed.card.id, "failed");
  assert.match(failed.note, /確認ができませんでした/);
});
