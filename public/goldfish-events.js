import { moveGoldfishRuleObject, goldfishReference } from "./goldfish-objects.js?v=20261020-solo3";
import { hasRuleCard } from "./goldfish-constraints.js?v=20261020-solo3";
import { verifiedGoldfishCard } from "./goldfish-card-programs.js?v=20261020-solo3";

export const activeFace = card => card?.faces?.[card.faceIndex || 0] || card || {};
export const cardType = card => card.faceDown ? "Creature" : String(activeFace(card).typeLine || "");
export const cardName = card => activeFace(card).name;
export const isType = (card, type) => new RegExp(`\\b${type}\\b`).test(cardType(card));
export function emitGameEvent(state, event) { (state.rules.events ||= []).push(structuredClone(event)); }
export function changeLife(state, amount, player = "self") {
  if (amount > 0 && hasRuleCard(state, "Sunspine Lynx")) return;
  state.players[player].life += amount;
  if (player === "self" && amount > 0) state.rules.lifeGained = (state.rules.lifeGained || 0) + amount;
  state.life = state.players.self.life;
}
export function drawGameCards(state, count) {
  if (count <= 0) return 0;
  if (state.rules.drawing) throw new Error("前のドロー選択を完了してください。");
  // Riddler replaces the whole draw instruction, not each individual draw.
  if (count > 0 && state.hand.length <= 1) count += state.battlefield.filter(c => cardName(c) === "Quantum Riddler" && !c.faceDown && c.automaticAbilities !== false).length;
  const draw = state.rules.drawing = { remaining: count, drawn: 0, replaced: 0 };
  continueGameDraw(state);
  return draw.drawn;
}
function dredgeOptions(state) {
  return state.graveyard.filter(verifiedGoldfishCard).map(card => ({ card, count: Number(activeFace(card).oracleText?.match(/\bDredge (\d+)/)?.[1] || 0) }))
    .filter(o => o.count > 0 && state.library.length >= o.count);
}
function drawOne(state) {
    if (!state.library.length) { state.rules.emptyDraw = true; return false; }
    moveGoldfishRuleObject(state, state.library.at(-1).id, "library", "hand");
    emitGameEvent(state, { kind: "draw", watchers: state.battlefield.filter(c => cardName(c) === "Sheoldred, the Apocalypse" && !c.faceDown && c.automaticAbilities !== false) });
    return true;
}
function continueGameDraw(state) {
  const draw = state.rules.drawing;
  while (draw.remaining > 0) {
    const candidates = dredgeOptions(state).map(o => ({ ref: goldfishReference(o.card, "graveyard"), count: o.count, value: `${o.card.id}:${o.card.incarnation}`, label: `${cardName(o.card)}を発掘${o.count}（引く代わりに切削して回収）` }));
    if (candidates.length) {
      state.rules.pendingChoice = { type: "engine-draw", kind: "buttons", sourceName: state.rules.automation?.sourceName || state.rules.resolution?.sourceName || "ドロー", label: `ドローか発掘を選ぶ（残り${draw.remaining}回）`, candidates, options: [{ value: "draw", label: "通常どおり1枚引く" }, ...candidates.map(({ value, label }) => ({ value, label }))] };
      return;
    }
    draw.remaining--;
    if (drawOne(state)) draw.drawn++; else { draw.remaining = 0; break; }
  }
  delete state.rules.drawing;
}
export function chooseGameDraw(state, answer) {
  const choice = state.rules.pendingChoice, draw = state.rules.drawing;
  if (!draw || choice?.type !== "engine-draw") throw new Error("ドロー選択が見つかりません。");
  if (answer.value !== "draw") {
    const selected = choice.candidates.find(c => c.value === answer.value);
    const option = selected && dredgeOptions(state).find(o => o.card.id === selected.ref.id && o.card.incarnation === selected.ref.incarnation && o.count === selected.count);
    if (!option) throw new Error("発掘できるカードと山札の枚数を確認してください。");
    for (let i = 0; i < option.count; i++) moveGoldfishRuleObject(state, state.library.at(-1).id, "library", "graveyard");
    moveGoldfishRuleObject(state, option.card.id, "graveyard", "hand");
    draw.replaced++;
  } else if (drawOne(state)) draw.drawn++;
  draw.remaining--; state.rules.pendingChoice = null;
  continueGameDraw(state);
  if (!state.rules.drawing) state.rules.lastAction = `ドロー${draw.drawn}枚・発掘${draw.replaced}回。`;
}
export function addGameCounters(state, card, name, count) {
  if (name === "-1/-1" && count > 0 && state.battlefield.some(c => cardName(c) === "Vizier of Remedies" && !c.faceDown)) count = Math.max(0, count - 1);
  if (!count) return;
  card.counters[name] = Math.max(0, (card.counters[name] || 0) + count);
  emitGameEvent(state, { kind: "counters", card: structuredClone(card), name, count });
}
export function makeGameToken(state, data, count = 1) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const card = { id: `extra-${state.nextId++}`, kind: "token", name: "Token", typeLine: "Token Creature", power: "1", toughness: "1", colors: [],
      manaCost: "", oracleText: "", imageUrl: "", faces: [], faceIndex: 0, faceDown: false, tapped: false, counters: {}, powerOverride: "", toughnessOverride: "", note: "", groupId: "", incarnation: 0, temporaryEffects: [], attachedTo: null,
      ...structuredClone(data), enteredTurn: state.turn, enteredSerial: state.rules.turnSerial };
    card.lane = isType(card, "Creature") ? "creature" : isType(card, "Land") ? "land" : "other";
    state.battlefield.push(card); result.push(card);
    emitGameEvent(state, { kind: "move", from: "creation", to: "battlefield", card, original: card });
  }
  return result;
}
export function queueGameAbility(state, source, label, steps, extra = {}) {
  const entry = { id: `ability-${state.rules.nextEventId++}`, kind: "ability", name: cardName(source) || source.name, imageUrl: activeFace(source).imageUrl || source.imageUrl || "", oracleText: activeFace(source).oracleText || "",
    ability: { rule: "engine", label, source: goldfishReference(source), batch: state.rules.nextEventId, steps: structuredClone(steps), ...extra } };
  state.stack.push(entry); return entry;
}
export function shuffleGameLibrary(state, random = Math.random) {
  for (let i = state.library.length - 1; i > 0; i--) {
    const j = Math.floor(Math.max(0, Math.min(.999999999, random())) * (i + 1));
    [state.library[i], state.library[j]] = [state.library[j], state.library[i]];
  }
}
