import { cloneGoldfishState, moveGoldfishCards, playGoldfishCard } from "./goldfish.js?v=20261021-public30e";
import { goldfishReference as ref, goldfishFindObject as find, moveGoldfishRuleObject as move, sameGoldfishReference } from "./goldfish-objects.js?v=20261021-public30e";
import { engineCandidates, gameManaValue, gameColors, flushEngineEvents } from "./goldfish-engine.js?v=20261021-public30e";
import { cardName, isType, changeLife } from "./goldfish-events.js?v=20261021-public30e";
import { verifiedGoldfishCard } from "./goldfish-card-programs.js?v=20261021-public30e";
import { planGoldfishPayment, payGoldfishPlan, goldfishCastingCost } from "./goldfish-mana.js?v=20261021-public30e";
import { validateGoldfishSpellTarget } from "./goldfish-spells.js?v=20261021-public30e";
import { goldfishCharacteristics, goldfishGraveyardTypes, assertGoldfishChoiceComplete } from "./goldfish-rules.js?v=20261021-public30e";
import { castBlockReason } from "./goldfish-constraints.js?v=20261021-public30e";

export function goldfishAlternativeModes(card, zone) {
  if (!verifiedGoldfishCard(card)) return [];
  const n = cardName(card), result = [];
  if (n === "Hogaak, Arisen Necropolis" && ["hand", "graveyard"].includes(zone)) result.push({ id: "hogaak", label: "召集・探査：クリーチャーをタップ／墓地を追放", cost: card.manaCost, zone: ["battlefield", "graveyard"], count: "any" });
  if (n === "Detective's Phoenix" && ["hand", "graveyard"].includes(zone)) result.push({ id: "bestow", label: "授与 {R}・証拠収集6", cost: "{R}", zone: "graveyard", count: "any", evidence: 6, target: true });
  if (n === "Nethergoyf" && zone === "graveyard") result.push({ id: "escape", label: "脱出 {2}{B}・墓地4タイプ", cost: "{2}{B}", zone: "graveyard", count: "any", types: 4 });
  if (n === "Nature's Rhythm" && zone === "graveyard") result.push({ id: "harmonize", label: "調和 X{G}{G}{G}{G}", cost: "{X}{G}{G}{G}{G}", zone: "battlefield", filter: { types: ["Creature"], untapped: true }, count: "optional", tap: true, x: true });
  if (n === "Salvage Titan" && zone === "hand") result.push({ id: "titan", label: "アーティファクト3つを生け贄に唱える", cost: "{0}", zone: "battlefield", filter: { types: ["Artifact"] }, count: 3 });
  if (["Solitude", "Endurance", "Fury"].includes(n) && zone === "hand") result.push({ id: "evoke", label: "想起・色の合う手札1枚を追放", cost: "{0}", zone: "hand", filter: { color: n === "Solitude" ? "W" : n === "Fury" ? "R" : "G" }, count: 1 });
  if (n === "Twinned Vision" && zone === "graveyard") result.push({ id: "flashback-discard", label: "フラッシュバック・手札1枚を捨てる", cost: "{1}{U/R}{U/R}", zone: "hand", count: 1, discard: true });
  if (n === "Force of Negation" && zone === "hand") result.push({ id: "force", label: "相手ターン：青い手札1枚を追放して唱える", cost: "{0}", zone: "hand", filter: { color: "U" }, count: 1, spellTarget: true });
  if (n === "Force of Will" && zone === "hand") result.push({ id: "force-will", label: "1ライフ・青い手札1枚を追放", cost: "{0}", zone: "hand", filter: { color: "U" }, count: 1, spellTarget: true, life: 1 });
  if (n === "Daze" && zone === "hand") result.push({ id: "daze", label: "島1枚を手札へ戻して唱える", cost: "{0}", zone: "battlefield", filter: { types: ["Land"], subtypes: ["Island"] }, count: 1, spellTarget: true, returnHand: true });
  if (n === "Ingot Chewer" && zone === "hand") result.push({ id: "evoke", label: "想起 {R}", cost: "{R}", zone: "hand", count: 0 });
  if (["Vibrance", "Deceit", "Emptiness"].includes(n) && zone === "hand") result.push({ id: "evoke", label: n === "Vibrance" ? "想起 {R/G}{R/G}" : n === "Emptiness" ? "想起 {W/B}{W/B}" : "想起 {U/B}{U/B}", cost: n === "Vibrance" ? "{R/G}{R/G}" : n === "Emptiness" ? "{W/B}{W/B}" : "{U/B}{U/B}", zone: "hand", count: 0 });
  return result;
}
export function alternativeCandidates(state, card, mode) {
  if (mode.id === "hogaak") return [...engineCandidates(state, { zone: "battlefield", filter: { types: ["Creature"], untapped: true } }), ...engineCandidates(state, { zone: "graveyard" })].filter(c => c.card.id !== card.id);
  return engineCandidates(state, { zone: mode.zone, filter: mode.filter || {} }).filter(c => c.card.id !== card.id);
}
export function planHogaak(state, card) {
  const cost = goldfishCastingCost(card, { state }), symbols = cost.match(/\{[^}]+\}/g) || [];
  const generic = symbols.filter(s => /^\{\d+\}$/.test(s)).reduce((n, s) => n + Number(s.slice(1, -1)), 0);
  const colored = symbols.filter(s => !/^\{\d+\}$/.test(s));
  const creatures = state.battlefield.filter(c => isType(c, "Creature") && !c.tapped);
  const matching = creatures.filter(c => gameColors(c).some(x => ["B", "G"].includes(x))).length;
  const grave = state.graveyard.filter(c => c.id !== card.id).length;
  const payable = matching >= colored.length && creatures.length + grave >= generic + colored.length;
  return { supported: true, payable, cost, generic, colored: colored.length, reason: payable ? "" : `召集に黒／緑のクリーチャー${colored.length}体と、合計${generic + colored.length}枚分の召集・探査が必要です。`, life: 0, activations: [] };
}
export function castGoldfishAlternative(state, cardId, modeId, answer = {}) {
  assertGoldfishChoiceComplete(state);
  const zone = ["hand", "graveyard"].find(z => state[z].some(c => c.id === cardId));
  const card = state[zone]?.find(c => c.id === cardId), mode = goldfishAlternativeModes(card, zone).find(m => m.id === modeId);
  if (!mode) throw new Error("この唱え方は使えません。");
  const blocked = castBlockReason(state, zone); if (blocked) throw new Error(blocked);
  if (mode.id === "force" && state.rules.activePlayer === "self") throw new Error("否定の力の代替コストは相手のターンだけ使えます。");
  if (!answer.refs) {
    const next = cloneGoldfishState(state);
    next.rules.pendingChoice = { type: "cast-alternative", card: ref(card, zone), sourceName: card.name, modeId };
    return next;
  }
  const candidates = alternativeCandidates(state, card, mode), refs = answer.refs;
  if (!Array.isArray(refs) || new Set(refs.map(r => r.id)).size !== refs.length || refs.some(r => !candidates.some(c => sameGoldfishReference(c.ref, r)))) throw new Error("コストのカードを選んでください。");
  const cards = refs.map(r => find(state, r));
  if (mode.id === "hogaak") {
    const plan = planHogaak(state, card), tapped = refs.filter(r => r.zone === "battlefield"), exiled = refs.filter(r => r.zone === "graveyard");
    if (tapped.filter(r => gameColors(find(state, r)).some(c => ["B", "G"].includes(c))).length < plan.colored || exiled.length > plan.generic || refs.length !== plan.generic + plan.colored) throw new Error("色マナは黒／緑のクリーチャーで召集し、残りを召集・探査で支払ってください。マナは使えません。");
    let next = cloneGoldfishState(state);
    for (const r of tapped) find(next, r).tapped = true;
    for (const r of exiled) move(next, r.id, "graveyard", "exile");
    if (zone !== "hand") next = moveGoldfishCards(next, card.id, "hand");
    return playGoldfishCard(next, card.id, { fromZone: zone, alternative: "hogaak", manaSpent: 0, colorsSpent: [] });
  }
  if (Number.isInteger(mode.count) && refs.length !== mode.count || mode.count === "optional" && refs.length > 1) throw new Error("コストの枚数が違います。");
  if (mode.evidence && cards.reduce((sum, c) => sum + gameManaValue(c), 0) < mode.evidence) throw new Error("証拠のマナ総量が6に足りません。");
  if (mode.types && goldfishGraveyardTypes({ graveyard: cards }).length < mode.types) throw new Error("追放するカードのタイプが4種類に足りません。");
  if (mode.target && !engineCandidates(state, { zone: "battlefield", filter: { types: ["Creature"] }, target: true }).some(c => sameGoldfishReference(c.ref, answer.target))) throw new Error("授与するクリーチャーを選んでください。");
  const x = answer.x || 0;
  if (mode.spellTarget) validateGoldfishSpellTarget(state, card, answer.target);
  if (!Number.isInteger(x) || x < 0 || x > 99) throw new Error("Xは0〜99で選んでください。");
  let cost = mode.cost;
  if (mode.id === "harmonize") cost = "{" + Math.max(0, x - (cards[0] ? Number(goldfishCharacteristics(state, cards[0]).power) || 0 : 0)) + "}{G}{G}{G}{G}";
  cost = goldfishCastingCost(card, { state, x, baseCost: cost });
  const plan = planGoldfishPayment(state, { manaCost: cost }, { x, spell: card, exclude: refs.filter(r => (r.zone || "battlefield") === "battlefield").map(r => r.id) });
  if (!plan.payable) throw new Error(plan.reason);
  if (state.players.self.life < (plan.life || 0) + (mode.life || 0)) throw new Error("ライフが足りません。");
  let next = payGoldfishPlan(state, plan);
  if (mode.life) changeLife(next, -mode.life);
  for (const r of refs) {
    if (mode.tap) find(next, r).tapped = true;
    else move(next, r.id, r.zone || "battlefield", mode.returnHand ? "hand" : mode.id === "titan" || mode.discard ? "graveyard" : "exile");
  }
  if (zone !== "hand") next = moveGoldfishCards(next, cardId, "hand");
  next = playGoldfishCard(next, cardId, { target: answer.target || null, bestow: mode.id === "bestow", evoked: mode.id === "evoke", flashback: ["harmonize", "flashback-discard"].includes(mode.id), x, colorsSpent: plan.colorsSpent, manaSpent: plan.manaSpent, uncounterable: plan.uncounterable, alternative: mode.id });
  next.stack.find(c => c.id === cardId).cast.manaByColor = structuredClone(plan.manaByColor || {});
  return flushEngineEvents(next);
}
export function chooseGoldfishAlternative(state, answer) {
  const choice = state.rules.pendingChoice;
  if (choice?.type !== "cast-alternative" || !find(state, choice.card)) throw new Error("唱えるカードがありません。");
  const next = cloneGoldfishState(state); next.rules.pendingChoice = null;
  return answer.cancel ? next : castGoldfishAlternative(next, choice.card.id, choice.modeId, answer);
}
