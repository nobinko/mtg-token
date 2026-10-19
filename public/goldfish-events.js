import { moveGoldfishRuleObject, goldfishReference } from "./goldfish-objects.js?v=20261019-formats5";

export const activeFace = card => card?.faces?.[card.faceIndex || 0] || card || {};
export const cardType = card => card.faceDown ? "Creature" : String(activeFace(card).typeLine || "");
export const cardName = card => activeFace(card).name;
export const isType = (card, type) => new RegExp(`\\b${type}\\b`).test(cardType(card));
export function emitGameEvent(state, event) { (state.rules.events ||= []).push(structuredClone(event)); }
export function changeLife(state, amount, player = "self") {
  state.players[player].life += amount;
  if (player === "self" && amount > 0) state.rules.lifeGained = (state.rules.lifeGained || 0) + amount;
  state.life = state.players.self.life;
}
export function drawGameCards(state, count) {
  // Riddler replaces the whole draw instruction, not each individual draw.
  if (count > 0 && state.hand.length <= 1) count += state.battlefield.filter(c => cardName(c) === "Quantum Riddler" && !c.faceDown && c.automaticAbilities !== false).length;
  let drawn = 0;
  for (; drawn < count; drawn++) {
    if (!state.library.length) { state.rules.emptyDraw = true; break; }
    moveGoldfishRuleObject(state, state.library.at(-1).id, "library", "hand");
    emitGameEvent(state, { kind: "draw", watchers: state.battlefield.filter(c => cardName(c) === "Sheoldred, the Apocalypse" && !c.faceDown && c.automaticAbilities !== false) });
  }
  return drawn;
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
