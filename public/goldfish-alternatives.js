import { cloneGoldfishState, moveGoldfishCards, playGoldfishCard } from "./goldfish.js?v=20261019-formats5";
import { goldfishReference as ref, goldfishFindObject as find, moveGoldfishRuleObject as move, sameGoldfishReference } from "./goldfish-objects.js?v=20261019-formats5";
import { engineCandidates, gameManaValue, gameColors, flushEngineEvents } from "./goldfish-engine.js?v=20261019-formats5";
import { cardName, isType, changeLife } from "./goldfish-events.js?v=20261019-formats5";
import { verifiedGoldfishCard } from "./goldfish-card-programs.js?v=20261019-formats5";
import { planGoldfishPayment, payGoldfishPlan, goldfishCastingCost } from "./goldfish-mana.js?v=20261019-formats5";
import { validateGoldfishSpellTarget } from "./goldfish-spells.js?v=20261019-formats5";
import { goldfishCharacteristics, goldfishGraveyardTypes, assertGoldfishChoiceComplete } from "./goldfish-rules.js?v=20261019-formats5";
import { castBlockReason } from "./goldfish-constraints.js?v=20261019-formats5";

export function goldfishAlternativeModes(card, zone) {
  if (!verifiedGoldfishCard(card)) return [];
  const n = cardName(card), result = [];
  if (n === "Detective's Phoenix" && ["hand", "graveyard"].includes(zone)) result.push({ id: "bestow", label: "授与 {R}・証拠収集6", cost: "{R}", zone: "graveyard", count: "any", evidence: 6, target: true });
  if (n === "Nethergoyf" && zone === "graveyard") result.push({ id: "escape", label: "脱出 {2}{B}・墓地4タイプ", cost: "{2}{B}", zone: "graveyard", count: "any", types: 4 });
  if (n === "Nature's Rhythm" && zone === "graveyard") result.push({ id: "harmonize", label: "調和 X{G}{G}{G}{G}", cost: "{X}{G}{G}{G}{G}", zone: "battlefield", filter: { types: ["Creature"], untapped: true }, count: "optional", tap: true, x: true });
  if (n === "Salvage Titan" && zone === "hand") result.push({ id: "titan", label: "アーティファクト3つを生け贄に唱える", cost: "{0}", zone: "battlefield", filter: { types: ["Artifact"] }, count: 3 });
  if (["Solitude", "Endurance"].includes(n) && zone === "hand") result.push({ id: "evoke", label: "想起・色の合う手札1枚を追放", cost: "{0}", zone: "hand", filter: { color: n === "Solitude" ? "W" : "G" }, count: 1 });
  if (n === "Twinned Vision" && zone === "graveyard") result.push({ id: "flashback-discard", label: "フラッシュバック・手札1枚を捨てる", cost: "{1}{U/R}{U/R}", zone: "hand", count: 1, discard: true });
  if (n === "Force of Negation" && zone === "hand") result.push({ id: "force", label: "相手ターン：青い手札1枚を追放して唱える", cost: "{0}", zone: "hand", filter: { color: "U" }, count: 1, spellTarget: true });
  if (n === "Force of Will" && zone === "hand") result.push({ id: "force-will", label: "1ライフ・青い手札1枚を追放", cost: "{0}", zone: "hand", filter: { color: "U" }, count: 1, spellTarget: true, life: 1 });
  if (n === "Daze" && zone === "hand") result.push({ id: "daze", label: "島1枚を手札へ戻して唱える", cost: "{0}", zone: "battlefield", filter: { types: ["Land"], subtypes: ["Island"] }, count: 1, spellTarget: true, returnHand: true });
  if (n === "Ingot Chewer" && zone === "hand") result.push({ id: "evoke", label: "想起 {R}", cost: "{R}", zone: "hand", count: 0 });
  return result;
}
export function alternativeCandidates(state, card, mode) {
  return engineCandidates(state, { zone: mode.zone, filter: mode.filter || {} }).filter(c => c.card.id !== card.id);
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
  return flushEngineEvents(next);
}
export function chooseGoldfishAlternative(state, answer) {
  const choice = state.rules.pendingChoice;
  if (choice?.type !== "cast-alternative" || !find(state, choice.card)) throw new Error("唱えるカードがありません。");
  const next = cloneGoldfishState(state); next.rules.pendingChoice = null;
  return answer.cancel ? next : castGoldfishAlternative(next, choice.card.id, choice.modeId, answer);
}
