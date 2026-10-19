import test from "node:test";
import assert from "node:assert/strict";
import { route } from "./helpers/goldfish-route.js";
import { goldfishCharacteristics } from "../public/goldfish-rules.js";
import { goldfishFinish } from "../public/goldfish-sideboard.js";

test("Broodscale: real opening to equip, adapt, 20 loops and lethal", t => {
  const r = route(1, ["Forest", "Forest", "Forest", "Blade of the Bloodchief", "Basking Broodscale", "Sire of Seven Deaths", "Sowing Mycospawn"]);
  r.cast("Forest"); r.cast("Blade of the Bloodchief"); r.next(); r.cast("Forest"); r.cast("Basking Broodscale");
  r.next(); r.cast("Forest"); r.act("Blade of the Bloodchief", "equip", { target: r.ref("Basking Broodscale") }); r.act("Basking Broodscale", "engine:adapt");
  r.combo("broodscale", "Basking Broodscale", 20); assert.equal(r.s.manaPool.C, 20); assert.equal(goldfishCharacteristics(r.s, r.card("Basking Broodscale")).power, "23");
  r.attack(); assert.equal(goldfishFinish(r.s)?.kind, "win"); t.diagnostic(r.log.join(" / "));
});

test("Toolbox: Druid plus Vizier mana feeds Zenith into Craterhoof lethal", t => {
  const r = route(9, ["Leyline of Abundance", "Forest", "Temple Garden", "Delighted Halfling", "Devoted Druid", "Vizier of Remedies", "Green Sun's Zenith"], ["Forest"], {}, c => c.type === "engine-opening" ? { refs: c.candidates.filter(x => x.label === "Leyline of Abundance").map(x => x.ref) } : c.kind === "cards" && c.sourceName === "Green Sun's Zenith" ? { refs: [c.candidates.find(x => x.label === "Craterhoof Behemoth").ref] } : null);
  r.cast("Forest"); r.cast("Delighted Halfling"); r.next(); r.cast("Temple Garden"); r.cast("Devoted Druid"); r.next(); r.cast("Forest"); r.cast("Vizier of Remedies");
  r.combo("druid", "Devoted Druid", 30); r.cast("Green Sun's Zenith", { x: 8 });
  for (let i = 0; i < 4; i++) r.act("Leyline of Abundance", "engine:leyline-counters");
  r.attack();
  assert.equal(goldfishFinish(r.s)?.kind, "win"); t.diagnostic(r.log.join(" / "));
});

for (const post of [false, true]) test(`Ruby ${post ? "postboard Chant" : "main"}: rituals, impulse, Past in Flames, Wish and Grapeshot resolve to lethal`, t => {
  const r = route(10, ["Mountain", post ? "Sacred Foundry" : "Mountain", "Ruby Medallion", "Desperate Ritual", "Pyretic Ritual", "Reckless Impulse", "Wish"], [...(post ? ["Orim's Chant"] : []), "Mountain", "Past in Flames", "Desperate Ritual", "Pyretic Ritual", "Wrenn's Resolve", "Wrenn's Resolve", "Desperate Ritual", "Pyretic Ritual", "Reckless Impulse", "Wrenn's Resolve", "Desperate Ritual", "Pyretic Ritual", "Reckless Impulse", "Reckless Impulse", "Manamorphose", "Manamorphose"], post ? { "Orim's Chant": 1, "Twinned Vision": -1 } : {});
  r.cast("Mountain"); r.next(); r.cast(post ? "Sacred Foundry" : "Mountain"); r.cast("Ruby Medallion"); r.next(); r.cast("Mountain");
  if (post) { r.next(); r.cast("Orim's Chant", { target: { player: "opponent" } }); }
  r.cast("Desperate Ritual", { splice: [] }); r.cast("Pyretic Ritual"); r.cast("Reckless Impulse");
  r.cast("Desperate Ritual", { fromExile: true, splice: [] }); r.cast("Pyretic Ritual", { fromExile: true }); r.cast("Past in Flames");
  r.cast("Desperate Ritual", { fromGraveyard: true, splice: [] }); r.cast("Pyretic Ritual", { fromGraveyard: true }); r.cast("Reckless Impulse", { fromGraveyard: true });
  for (let i = 0; i < 20 && r.s.rules.spellsCast < 19; i++) {
    const c = r.s.exile.find(c => c.playPermission && ["Desperate Ritual", "Pyretic Ritual", "Wrenn's Resolve", "Reckless Impulse", "Manamorphose"].includes(c.name));
    assert.ok(c, `ストーム補充が止まった: ${r.s.rules.spellsCast}`); r.cast(c.name, { fromExile: true, splice: [] });
  }
  r.cast("Wish"); r.cast("Grapeshot", { fromSideboard: true, target: { player: "opponent" } });
  assert.ok(r.s.rules.spellsCast >= 21); assert.equal(goldfishFinish(r.s)?.kind, "win"); assert.ok(r.s.exile.some(c => c.name === "Past in Flames") === false);
  t.diagnostic(`T${r.s.turn}, spell ${r.s.rules.spellsCast}, opponent ${r.s.players.opponent.life}; ` + r.log.join(" / "));
});

test("Tron: Karn wishes for Cityscape Leveler and its cast and attack triggers reach lethal", t => {
  const r = route(8, ["Urza's Mine", "Urza's Power Plant", "Urza's Tower", "Eldrazi Temple", "Karn, the Great Creator", "Expedition Map", "Ulamog, the Ceaseless Hunger"], [], {}, c => c.kind === "cards" && c.sourceName === "Karn, the Great Creator" ? { refs: [c.candidates.find(x => x.label === "Cityscape Leveler").ref] } : null);
  r.cast("Urza's Mine"); r.next(); r.cast("Urza's Power Plant"); r.next(); r.cast("Urza's Tower"); r.cast("Karn, the Great Creator"); r.act("Karn, the Great Creator", "engine:karn-wish");
  r.next(); r.cast("Eldrazi Temple"); r.cast("Cityscape Leveler"); r.finish(); assert.equal(r.s.battlefield.filter(c => c.name === "Powerstone").length, 0); assert.ok(r.s.rules.notices.filter(n => n.text.includes("パワーストーン")).length >= 4); t.diagnostic(r.log.join(" / "));
});

test("UW: Scepter on opponent turns, Narset and Solitude through a long finish", t => {
  const r = route(4, ["Island", "Hallowed Fountain", "Plains", "Isochron Scepter", "Silence", "Narset, Parter of Veils", "Solitude"], ["Geier Reach Sanitarium", "Island", "Plains"], {}, c => c.kind === "cards" && c.sourceName === "Isochron Scepter" ? { refs: [c.candidates.find(x => x.label === "Silence").ref] } : c.type === "engine-target" && c.sourceName === "Solitude" ? { target: null } : null);
  r.cast("Island"); r.next(); r.cast("Hallowed Fountain"); r.cast("Isochron Scepter"); r.next(); r.cast("Plains"); r.cast("Narset, Parter of Veils");
  r.next(); r.cast("Geier Reach Sanitarium"); r.end(); r.act("Isochron Scepter", "engine:scepter"); r.next(); r.cast("Island"); r.cast("Solitude"); r.next();
  while (!goldfishFinish(r.s) && r.s.turn < 20) { r.attack(); if (goldfishFinish(r.s)) break; r.end(); if (!r.card("Isochron Scepter").tapped) r.act("Isochron Scepter", "engine:scepter"); r.next(); }
  assert.equal(goldfishFinish(r.s)?.kind, "win"); t.diagnostic(r.log.join(" / "));
});
