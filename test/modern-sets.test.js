import assert from "node:assert/strict";
import test from "node:test";
import { modernSetTimeline, chooseModernSourceOrigin } from "../lib/modern-sets.js";

const products = [
  { code: "8ed", name: "Eighth Edition", set_type: "core", released_at: "2003-07-28" },
  { code: "7ed", set_type: "core", released_at: "2001-04-11" },
  { code: "eld", name: "Throne of Eldraine", set_type: "expansion", released_at: "2019-10-04", icon_svg_uri: "https://svgs.scryfall.io/sets/eld.svg" },
  { code: "mh2", set_type: "draft_innovation", released_at: "2021-06-18" },
  { code: "ltr", set_type: "draft_innovation", released_at: "2023-06-23" },
  { code: "acr", set_type: "draft_innovation", released_at: "2024-07-05" },
  { code: "inr", set_type: "masters", released_at: "2025-01-24" },
  { code: "cn2", set_type: "draft_innovation", released_at: "2016-08-26" },
  { code: "otc", set_type: "commander", released_at: "2024-04-19" },
  { code: "digital", set_type: "expansion", released_at: "2022-01-01", digital: true },
  { code: "future", set_type: "expansion", released_at: "2099-01-01" }
];
const sets = new Map(products.map((set) => [set.code, set]));

test("Modern timeline includes unused sets and direct-to-Modern products, excluding masters, digital and future sets", () => {
  const timeline = modernSetTimeline(products, "2026-10-03");
  assert.deepEqual(timeline.map((set) => set.code), ["ACR", "LTR", "MH2", "ELD", "8ED"]);
  assert.equal(timeline.find((set) => set.code === "ELD").iconSvgUri, products[2].icon_svg_uri);
  assert.deepEqual(modernSetTimeline(products, "2003-07-27"), []);
});

test("Castle Ardenvale resolves to ELD even when the representative print is remastered", () => {
  const reference = { oracle_id: "castle", set: "inr", name: "Castle Ardenvale" };
  const card = (set, date, extra = {}) => ({ ...reference, set, released_at: date, games: ["paper"], ...extra });
  const prints = [card("inr", "2025-01-24"), card("eld", "2019-10-04", { collector_number: "238" }),
    card("eld", "2019-10-04", { digital: true }), card("7ed", "2001-04-11"),
    card("eld", "2019-10-04", { oracle_id: "wrong-card" })];
  assert.equal(chooseModernSourceOrigin(reference, prints, sets, "2026-10-03").set, "eld");
  assert.equal(chooseModernSourceOrigin(reference, prints, sets, "2019-10-03"), null);
});
