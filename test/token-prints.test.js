import assert from "node:assert/strict";
import test from "node:test";
import { chooseTokenPrint, chooseAlternateTokenPrints, sameTokenIdentity, tokenPrintRank, sourceTokenProducts, stockTokenProduct } from "../lib/token-prints.js";
import { fetchPreferredTokenPrint, fetchAlternateTokenPrintsById } from "../lib/scryfall.js";

const setList = [
  { code: "sld", set_type: "box" },
  { code: "ttdm", set_type: "token", parent_set_code: "tdm" },
  { code: "tdm", set_type: "expansion" },
  { code: "tcmd", set_type: "token", parent_set_code: "cmd" },
  { code: "cmd", set_type: "commander" },
  { code: "teld", set_type: "token", parent_set_code: "eld" },
  { code: "eld", set_type: "expansion" },
  { code: "tinr", set_type: "token", parent_set_code: "inr" },
  { code: "inr", set_type: "masters" },
  { code: "tm21", set_type: "token", parent_set_code: "m21" },
  { code: "m21", set_type: "core" },
  { code: "tmh3", set_type: "token", parent_set_code: "mh3" },
  { code: "mh3", set_type: "draft_innovation" },
  { code: "ttdc", set_type: "token", parent_set_code: "tdc" },
  { code: "tdc", set_type: "commander", parent_set_code: "tdm" }
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

test("the source's original product outranks a newer regular reprint of the same token", () => {
  const eld = { ...regular, id: "eld-token", set: "teld", released_at: "2019-10-04" };
  const inr = { ...regular, id: "inr-token", set: "tinr", released_at: "2025-01-24" };
  assert.equal(chooseTokenPrint(inr, [inr, eld], sets, { preferredSet: "ELD" }).id, "eld-token");
  assert.equal(chooseTokenPrint(inr, [inr, { ...eld, oracle_text: "Vigilance" }], sets, { preferredSet: "ELD" }).id, "inr-token");
  assert.equal(chooseTokenPrint(inr, [inr, { ...eld, promo: true }], sets, { preferredSet: "ELD" }).id, "inr-token");
});

test("print lookup follows pagination, preserves fallback and labels network failures", async (t) => {
  const queries = [];
  const inr = { ...regular, id: "human-inr-lookup", oracle_id: "human-original-product", set: "tinr", released_at: "2025-01-24" };
  const eld = { ...inr, id: "human-eld-lookup", set: "teld", released_at: "2019-10-04" };
  t.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/sets") return Response.json({ data: setList });
    queries.push(parsed.searchParams.get("q"));
    if (parsed.searchParams.get("q")?.includes("oracleid:human-original-product")) return Response.json({ data: [inr, eld] });
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
  const originalProduct = await fetchPreferredTokenPrint(inr, { preferredSet: "ELD" });
  assert.equal(originalProduct.card.id, eld.id, "A regular remastered reference must still search for the original product");
  assert.equal(originalProduct.note, "");
  const ja = await fetchPreferredTokenPrint(regular, { lang: "ja" });
  assert.equal(ja.card, null);
  assert.ok(queries.some((q) => q?.includes("set:ttdm")));
  const fallback = await fetchPreferredTokenPrint({ ...original, id: "only", oracle_id: "only-special" });
  assert.equal(fallback.card.id, "only");
  assert.match(fallback.note, /通常パック版を確認できない/);
  const failed = await fetchPreferredTokenPrint({ ...original, id: "failed", oracle_id: "failed" });
  assert.equal(failed.card.id, "failed");
  assert.match(failed.note, /確認ができませんでした/);
  const digitalFailed = await fetchPreferredTokenPrint({ ...original, id: "failed-digital", oracle_id: "failed-digital", digital: true, games: ["mtgo"] });
  assert.equal(digitalFailed.card, null, "Network failure must never display a digital token as a paper print");
});

test("alternate 1/1 Cats must match color, abilities, type, faces and oracle identity, with one ordinary print per other product", () => {
  const cat = { ...regular, name: "Cat", type_line: "Token Creature — Cat", colors: ["W"], oracle_id: "cat-alternatives" };
  const eld = { ...cat, id: "eld-cat", set: "teld", released_at: "2019-10-04" };
  const commander = { ...cat, id: "cmd-cat", set: "tcmd", released_at: "2021-06-01" };
  const wrong = [{ power: "2" }, { toughness: "2" }, { colors: ["B"] }, { oracle_text: "Lifelink" },
    { type_line: "Token Creature — Cat Warrior" }, { oracle_id: "other-cat" },
    { card_faces: [{ name: "Cat", oracle_text: "Lifelink" }] }, { lang: "ja" },
    { digital: true, games: ["arena"] }, { released_at: "2099-01-01" }]
    .map((delta, index) => ({ ...eld, id: `wrong-cat-${index}`, ...delta }));
  const candidates = [cat, commander, ...wrong, { ...eld, id: "eld-promo", promo: true, released_at: "2025-01-01" }, eld];
  assert.deepEqual(chooseAlternateTokenPrints(cat, candidates, sets, { today: "2026-10-02" }).map((card) => card.id), ["eld-cat"]);
  assert.deepEqual(chooseAlternateTokenPrints(cat, [cat], sets), []);
});

test("stock suggestions allow expansion and core only, never special fallback or a commander child of an expansion", () => {
  const core = { ...regular, id: "core", set: "tm21" };
  const excluded = ["tcmd", "tinr", "tmh3", "ttdc", "unknown"].map(set => ({ ...regular, id: set, set }));
  excluded.push({ ...regular, id: "promo", promo: true }, { ...regular, id: "showcase", frame_effects: ["showcase"] });
  for (const card of excluded) assert.equal(stockTokenProduct(card, sets), null, card.id);
  assert.equal(stockTokenProduct(core, sets).code, "m21");
  assert.equal(chooseTokenPrint(original, excluded, sets, { stockOnly: true }), null);
  assert.deepEqual(chooseAlternateTokenPrints(original, [core, ...excluded], sets).map(card => card.id), ["core"]);
});

test("stock lookup does not shortcut Masters references and keeps the needed identity when no ordinary print exists", async (t) => {
  const masters = { ...regular, id: "stock-masters", oracle_id: "stock-oracle", set: "tinr" };
  const core = { ...masters, id: "stock-core", set: "tm21" };
  t.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/sets") return Response.json({ data: setList });
    const query = parsed.searchParams.get("q") || "";
    if (query.includes("oracleid:stock-failure")) return new Response("unavailable", { status: 400 });
    return Response.json({ data: query.includes("oracleid:stock-oracle ") ? [masters, core] : [] });
  });
  const result = await fetchPreferredTokenPrint(masters, { stockOnly: true });
  assert.equal(result.card.id, core.id);
  assert.equal(result.productCode, "m21");
  assert.equal(result.stockStatus, "available");
  const missing = { ...masters, id: "stock-missing", oracle_id: "stock-missing" };
  const fallback = await fetchPreferredTokenPrint(missing, { stockOnly: true });
  assert.equal(fallback.card.id, missing.id, "Retain required token specification, not a procurement suggestion");
  assert.equal(fallback.productCode, undefined);
  assert.equal(fallback.printUnconfirmed, true);
  assert.equal(fallback.stockStatus, "not-found");
  const failed = await fetchPreferredTokenPrint({ ...masters, id: "stock-failure", oracle_id: "stock-failure" }, { stockOnly: true });
  assert.equal(failed.stockStatus, "unconfirmed");
  assert.equal(failed.printUnconfirmed, true);
});

test("alternative lookup reuses paginated print data, maps token sets to physical products and rejects non-token cards", async (t) => {
  const cat = { ...regular, id: "alternate-cat-reference", oracle_id: "cat-list-integration", name: "Cat", type_line: "Token Creature — Cat", colors: ["W"] };
  const eld = { ...cat, id: "alternate-eld-cat", set: "teld", set_name: "Throne of Eldraine Tokens", released_at: "2019-10-04", collector_number: "1", image_uris: { normal: "https://example.test/cat.jpg" }, scryfall_uri: "https://example.test/cat" };
  let searchCount = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/sets") return Response.json({ data: setList });
    if (parsed.pathname === "/cards/search") {
      searchCount += 1;
      return Response.json(parsed.searchParams.has("page") ? { data: [eld] }
        : { data: [cat], has_more: true, next_page: "https://api.scryfall.com/cards/search?page=2" });
    }
    return Response.json(parsed.pathname.endsWith("/not-a-token") ? { ...cat, type_line: "Creature — Cat" } : cat);
  });
  assert.equal((await fetchPreferredTokenPrint(cat, { preferredSet: "ELD" })).card.id, eld.id);
  const alternatives = await fetchAlternateTokenPrintsById(cat.id, { today: "2026-10-02" });
  assert.equal(searchCount, 2, "Alternatives reuse every cached page from the preferred-print search");
  assert.equal(alternatives.length, 1);
  assert.equal(alternatives[0].set, "ELD");
  assert.equal(alternatives[0].setName, "Throne of Eldraine");
  assert.equal(alternatives[0].image, "https://example.test/cat.jpg");
  assert.equal(alternatives[0].regular, true);
  await assert.rejects(fetchAlternateTokenPrintsById("not-a-token"), /紙のトークン/);
});

test("BIG's Treasure belongs to the parent OTJ product, and Modern preparation never defaults to a newer FRA or masters print", () => {
  const catalog = new Map([
    ...setList.map((set) => [set.code, { ...set, released_at: "2021-01-01" }]),
    ["big", { code: "big", parent_set_code: "otj", set_type: "expansion", released_at: "2024-04-19" }],
    ["otj", { code: "otj", set_type: "expansion", released_at: "2024-04-19" }],
    ["totj", { parent_set_code: "otj", set_type: "token" }],
    ["fra", { code: "fra", set_type: "expansion", released_at: "2026-10-02" }],
    ["tfra", { parent_set_code: "fra", set_type: "token" }]
  ]);
  const otj = { ...regular, id: "otj-treasure", set: "totj", released_at: "2024-04-19" };
  const fra = { ...otj, id: "fra-treasure", set: "tfra", released_at: "2026-10-02" };
  const masters = { ...otj, id: "masters-treasure", set: "tinr", released_at: "2025-01-24" };
  assert.deepEqual(sourceTokenProducts("BIG", catalog), ["big", "otj"]);
  assert.equal(chooseTokenPrint(fra, [fra, otj, masters], catalog,
    { preferredSet: "BIG", modernOnly: true, sourceReleasedAt: "2024-04-19", today: "2026-10-03" }).id, otj.id);
  assert.equal(chooseTokenPrint(fra, [masters], catalog, { modernOnly: true }), null);
  assert.equal(chooseTokenPrint(fra, [fra, otj], catalog,
    { preferredSet: "missing", modernOnly: true, sourceReleasedAt: "2024-04-19", today: "2026-10-03" }).id, otj.id);
});
