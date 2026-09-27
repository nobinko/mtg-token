import assert from "node:assert/strict";
import test from "node:test";
import { japaneseObjectNameFromText } from "../lib/scryfall.js";

test("a source's sole Cat token name never replaces a helper, another token, or an emblem", () => {
  const text = "白の1/1の猫・クリーチャー・トークン１体を生成する。";
  assert.equal(japaneseObjectNameFromText(text, { name: "Cat", type_line: "Token Creature — Cat" }), "猫");
  for (const [name, type_line] of [
    ["Copy token / copy marker", "Marker helper"], ["Food", "Token Artifact — Food"],
    ["Untranslated Type", "Token Creature — Untranslated Type"], ["Example Emblem", "Emblem"]
  ]) assert.equal(japaneseObjectNameFromText(text, { name, type_line }), "", name);
});
