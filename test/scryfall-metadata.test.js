import assert from "node:assert/strict";
import test from "node:test";

import { fetchCardMetadata } from "../lib/scryfall.js";

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
