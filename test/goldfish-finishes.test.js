import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { createGoldfishGame, keepGoldfishHand, advanceGoldfishGame, chooseGoldfishRule, nextGoldfishTurn, beginGoldfishCombat, resolveGoldfishCombat, restoreGoldfishGame } from "../public/goldfish.js";
import { castGoldfishCard, chooseGoldfishCast, planGoldfishCastPayment, goldfishLandEntryOptions } from "../public/goldfish-mana.js";
import { goldfishSpellTargets } from "../public/goldfish-spells.js";
import { goldfishFetchRule, goldfishFetchTargets, goldfishFetchEntry, resolveGoldfishFetch } from "../public/goldfish-fetch.js";
import { goldfishAttackers } from "../public/goldfish-combat.js";
import { goldfishCardActions } from "../public/goldfish-action-definitions.js";
import { activateGoldfishAction, goldfishActionReason, goldfishActionPayment, engineActionOptions } from "../public/goldfish-actions.js";
import { goldfishReference as ref, goldfishFindObject as find } from "../public/goldfish-objects.js";
import { isType } from "../public/goldfish-events.js";
import { abilityBlockReason } from "../public/goldfish-constraints.js";
import { settle } from "./helpers/goldfish-pilot.js";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/goldfish-top10.json", import.meta.url), "utf8"));
const reload = s => restoreGoldfishGame(JSON.parse(JSON.stringify(s)));

// Ruby has an explicit full storm route in goldfish-winning-lines.test.js.
for (const d of fixture.decks.filter(d => d.rank !== 10)) test(`real list to lethal: ${d.rank} ${d.archetype}`, t => {
  let seed = 101 + d.rank;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const originalRandom = Math.random; Math.random = random;
  const log = [];
  const settleForDeck = (state, log) => settle(state, log, c => c.type === "engine-target" && c.sourceName === "Solitude" ? { target: null } : null);
  try {
    let s = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(d.mainboard, fixture.metadata), { sideboardRows: mergeCardMetadata(d.sideboard, fixture.metadata), random }));
    s = settleForDeck(s, log);
    let played = 0;
    for (let turn = 1; turn <= 35 && s.players.opponent.life > 0 && !s.rules.emptyDraw; turn++) {
      // Complete Tron before spending the land drop on a duplicate or Forest.
      const land = s.hand.filter(c => isType(c, "Land")).sort((a, b) => {
        const missingTron = c => d.rank === 8 && ["Urza's Mine", "Urza's Power Plant", "Urza's Tower"].includes(c.name) && !s.battlefield.some(p => p.name === c.name) ? 1 : 0;
        return missingTron(b) - missingTron(a);
      })[0];
      if (land) {
        const choices = goldfishLandEntryOptions(land, s), entry = Math.max(0, choices.findIndex(c => !c.tapped));
        s = settleForDeck(castGoldfishCard(s, land.id, { entry, confirmLife: true }), log); log.push(`T${turn} 土地 ${land.name}`);
      }
      for (const land of [...s.battlefield].filter(c => goldfishFetchRule(c) && !c.tapped && !abilityBlockReason(s, c))) {
        const target = goldfishFetchTargets(s, land.id).find(c => /Basic/.test(c.typeLine)) || goldfishFetchTargets(s, land.id)[0];
        const choices = target && goldfishFetchEntry(s, land.id, target).choices;
        s = settleForDeck(resolveGoldfishFetch(s, land.id, target?.id, { entry: choices?.find(c => !c.tapped)?.key || choices?.[0].key, random }), log);
      }
      for (let step = 0; step < 12; step++) {
        if (s.rules.activePlayer !== "self") break;
        const options = { confirmLife: true, x: 0, splice: [], pitch: [], replicate: 0 };
        const card = s.hand.filter(c => !isType(c, "Land") && !(d.rank === 4 && ["Supreme Verdict", "Wrath of the Skies", "Day's Undoing"].includes(c.name) && s.battlefield.some(p => isType(p, "Creature")))).find(c => planGoldfishCastPayment(s, c, options).payable && (!goldfishSpellTargets(s, c, options).length ? !/target /i.test(c.oracleText || "") || /Creature|Artifact|Enchantment/.test(c.typeLine) : true));
        if (!card) break;
        s = settleForDeck(castGoldfishCard(s, card.id, options), log); played++; log.push(`T${turn} 唱える ${card.name}`);
      }
      for (const id of s.battlefield.map(c => c.id)) {
        const c = s.battlefield.find(c => c.id === id); if (!c || d.rank === 4 && s.library.length < 10) continue;
        const action = goldfishCardActions(c).find(a => a.zone === "battlefield" && ["engine:adapt", "engine:recruit", "engine:narset", "engine:jace-draw", "engine:ral-plus", "engine:ajani-zero", "engine:ugin-plus", "engine:saga-construct", "engine:map", "engine:henge", "engine:sanitarium"].includes(a.id) && !goldfishActionReason(s, c, a) && goldfishActionPayment(s, c, a).payable);
        if (action) { s = settleForDeck(activateGoldfishAction(s, c.id, action.id), log); log.push(`T${turn} 起動 ${c.name}: ${action.label}`); }
      }
      if (s.rules.activePlayer === "self") s = settleForDeck(beginGoldfishCombat(s), log);
      if (s.rules.combat) {
        while (s.rules.combat.stage !== "done") s = settleForDeck(resolveGoldfishCombat(s), log);
      }
      if (s.players.opponent.life > 0) s = settleForDeck(nextGoldfishTurn(s), log);
    }
    assert.ok(played >= 2, `${d.archetype}: 呪文を最低2つ実際に唱える`);
    t.diagnostic(`Turn ${s.turn}: opponent ${s.players.opponent.life}; self ${s.players.self.life}; library ${s.library.length}`);
    assert.ok(s.players.opponent.life <= 0, `未決着: T${s.turn} 相手${s.players.opponent.life} ${log.slice(-12).join(" / ")}`);
    assert.equal(s.rules.pendingChoice, null);
    t.diagnostic(log.filter(x => !x.startsWith("選択")).join(" / "));
  } finally { Math.random = originalRandom; }
});
