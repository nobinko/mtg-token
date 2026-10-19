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
const fixture = JSON.parse(readFileSync(new URL("./fixtures/goldfish-top10.json", import.meta.url), "utf8"));
const reload = s => restoreGoldfishGame(JSON.parse(JSON.stringify(s)));

// Exercise the public game APIs using the actual shuffled 60/15 lists. This
// pilot supplies legal choices, never grants mana, moves setup cards or bypasses
// unsupported effects. Focused ability/interaction tests complement this walk.
function settle(state, log) {
  let s = advanceGoldfishGame(state);
  for (let i = 0; i < 200 && s.rules.pendingChoice; i++) {
    const c = s.rules.pendingChoice;
    assert.notEqual(c.type, "manual", `${c.sourceName}: ${c.text}`);
    let a;
    if (c.type === "engine-legend") a = { keep: c.ids[0] };
    else if (c.type === "attack") a = { ids: goldfishAttackers(s).filter(c => !c.reason && Number.isFinite(c.power)).map(c => c.card.id) };
    else if (c.type === "surveil") a = { destination: "graveyard" };
    else if (c.type === "attach") a = { attach: true };
    else if (c.type === "bauble-look") a = { acknowledge: true };
    else if (c.type === "spell-arrange") a = { allocation: c.cardIds.map((id, i) => ({ id, destination: c.mode === "iteration" ? ["hand", "bottom", "exile"][i] : c.mode === "sleight" ? i ? "bottom" : "hand" : "top" })) };
    else if (c.type === "spell-return") a = { ids: c.cardIds.slice(0, c.count) };
    else if (c.type === "spell-shuffle") a = { shuffle: false };
    else if (c.type === "spell-mana" || c.kind === "mana") a = { colors: Array(c.count).fill(c.colors?.includes("G") ? "G" : c.colors?.[0] || "R") };
    else if (c.type === "engine-target" && !c.multipleTargets || c.kind === "copy-target") a = { target: c.candidates.find(c => c.ref.player === "opponent")?.ref || c.candidates[0]?.ref || null };
    else if (c.type === "cast-target") { const card = find(s, c.card); a = { target: goldfishSpellTargets(s, card, c.options).find(t => t.ref.player === "opponent")?.ref || goldfishSpellTargets(s, card, c.options)[0]?.ref }; }
    else if (c.kind === "cards") {
      const n = c.type === "engine-opening" || ["splice", "pitch", "gravePlayers"].includes(c.optionKey) ? c.min : Math.max(c.min, Math.min(1, c.max));
      let candidates = [...c.candidates];
      if (["Expedition Map", "Sowing Mycospawn"].includes(c.sourceName)) candidates.sort((a, b) => {
        const score = v => ["Urza's Mine", "Urza's Power Plant", "Urza's Tower"].includes(v.label) && ![...s.battlefield, ...s.hand].some(c => c.name === v.label) ? 3 : v.label === "Forest" && ![...s.battlefield, ...s.hand].some(c => isType(c, "Forest")) ? 2 : 0;
        return score(b) - score(a);
      });
      a = { refs: candidates.slice(0, n).map(v => v.ref) };
    } else if (c.kind === "buttons") {
      if (c.multiple) a = { values: c.options.slice(0, c.multiple).map(v => v.value) };
      else a = { value: c.options.find(o => ["yes", "loot", "Eldrazi", "graveyards", "scion"].includes(o.value))?.value || c.options[0].value };
    } else if (c.kind === "number") a = { value: c.min };
    else if (c.kind === "name") a = { value: "Grizzly Bears" };
    else if (c.kind === "comparisons") a = { values: [] };
    else assert.fail(`未処理の選択 ${c.type} ${c.kind}: ${c.sourceName}`);
    log.push(`選択 ${c.sourceName || c.type}: ${c.label || c.type}`);
    s = advanceGoldfishGame(c.type.startsWith("cast-") ? chooseGoldfishCast(reload(s), a) : chooseGoldfishRule(reload(s), a));
  }
  assert.equal(s.rules.pendingChoice, null, "選択が収束する");
  assert.equal(s.stack.length, 0, s.rules.lastAction);
  return s;
}

for (const d of fixture.decks) test(`real list six-turn walkthrough: ${d.rank} ${d.archetype}`, t => {
  let seed = 101 + d.rank;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const originalRandom = Math.random; Math.random = random;
  const log = [];
  try {
    let s = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(d.mainboard, fixture.metadata), { sideboardRows: mergeCardMetadata(d.sideboard, fixture.metadata), random }));
    s = settle(s, log);
    let played = 0;
    for (let turn = 1; turn <= 6; turn++) {
      // Complete Tron before spending the land drop on a duplicate or Forest.
      const land = s.hand.filter(c => isType(c, "Land")).sort((a, b) => {
        const missingTron = c => d.rank === 8 && ["Urza's Mine", "Urza's Power Plant", "Urza's Tower"].includes(c.name) && !s.battlefield.some(p => p.name === c.name) ? 1 : 0;
        return missingTron(b) - missingTron(a);
      })[0];
      if (land) {
        const choices = goldfishLandEntryOptions(land, s), entry = Math.max(0, choices.findIndex(c => !c.tapped));
        s = settle(castGoldfishCard(s, land.id, { entry, confirmLife: true }), log); log.push(`T${turn} 土地 ${land.name}`);
      }
      for (const land of [...s.battlefield].filter(c => goldfishFetchRule(c) && !c.tapped && !abilityBlockReason(s, c))) {
        const target = goldfishFetchTargets(s, land.id).find(c => /Basic/.test(c.typeLine)) || goldfishFetchTargets(s, land.id)[0];
        const choices = target && goldfishFetchEntry(s, land.id, target).choices;
        s = settle(resolveGoldfishFetch(s, land.id, target?.id, { entry: choices?.find(c => !c.tapped)?.key || choices?.[0].key, random }), log);
      }
      for (let step = 0; step < 12; step++) {
        if (s.rules.activePlayer !== "self") break;
        const options = { confirmLife: true, x: 0, splice: [], pitch: [], replicate: 0 };
        const card = s.hand.filter(c => !isType(c, "Land")).find(c => planGoldfishCastPayment(s, c, options).payable && (!goldfishSpellTargets(s, c, options).length ? !/target /i.test(c.oracleText || "") || /Creature|Artifact|Enchantment/.test(c.typeLine) : true));
        if (!card) break;
        s = settle(castGoldfishCard(s, card.id, options), log); played++; log.push(`T${turn} 唱える ${card.name}`);
      }
      for (const c of [...s.battlefield]) {
        const action = goldfishCardActions(c).find(a => a.zone === "battlefield" && ["engine:adapt", "engine:recruit", "engine:narset", "engine:jace-draw", "engine:ral-plus", "engine:ajani-zero", "engine:ugin-plus", "engine:saga-construct", "engine:map", "engine:henge", "engine:sanitarium"].includes(a.id) && !goldfishActionReason(s, c, a) && goldfishActionPayment(s, c, a).payable);
        if (action) { s = settle(activateGoldfishAction(s, c.id, action.id), log); log.push(`T${turn} 起動 ${c.name}: ${action.label}`); }
      }
      if (s.rules.activePlayer === "self") s = settle(beginGoldfishCombat(s), log);
      if (s.rules.combat) {
        while (s.rules.combat.stage !== "done") s = settle(resolveGoldfishCombat(s), log);
      }
      if (turn < 6) s = settle(nextGoldfishTurn(s), log);
    }
    assert.ok(played >= 2, `${d.archetype}: 呪文を最低2つ実際に唱える`);
    assert.equal(s.turn, 6); assert.equal(s.rules.pendingChoice, null);
    t.diagnostic(log.filter(x => !x.startsWith("選択")).join(" / "));
  } finally { Math.random = originalRandom; }
});
