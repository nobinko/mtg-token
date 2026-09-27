import assert from "node:assert/strict";
import test from "node:test";

import { fetchCardMetadata } from "../lib/scryfall.js";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { createGoldfishGame, cycleGoldfishFace, restoreGoldfishGame, mulliganGoldfish } from "../public/goldfish.js";

test("fetchCardMetadata batches names and returns public playtest metadata", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({
        data: [{
          name: "Dryad Arbor",
          type_line: "Land Creature — Forest Dryad",
          image_uris: { normal: "https://img.test/dryad.jpg" },
          oracle_text: "Dryad Arbor is green.",
          power: "1",
          toughness: "1"
        }],
        not_found: [{ name: "Definitely Missing" }]
      })
    };
  };

  try {
    const cards = await fetchCardMetadata(["Dryad Arbor", "Definitely Missing"]);
    assert.equal(request.url, "https://api.scryfall.com/cards/collection");
    assert.equal(request.options.method, "POST");
    assert.deepEqual(JSON.parse(request.options.body), {
      identifiers: [{ name: "Dryad Arbor" }, { name: "Definitely Missing" }]
    });
    assert.deepEqual(cards[0], {
      name: "Dryad Arbor",
      requestedName: "Dryad Arbor",
      printedName: "Dryad Arbor",
      language: "en",
      typeLine: "Land Creature — Forest Dryad",
      imageUrl: "https://img.test/dryad.jpg",
      oracleText: "Dryad Arbor is green.",
      manaCost: "",
      power: "1",
      toughness: "1",
      faces: []
    });
    assert.deepEqual(cards[1], { name: "Definitely Missing", unavailable: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Japanese metadata resolves both faces, preserves requested names and never replaces the English cache", async (t) => {
  const name = "Gallery Front // Gallery Back";
  const en = { name, lang: "en", card_faces: [{ name: "Gallery Front", type_line: "Creature", image_uris: { normal: "front-en" } }, { name: "Gallery Back", type_line: "Land", image_uris: { normal: "back-en" } }] };
  const ja = { ...en, lang: "ja", card_faces: en.card_faces.map((face, index) => ({ ...face, printed_name: index ? "裏面" : "表面", image_uris: { normal: index ? "back-ja" : "front-ja" } })) };
  const queries = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/cards/collection") return Response.json({ data: [en, { name: "English Gallery Only", lang: "en", image_uris: { normal: "only-en" } }], not_found: [{ name: "Gallery Missing" }] });
    queries.push(parsed.searchParams.get("q"));
    return Response.json({ data: parsed.searchParams.get("q").includes(name) ? [ja] : [] });
  });
  const names = ["Gallery Front", "English Gallery Only", "Gallery Missing"];
  const translated = await fetchCardMetadata(names, { language: "ja" });
  assert.equal(translated[0].requestedName, "Gallery Front");
  assert.equal(translated[0].name, name);
  assert.equal(translated[0].printedName, "表面 // 裏面");
  assert.equal(translated[0].language, "ja");
  assert.deepEqual(translated[0].faces.map((face) => face.imageUrl), ["front-ja", "back-ja"]);
  assert.equal(translated[1].language, "en");
  assert.equal(translated[1].japaneseImageUnavailable, true);
  assert.equal(translated[1].imageUrl, "only-en");
  assert.equal(translated[2].unavailable, true);
  assert.equal(queries.length, 2);
  const english = await fetchCardMetadata(names);
  assert.equal(english[0].imageUrl, "front-en");
  assert.equal(english[0].language, "en");
  assert.equal(english[1].japaneseImageUnavailable, undefined);
  await fetchCardMetadata(names, { language: "ja" });
  assert.equal(queries.length, 2, "Language switches reuse the Japanese print cache");
});

test("front-face metadata resolves canonical names, survives caching, and preserves deck/save identity", async (t) => {
  let requests = 0;
  const fronts = ["Boggart Trawler", "Sink into Stupor", "Tamiyo, Inquisitive Student"];
  const backs = ["Boggart Bog", "Soporific Springs", "Tamiyo, Seasoned Scholar"];
  t.mock.method(globalThis, "fetch", async () => {
    requests += 1;
    return Response.json({ data: fronts.map((name, index) => ({
      name: `${name} // ${backs[index]}`,
      type_line: "Creature // Land",
      card_faces: [
        { name, type_line: index === 1 ? "Instant" : "Creature", image_uris: { normal: `front-${index}` } },
        { name: backs[index], type_line: index === 2 ? "Planeswalker" : "Land", image_uris: { normal: `back-${index}` } }
      ]
    })), not_found: [] });
  });
  const metadata = await fetchCardMetadata(fronts);
  assert.deepEqual(metadata.map((card) => card.requestedName), fronts);
  assert.ok(metadata.every((card) => !card.unavailable && card.faces.length === 2));
  const cached = await fetchCardMetadata([fronts[0], backs[0], `${fronts[0]} // ${backs[0]}`]);
  assert.ok(cached.every((card) => card.faces.length === 2));
  assert.equal(requests, 1);
  const rows = [{ name: fronts[0], count: 8 }];
  const merged = mergeCardMetadata(rows, metadata);
  assert.equal(merged[0].name, rows[0].name);
  assert.equal(merged[0].count, 8);
  assert.equal(merged[0].typeLine, "Creature");
  const game = createGoldfishGame(merged);
  assert.equal(game.hand[0].lane, "creature");
  const flipped = cycleGoldfishFace(game, [game.hand[0].id]);
  assert.equal(flipped.hand[0].faces[flipped.hand[0].faceIndex].name, backs[0]);
  assert.equal(restoreGoldfishGame(JSON.parse(JSON.stringify(flipped))).hand[0].faceIndex, 1);

  const oldGame = createGoldfishGame(rows);
  oldGame.hand[0].note = "keep this note";
  oldGame.hand[0].counters = { test: 2 };
  const repaired = restoreGoldfishGame(oldGame, { metadata: merged });
  assert.equal(repaired.hand[0].id, oldGame.hand[0].id);
  assert.equal(repaired.hand[0].note, "keep this note");
  assert.deepEqual(repaired.hand[0].counters, { test: 2 });
  assert.equal(cycleGoldfishFace(repaired, [repaired.hand[0].id]).hand[0].faceIndex, 1);
  assert.equal(mulliganGoldfish(repaired).hand[0].faces.length, 2);
});
