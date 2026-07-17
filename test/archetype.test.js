import assert from "node:assert/strict";
import test from "node:test";

import { inferArchetype, inferFallbackArchetype } from "../lib/archetype.js";

test("inferArchetype drops MTGO event titles to Unknown", () => {
  assert.equal(inferArchetype("Modern Challenge 64 2026-07-13", ""), "Unknown");
  assert.equal(inferArchetype("Legacy Challenge 32", "Legacy Challenge 32 | MTGO"), "Unknown");
  assert.equal(inferArchetype("Pioneer League 2026-07-10", ""), "Unknown");
  assert.equal(inferArchetype("Modern Super Qualifier", ""), "Unknown");
  assert.equal(inferArchetype("Legacy Showcase Challenge", ""), "Unknown");
  assert.equal(inferArchetype("Pioneer Last Chance Qualifier", ""), "Unknown");
});

test("inferArchetype drops leftover date fragments to Unknown", () => {
  assert.equal(inferArchetype("Standard 2026-07-13", ""), "Unknown");
  assert.equal(inferArchetype("07/13/26 - Modern", ""), "Unknown");
});

test("inferArchetype keeps proper-noun archetype names without color words", () => {
  assert.equal(inferArchetype("Belcher", ""), "Belcher");
  assert.equal(inferArchetype("Painter", ""), "Painter");
  assert.equal(inferArchetype("Amulet Titan - Modern Challenge 64", ""), "Amulet Titan");
});

test("inferArchetype prefers the color-word segment over event noise", () => {
  assert.equal(inferArchetype("Izzet Murktide - Legacy Challenge 32", ""), "Izzet Murktide");
  assert.equal(inferArchetype("Boros Midrange", ""), "Boros Midrange");
});

test("inferFallbackArchetype labels decks by land colors and strategy", () => {
  const cards = ["Volcanic Island", "Scalding Tarn", "Daze", "Force of Will", "Brainstorm"];
  assert.equal(inferFallbackArchetype(cards), "Izzet Control");
  assert.equal(inferFallbackArchetype([]), "Unknown");
});
