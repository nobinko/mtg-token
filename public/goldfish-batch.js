import { cloneGoldfishState } from "./goldfish.js?v=20261020-solo10";
import { activateGoldfishAction, goldfishActionReason } from "./goldfish-actions.js?v=20261020-solo10";
import { goldfishCardActions } from "./goldfish-action-definitions.js?v=20261020-solo10";
import { goldfishReference as ref, goldfishFindObject as find } from "./goldfish-objects.js?v=20261020-solo10";
import { isType } from "./goldfish-events.js?v=20261020-solo10";

export function beginGoldfishSacrificeSequence(state, sourceId, cardIds) {
  if (state.rules.pendingChoice || state.stack.length || state.rules.sacrificeSequence) throw new Error("いまの解決を終えてからまとめて起動してください。");
  const source = state.battlefield.find(c => c.id === sourceId), action = goldfishCardActions(source).find(a => a.id === "engine:bombardment");
  if (!action) throw new Error("起動できるゴブリンの砲撃がありません。");
  const reason = goldfishActionReason(state, source, action); if (reason) throw new Error(reason);
  const cards = cardIds.map(id => state.battlefield.find(c => c.id === id));
  if (!cards.length || cards.length > 100 || new Set(cardIds).size !== cards.length || cards.some(c => !c || !isType(c, "Creature"))) throw new Error("生け贄にするクリーチャーを1〜100体選んでください。");
  const next = cloneGoldfishState(state);
  delete next.rules.batchError;
  next.rules.sacrificeSequence = { source: ref(source), cards: cards.map(c => ref(c)), done: 0, total: cards.length };
  return next;
}

// One real activation at a time. Its effects and triggers resolve before the
// next, so an Ajani transformation or other choice pauses without losing work.
export function stepGoldfishSacrificeSequence(state) {
  const sequence = state.rules.sacrificeSequence;
  if (!sequence || state.stack.length || state.rules.pendingChoice) return state;
  const next = cloneGoldfishState(state), queue = next.rules.sacrificeSequence;
  if (!queue.cards.length) { next.rules.lastAction = `砲撃を${queue.done}回解決しました。`; delete next.rules.sacrificeSequence; return next; }
  try {
    const source = find(next, queue.source), card = find(next, queue.cards[0]);
    if (!source || !card) throw new Error("発生源か選んだクリーチャーが移動しました。");
    queue.cards.shift(); queue.done++;
    return activateGoldfishAction(next, source.id, "engine:bombardment", { target: { player: "opponent" }, costCards: [ref(card, "battlefield")] });
  } catch (error) {
    delete next.rules.sacrificeSequence;
    next.rules.batchError = `まとめて起動を停止：${error.message} 残りの生け贄は行っていません。`;
    next.rules.lastAction = next.rules.batchError;
    return next;
  }
}
