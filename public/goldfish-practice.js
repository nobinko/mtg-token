import { cloneGoldfishState, advanceGoldfishGame, chooseGoldfishRule } from "./goldfish.js?v=20261020-public30b";
import { castGoldfishCard, activateGoldfishLand, goldfishLandManaOptions } from "./goldfish-mana.js?v=20261020-public30b";
import { activateGoldfishAction } from "./goldfish-actions.js?v=20261020-public30b";
import { activeFace, cardName } from "./goldfish-events.js?v=20261020-public30b";
import { verifiedGoldfishCard } from "./goldfish-card-programs.js?v=20261020-public30b";
import { goldfishFindObject, goldfishReference } from "./goldfish-objects.js?v=20261020-public30b";

export function castPreparedGoldfishSpell(state, cardId, options = {}) {
  const source = state.battlefield.find(c => c.id === cardId);
  if (!source?.prepared || !verifiedGoldfishCard(source) || !["Pompous Battlemage", "Carnivorous Cultivator", "Emeritus of Ideation", "Skycoach Conductor"].includes(cardName(source))) throw new Error("このカードは準備済みではありません。");
  const next = cloneGoldfishState(state), spell = source.faces[1];
  const copy = { ...structuredClone(source), ...structuredClone(spell), id: "prepared-" + next.nextId++, faces: [], faceIndex: 0, kind: "card", counters: {}, incarnation: 0, prepared: false, preparedSource: { id: source.id, incarnation: source.incarnation } };
  next.hand.push(copy);
  const cast = castGoldfishCard(next, copy.id, options);
  if (!cast.stack.some(c => c.id === copy.id) && !cast.rules.pendingChoice) throw new Error("準備呪文を唱えられませんでした。");
  return cast;
}
export function goldfishCombos(state) {
  if (state.phase !== "playing" || state.stack.length || state.rules.pendingChoice) return [];
  const result = [];
  for (const card of state.battlefield.filter(verifiedGoldfishCard)) {
    if (cardName(card) === "Ygra, Eater of All" && state.battlefield.some(c => cardName(c) === "Cauldron Familiar" && c.ygraFood) && state.graveyard.some(c => cardName(c) === "Cauldron Familiar") && !state.battlefield.some(c => cardName(c) === "Grafdigger's Cage"))
      result.push({ id: "ygra", cardId: card.id, label: "イグラ＋使い魔2枚：食物として交互に生け贄・帰還" });
    if (cardName(card) === "Basking Broodscale" && state.battlefield.some(c => cardName(c) === "Blade of the Bloodchief" && goldfishFindObject(state, c.attachedTo)?.id === card.id) && state.battlefield.some(c => c.name === "Eldrazi Spawn" && c.kind === "token"))
      result.push({ id: "broodscale", cardId: card.id, label: "落とし子→血の長の刃→落とし子を反復" });
    if (cardName(card) === "Devoted Druid" && state.battlefield.some(c => cardName(c) === "Vizier of Remedies") && goldfishLandManaOptions(card, state).length)
      result.push({ id: "druid", cardId: card.id, label: "献身のドルイド＋療治の侍臣でマナを反復" });
  }
  return result;
}
export function repeatGoldfishCombo(state, comboId, cardId, count) {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("反復回数は1〜100で指定してください。");
  if (!goldfishCombos(state).some(c => c.id === comboId && c.cardId === cardId)) throw new Error("このコンボの条件が揃っていません。");
  let next = cloneGoldfishState(state);
  for (let index = 0; index < count; index++) {
    if (comboId === "ygra") {
      const cat = next.graveyard.find(c => cardName(c) === "Cauldron Familiar");
      const food = next.battlefield.find(c => cardName(c) === "Cauldron Familiar" && c.ygraFood);
      next = advanceGoldfishGame(activateGoldfishAction(next, cat.id, "engine:familiar-return", { costCards: [goldfishReference(food, "battlefield")] }), { autoOrder: true });
      for (let i = 0; i < 10 && next.rules.pendingChoice?.type === "engine-target" && next.rules.pendingChoice.sourceName === "Mayhem Devil"; i++)
        next = advanceGoldfishGame(chooseGoldfishRule(next, { target: next.rules.pendingChoice.candidates.find(c => c.ref.player === "opponent" && !c.ref.virtual).ref }), { autoOrder: true });
    } else if (comboId === "druid") {
      const druid = next.battlefield.find(c => c.id === cardId);
      if (druid.tapped) next = advanceGoldfishGame(activateGoldfishAction(next, cardId, "engine:druid-untap"));
      next = activateGoldfishLand(next, cardId);
      next = advanceGoldfishGame(activateGoldfishAction(next, cardId, "engine:druid-untap"));
    } else {
      const spawn = next.battlefield.find(c => c.name === "Eldrazi Spawn" && c.kind === "token");
      if (!spawn) throw new Error("落とし子が不足しています。");
      next = advanceGoldfishGame(activateGoldfishAction(next, spawn.id, "engine:spawn-mana"));
      if (next.rules.pendingChoice?.type === "engine-choice" && next.rules.pendingChoice.sourceName === "Basking Broodscale" && next.rules.automation?.steps[next.rules.automation.step]?.op === "optional-token") next = advanceGoldfishGame(chooseGoldfishRule(next, { value: "yes" }));
    }
    if (next.stack.length || next.rules.pendingChoice) throw new Error("ほかの誘発や選択が入るため、一括反復できません。通常の起動で進めてください。");
    if (Object.values(next.manaPool).some(n => n > 999)) throw new Error("マナの表示上限に達します。反復回数を減らしてください。");
  }
  next.rules.lastAction = count + "回のコンボを処理しました。";
  return next;
}
