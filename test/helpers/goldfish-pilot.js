import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeCardMetadata } from "../../public/card-metadata.js";
import { createGoldfishGame, keepGoldfishHand, advanceGoldfishGame, chooseGoldfishRule, nextGoldfishTurn, beginGoldfishCombat, resolveGoldfishCombat, restoreGoldfishGame } from "../../public/goldfish.js";
import { castGoldfishCard, chooseGoldfishCast, planGoldfishCastPayment, goldfishLandEntryOptions } from "../../public/goldfish-mana.js";
import { goldfishSpellTargets } from "../../public/goldfish-spells.js";
import { goldfishFetchRule, goldfishFetchTargets, goldfishFetchEntry, resolveGoldfishFetch } from "../../public/goldfish-fetch.js";
import { goldfishAttackers } from "../../public/goldfish-combat.js";
import { goldfishCardActions } from "../../public/goldfish-action-definitions.js";
import { activateGoldfishAction, chooseGoldfishAction, goldfishActionReason, goldfishActionPayment, engineActionOptions } from "../../public/goldfish-actions.js";
import { goldfishReference as ref, goldfishFindObject as find } from "../../public/goldfish-objects.js";
import { isType } from "../../public/goldfish-events.js";
import { abilityBlockReason } from "../../public/goldfish-constraints.js";
export const fixture = JSON.parse(readFileSync(new URL("../fixtures/goldfish-top10.json", import.meta.url), "utf8"));
const reload = s => restoreGoldfishGame(JSON.parse(JSON.stringify(s)));

// Exercise the public game APIs using the actual shuffled 60/15 lists. This
// pilot supplies legal choices, never grants mana, moves setup cards or bypasses
// unsupported effects. Focused ability/interaction tests complement this walk.
export function settle(state, log = [], decide = () => null) {
  let s = advanceGoldfishGame(state, { autoOrder: true });
  for (let i = 0; i < 200 && s.rules.pendingChoice; i++) {
    const c = s.rules.pendingChoice;
    assert.notEqual(c.type, "manual", `${c.sourceName}: ${c.text}`);
    let a = decide(c, s);
    if (a) {}
    else if (c.type === "order") a = { order: c.entryIds };
    else if (c.type === "engine-entry" && c.kind === "name") a = { value: "Grizzly Bears" };
    else if (c.type === "engine-legend") a = { keep: c.ids[0] };
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
    else if (c.type === "engine-target" && c.multipleTargets) a = { refs: c.candidates.slice(0, c.max).map(v => v.ref) };
    else if (c.type === "action") {
      const card = find(s, c.card), action = goldfishCardActions(card).find(a => a.id === c.actionId), opts = engineActionOptions(s, card, action);
      a = { confirmLife: true, x: 0, target: opts.targets.find(t => t.ref.player === "opponent")?.ref || opts.targets[0]?.ref || null, costCards: opts.costs.slice(0, action.costSelect?.count || 0).map(t => t.ref) };
      if (action.divideDamage) a.allocation = [{ target: a.target, amount: action.divideDamage }];
    }
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
    s = advanceGoldfishGame(c.type.startsWith("cast-") ? chooseGoldfishCast(reload(s), a) : c.type === "action" ? chooseGoldfishAction(reload(s), a) : chooseGoldfishRule(reload(s), a), { autoOrder: true });
  }
  assert.equal(s.rules.pendingChoice, null, "選択が収束する");
  assert.equal(s.stack.length, 0, s.rules.lastAction);
  return s;
}
