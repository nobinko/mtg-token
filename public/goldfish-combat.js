import { goldfishCharacteristics, goldfishKeywords, recordGoldfishAttack, assertGoldfishChoiceComplete } from "./goldfish-rules.js?v=20261021-public30l";
import { goldfishReference, goldfishFindObject } from "./goldfish-objects.js?v=20261021-public30l";
import { engineAttackGroup } from "./goldfish-engine.js?v=20261021-public30l";
import { changeLife } from "./goldfish-events.js?v=20261021-public30l";
import { hasRuleCard } from "./goldfish-constraints.js?v=20261021-public30l";
import { offerCombatCrew } from "./goldfish-format-runtime.js?v=20261021-public30l";

const face = (card) => card.faces?.[card.faceIndex || 0] || card;
export function goldfishAttackers(state) {
  return state.battlefield.filter((card) => /\bCreature\b/.test(card.faceDown ? "Creature" : face(card).typeLine || "")).map((card) => {
    const keywords = goldfishKeywords(state, card);
    const reason = state.rules.noAttackSerial === state.rules.turnSerial ? "オアリムの詠唱：このターンは攻撃できない" : card.tapped ? "タップ中" : keywords.has("defender") ? "防衛" : hasRuleCard(state, "Ensnaring Bridge") && Number(goldfishCharacteristics(state, card).power) > state.hand.length ? "罠の橋：パワーが手札枚数を超える" : !keywords.has("haste") && (card.enteredTurn == null || card.enteredTurn >= state.turn) ? "召喚酔い（旧保存は次のターンから）" : "";
    const characteristics = goldfishCharacteristics(state, card);
    return { card, ref: goldfishReference(card), reason, power: Number(characteristics.power), toughness: characteristics.toughness,
      required: characteristics.notes.some((note) => note.includes("可能なら攻撃")) && !reason };
  });
}

export function beginGoldfishCombatDraft(state) {
  assertGoldfishChoiceComplete(state);
  if (state.phase !== "playing" || state.rules.activePlayer !== "self" || state.stack.length) throw new Error("自分のターンに、スタックを解決してから攻撃してください。");
  if (state.rules.combat) {
    if (state.rules.combat.stage === "done" && state.rules.extraCombats > 0) { state.rules.extraCombats--; state.rules.combat = null; }
    else throw new Error("このターンの攻撃は宣言済みです。");
  }
  if (!offerCombatCrew(state)) state.rules.pendingChoice = { type: "attack", sourceName: "攻撃クリーチャー", cardIds: goldfishAttackers(state).map((item) => item.card.id) };
}

export function declareGoldfishAttackersDraft(state, answer) {
  if (state.rules.pendingChoice?.type !== "attack") throw new Error("攻撃クリーチャーの選択中ではありません。");
  if (answer.cancel) { state.rules.pendingChoice = null; return; }
  const available = goldfishAttackers(state), ids = answer.ids;
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some((id) => !available.some((item) => item.card.id === id && !item.reason && Number.isFinite(item.power)))) throw new Error("攻撃できるクリーチャーを選んでください。");
  if (available.some((item) => item.required && !ids.includes(item.card.id))) throw new Error("可能なら攻撃するクリーチャーも選んでください。");
  const attackers = ids.map((id) => available.find((item) => item.card.id === id));
  state.rules.pendingChoice = null;
  state.manaPool = Object.fromEntries(Object.keys(state.manaPool).map((color) => [color, 0]));
  state.rules.restrictedMana = [];
  state.rules.hasteMana = 0;
  state.rules.combat = { stage: "declared", attackers: attackers.map((item) => item.ref), firstStrikeIds: null };
  const stackStart = state.stack.length;
  for (const { card } of attackers) {
    if (!goldfishKeywords(state, card).has("vigilance")) card.tapped = true;
    recordGoldfishAttack(state, card);
  }
  engineAttackGroup(state);
  const triggers = state.stack.slice(stackStart);
  if (triggers.length > 1) state.rules.pendingChoice = { type: "order", entryIds: triggers.map((entry) => entry.id) };
  state.rules.lastAction = `${attackers.length}体で攻撃。ダメージの前に呪文・能力を使えます。`;
}

export function resolveGoldfishCombatDraft(state) {
  assertGoldfishChoiceComplete(state);
  const combat = state.rules.combat;
  if (state.stack.length || !combat || combat.stage === "done") throw new Error("攻撃を宣言し、スタックを解決してください。");
  const fire = Math.min(state.manaPool.R, state.rules.fireMana || 0);
  state.manaPool = Object.fromEntries(Object.keys(state.manaPool).map((color) => [color, color === "R" ? fire : 0]));
  state.rules.restrictedMana = [];
  state.rules.hasteMana = 0;
  const live = combat.attackers.map((ref) => goldfishFindObject(state, ref)).filter((card) => card && /\bCreature\b/.test(card.faceDown ? "Creature" : face(card).typeLine || ""));
  const first = live.filter((card) => { const keywords = goldfishKeywords(state, card); return keywords.has("first strike") || keywords.has("double strike"); });
  const firstStep = combat.stage === "declared" && first.length > 0;
  if (combat.stage === "declared") combat.firstStrikeIds = first.map((card) => card.id);
  const dealing = firstStep ? first : live.filter((card) => !combat.firstStrikeIds.includes(card.id) || goldfishKeywords(state, card).has("double strike"));
  let damage = 0, poison = 0, gain = 0;
  const stackStart = state.stack.length;
  for (const card of dealing) {
    const power = Number(goldfishCharacteristics(state, card).power);
    if (!Number.isFinite(power)) throw new Error(`${card.name}のパワーを詳細操作で設定してください。`);
    const amount = Math.max(0, power), keywords = goldfishKeywords(state, card);
    if (keywords.has("infect")) poison += amount; else damage += amount;
    if (keywords.has("lifelink")) gain += amount;
    if (amount) recordGoldfishAttack(state, card, true);
  }
  changeLife(state, -damage, "opponent"); state.players.opponent.poison += poison;
  changeLife(state, gain);
  combat.stage = firstStep ? "normal" : "done";
  if (combat.stage === "done") { state.manaPool.R = 0; state.rules.fireMana = 0; }
  const triggers = state.stack.slice(stackStart);
  if (triggers.length > 1) state.rules.pendingChoice = { type: "order", entryIds: triggers.map((entry) => entry.id) };
  state.rules.lastAction = `${firstStep ? "先制" : "通常"}戦闘ダメージ：相手に${damage}点${poison ? `・毒${poison}` : ""}${gain ? `、自分は${gain}点回復` : ""}。`;
}
