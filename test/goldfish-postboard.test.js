import test from "node:test";
import assert from "node:assert/strict";
import { route } from "./helpers/goldfish-route.js";
import { castGoldfishAlternative } from "../public/goldfish-alternatives.js";
import { goldfishFinish } from "../public/goldfish-sideboard.js";

// Concrete card exchanges to exercise postboard play, not matchup advice.
const report = (r, t) => { r.finish(); assert.equal(goldfishFinish(r.s)?.kind, "win"); t.diagnostic(`finish T${r.s.turn}; ${r.log.join(" / ")}`); };

test("postboard Broodscale: Thought-Knot then combo combat", t => {
  const r = route(1, ["Forest", "Forest", "Forest", "Blade of the Bloodchief", "Basking Broodscale", "Thought-Knot Seer", "Sowing Mycospawn"], [], { "Sire of Seven Deaths": -1, "Thought-Knot Seer": 1 });
  r.cast("Forest"); r.cast("Blade of the Bloodchief"); r.next(); r.cast("Forest"); r.cast("Basking Broodscale"); r.next(); r.cast("Forest");
  r.act("Blade of the Bloodchief", "equip", { target: r.ref("Basking Broodscale") }); r.act("Basking Broodscale", "engine:adapt"); r.combo("broodscale", "Basking Broodscale", 20); r.cast("Thought-Knot Seer"); report(r, t);
});

test("postboard UR: Charmaw, Cutter and prowess through lethal", t => {
  const r = route(2, ["Mountain", "Mountain", "Steam Vents", "Monastery Swiftspear", "Dragon's Rage Channeler", "Cori-Steel Cutter", "Obsidian Charmaw"], ["Mishra's Bauble", "Mountain", "Steam Vents", "Lightning Bolt"], { "Mutagenic Growth": -1, "Obsidian Charmaw": 1 }, c => c.type === "surveil" ? { destination: "top" } : null);
  r.cast("Mountain"); r.cast("Monastery Swiftspear"); r.next(); r.cast("Steam Vents"); r.cast("Dragon's Rage Channeler"); r.cast("Mishra's Bauble");
  r.next(); r.cast("Mountain"); r.cast("Cori-Steel Cutter"); r.next(); r.cast("Steam Vents"); r.next(); r.cast("Mountain"); r.cast("Obsidian Charmaw"); report(r, t);
});

test("postboard Domain: High Noon limits spells but lets Kavu and burn finish", t => {
  const r = route(3, ["Temple Garden", "Steam Vents", "Indatha Triome", "Wild Nacatl", "Territorial Kavu", "High Noon", "Tribal Flames"], [], { "Consign to Memory": -1, "High Noon": 1 }, c => c.sourceName === "Territorial Kavu" && c.kind === "buttons" ? { value: "exile" } : null);
  r.cast("Temple Garden"); r.cast("Wild Nacatl"); r.next(); r.cast("Steam Vents"); r.cast("High Noon"); assert.throws(() => r.cast("Territorial Kavu"), /High Noon/);
  r.next(); r.cast("Indatha Triome"); r.cast("Territorial Kavu"); r.next(); r.cast("Tribal Flames", { target: { player: "opponent" } }); report(r, t);
});

test("postboard UW: Beza and Solitude survive the draw/discard turns through lethal", t => {
  const r = route(4, ["Island", "Hallowed Fountain", "Plains", "Geier Reach Sanitarium", "Narset, Parter of Veils", "Beza, the Bounding Spring", "Solitude"], ["Plains"], { "Supreme Verdict": -1, "Beza, the Bounding Spring": 1 }, c => c.type === "engine-target" && c.sourceName === "Solitude" ? { target: null } : null);
  r.cast("Island"); r.next(); r.cast("Hallowed Fountain"); r.next(); r.cast("Plains"); r.cast("Narset, Parter of Veils"); r.next(); r.cast("Geier Reach Sanitarium"); r.cast("Beza, the Bounding Spring"); r.next(); r.cast("Plains"); r.cast("Solitude"); report(r, t);
});

test("postboard Rakdos: Ingot Chewer evoke feeds the graveyard plan", t => {
  const r = route(5, ["Blood Crypt", "Swamp", "Mountain", "Nethergoyf", "Moonshadow", "Dark Matter Manipulator", "Ingot Chewer"], ["Street Wraith", "Mishra's Bauble", "Blood Crypt", "Detective's Phoenix", "Thoughtseize"], { "Fatal Push": -1, "Ingot Chewer": 1 });
  r.cast("Blood Crypt"); r.cast("Moonshadow"); r.next(); r.cast("Mountain"); r.cast("Nethergoyf");
  r.update(castGoldfishAlternative(r.s, r.card("Ingot Chewer", "hand").id, "evoke", { refs: [] }), "Ingot Chewer想起");
  assert.ok(r.s.graveyard.some(c => c.name === "Ingot Chewer")); r.next(); r.cast("Swamp"); r.cast("Dark Matter Manipulator"); report(r, t);
});

test("postboard Affinity: Galvanic Blast and artifact-generated army finish", t => {
  const r = route(6, ["Island", "Fiery Islet", "Shivan Reef", "Emry, Lurker of the Loch", "Weapons Manufacturing", "Pinnacle Emissary", "Galvanic Blast"], ["Tormod's Crypt", "Mishra's Bauble", "Welding Jar", "Engineered Explosives", "Mox Opal", "Tormod's Crypt", "Engineered Explosives", "Tormod's Crypt", "Mishra's Bauble"], { "Metallic Rebuke": -1, "Galvanic Blast": 1 });
  r.cast("Island"); r.next(); r.cast("Fiery Islet"); r.cast("Tormod's Crypt"); r.cast("Emry, Lurker of the Loch"); r.next(); r.cast("Shivan Reef"); r.cast("Weapons Manufacturing"); r.cast("Tormod's Crypt"); r.next(); r.cast("Pinnacle Emissary"); r.cast("Engineered Explosives", { x: 0 }); r.next(); r.cast("Galvanic Blast", { target: { player: "opponent" } }); report(r, t);
});

test("postboard Boros: Roku chapters, transform, cats and combat finish", t => {
  const r = route(7, ["Plains", "Mountain", "Sacred Foundry", "Guide of Souls", "Ocelot Pride", "Goblin Bombardment", "The Legend of Roku"], ["Plains", "Sacred Foundry", "Lightning Bolt"], { "Thraben Charm": -1, "The Legend of Roku": 1 });
  r.cast("Plains"); r.cast("Guide of Souls"); r.next(); r.cast("Mountain"); r.cast("Ocelot Pride"); r.next(); r.cast("Sacred Foundry"); r.cast("Goblin Bombardment"); r.next(); r.cast("Plains"); r.cast("The Legend of Roku"); r.next(); r.next();
  assert.equal(r.card("The Legend of Roku").faceIndex, 1); report(r, t);
});

test("postboard Tron: boarded Leveler starts in the deck and attacks through lethal", t => {
  const r = route(8, ["Urza's Mine", "Urza's Power Plant", "Urza's Tower", "Eldrazi Temple", "Karn, the Great Creator", "Cityscape Leveler", "Expedition Map"], [], { "Dismember": -1, "Cityscape Leveler": 1 });
  assert.ok(!r.s.sideboard.some(c => c.name === "Cityscape Leveler")); r.cast("Urza's Mine"); r.next(); r.cast("Urza's Power Plant"); r.next(); r.cast("Urza's Tower"); r.cast("Karn, the Great Creator"); r.next(); r.cast("Eldrazi Temple"); r.cast("Cityscape Leveler"); report(r, t);
});

test("postboard Toolbox: Grist plus Druid, Vizier and Leyline pump finish", t => {
  const r = route(9, ["Forest", "Temple Garden", "Overgrown Tomb", "Devoted Druid", "Vizier of Remedies", "Leyline of Abundance", "Grist, the Hunger Tide"], [], { "Birds of Paradise": -1, "Grist, the Hunger Tide": 1 }, c => c.type === "engine-opening" ? { refs: c.candidates.filter(x => x.label === "Leyline of Abundance").map(x => x.ref) } : null);
  r.cast("Forest"); r.next(); r.cast("Temple Garden"); r.cast("Devoted Druid"); r.next(); r.cast("Overgrown Tomb"); r.cast("Vizier of Remedies"); r.combo("druid", "Devoted Druid", 40); r.cast("Grist, the Hunger Tide"); r.act("Grist, the Hunger Tide", "engine:grist-plus");
  for (let i = 0; i < 6; i++) r.act("Leyline of Abundance", "engine:leyline-counters"); report(r, t);
});
