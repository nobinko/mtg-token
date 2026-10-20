import { cloneGoldfishState } from "./goldfish.js?v=20261020-solo7";
import { assertGoldfishChoiceComplete, recordGoldfishActivation, goldfishGraveyardTypes, goldfishCharacteristics } from "./goldfish-rules.js?v=20261020-solo7";
import { planGoldfishPayment, payGoldfishPlan } from "./goldfish-mana.js?v=20261020-solo7";
import { goldfishCardActions, goldfishMainTiming, goldfishCanEquip } from "./goldfish-action-definitions.js?v=20261020-solo7";
import { goldfishReference, goldfishFindObject, moveGoldfishRuleObject, sameGoldfishReference, goldfishIsLegendary } from "./goldfish-objects.js?v=20261020-solo7";
import { applyGoldfishStateActions } from "./goldfish-spells.js?v=20261020-solo7";
import { engineCandidates, canTapCreature, flushEngineEvents, startEngineResolution } from "./goldfish-engine.js?v=20261020-solo7";
import { queueGameAbility, addGameCounters, changeLife, isType, cardName } from "./goldfish-events.js?v=20261020-solo7";
import { abilityBlockReason } from "./goldfish-constraints.js?v=20261020-solo7";
import { recordGoldfishTargets } from "./goldfish-ability-extensions.js?v=20261020-solo7";

export function goldfishActionTargets(state, card) {
  return state.battlefield.filter((target) => goldfishCanEquip(state, card, target));
}
export function goldfishActionPayment(state, card, action, options = {}) {
  const discount = action.waterbend ? options.costCards?.length || 0 : action.legendaryDiscount ? state.battlefield.filter(c => goldfishIsLegendary(state, c) && isType(c, "Creature")).length : 0;
  let cost = action.cost.replace(/\{(\d+)\}/, (_, n) => `{${Math.max(0, Number(n) - discount)}}`);
  if (action.powerUp && card.enteredSerial === state.rules.turnSerial) {
    const symbols = ((card.faces?.[card.faceIndex || 0] || card).manaCost || "").match(/\{[^}]+\}/g) || [];
    for (const symbol of symbols) {
      if (/^\{\d+\}$/.test(symbol)) cost = cost.replace(/\{(\d+)\}/, (_, n) => `{${Math.max(0, Number(n) - Number(symbol.slice(1,-1)))}}`);
      else cost = cost.replace(symbol, "");
    }
  }
  return planGoldfishPayment(state, { manaCost: cost }, { ...options, creatureAbility: isType(card, "Creature"), abilitySource: card, exclude: [...(action.tap ? [card.id] : []), ...(options.costCards || []).map(ref => ref.id)] });
}
export function goldfishActionReason(state, card, action) {
  if (state.phase !== "playing") return "初手をキープしてください。";
  const blocked = abilityBlockReason(state, card, action); if (blocked) return blocked;
  if (action.once && card.usedAbilities?.includes(action.id)) return "この能力はすでに起動済みです。戦場を離れて戻ると再び使えます。";
  if (action.ownTurn && state.rules.activePlayer !== "self") return "自分のターンに使える能力です。";
  if (action.zone === "battlefield" && isType(card, "Land") && !isType(card, "Basic") && state.battlefield.some(c => cardName(c) === "Blood Moon" && c.automaticAbilities !== false && !c.faceDown)) return "血染めの月により、この土地の能力は失われています。";
  if (action.main && !goldfishMainTiming(state) && !(action.loyalty != null && /\bJace\b/.test((card.faces?.[card.faceIndex || 0] || card).typeLine || "") && state.rules.jaceInstantSerial === state.rules.turnSerial)) return "自分のメインで、スタックが空のときに使えます。";
  if (action.tap && card.tapped) return "この土地をアンタップしてから使ってください。";
  if (action.tap && !canTapCreature(state, card)) return "このクリーチャーは召喚酔いです。";
  if (action.chapter && (card.sagaAbilities || 0) < action.chapter) return "まだこの章の能力を得ていません。";
  if (action.ninjutsu && !["declared", "normal"].includes(state.rules.combat?.stage)) return "攻撃を宣言してから、ブロックされていないクリーチャーを戻して使います。";
  if (action.fromLevel && (card.level || 1) !== action.fromLevel) return "現在のクラスレベルでは使えません。";
  if (action.delirium && goldfishGraveyardTypes(state).length < 4) return "昂揚には墓地のカード・タイプ4種類が必要です。";
  if (action.loyalty != null && (card.loyaltyUsed === state.rules.turnSerial || (card.counters.loyalty || 0) + action.loyalty < 0)) return "忠誠度が不足しているか、このターンは起動済みです。";
  if (action.lifeCost && state.players.self.life < action.lifeCost) return "支払うライフが足りません。";
  if (action.target && !goldfishActionTargets(state, card).length) return "装備できる自分のクリーチャーがいません。";
  if (action.cards && state[action.cards.zone].length < action.cards.count) return `${action.cards.zone === "hand" ? "手札" : "墓地"}の枚数が足りません。`;
  return "";
}

export function activateGoldfishAction(state, cardId, actionId, options = {}) {
  assertGoldfishChoiceComplete(state);
  const card = [...state.hand, ...state.battlefield, ...state.graveyard].find((item) => item.id === cardId);
  const action = goldfishCardActions(card).find((item) => item.id === actionId);
  if (!action || !state[action.zone].some((item) => item.id === cardId)) throw new Error("この領域ではその能力を使えません。");
  const reason = goldfishActionReason(state, card, action);
  if (reason) throw new Error(reason);
  if (action.id.startsWith("engine:")) return activateEngineAction(state, card, action, options);
  const plan = goldfishActionPayment(state, card, action, options);
  if (!plan.payable) throw new Error(plan.reason);
  if ((action.target && !options.target) || (action.cards && !options.cards) || (plan.life && !options.confirmLife)) {
    const next = cloneGoldfishState(state);
    next.rules.pendingChoice = { type: "action", card: goldfishReference(card, action.zone), actionId, sourceName: card.name, options: structuredClone(options) };
    next.rules.lastAction = `${card.name}：${action.label}。選択して確定してください。`;
    return next;
  }
  if (action.target && !goldfishActionTargets(state, card).some((item) => item.id === options.target.id && (item.incarnation || 0) === options.target.incarnation)) throw new Error("装備先が適正ではありません。コストは支払っていません。");
  if (action.cards) {
    if (!Array.isArray(options.cards) || options.cards.length !== action.cards.count || new Set(options.cards.map((ref) => ref.id)).size !== action.cards.count || options.cards.some((ref) => ref.zone !== action.cards.zone || !goldfishFindObject(state, ref))) throw new Error("コストにするカードを指定枚数、重複なく選んでください。");
    if (action.cards.zone === "hand" && options.cards.some((ref) => /\bMadness\b/i.test(goldfishFindObject(state, ref).oracleText || "") && cardName(goldfishFindObject(state, ref)) !== "Fiery Temper")) throw new Error("このマッドネスの効果は本文の操作で処理してください。");
  }
  const next = payGoldfishPlan(state, plan);
  if (action.id === "plot") {
    const plotted = moveGoldfishRuleObject(next, card.id, "hand", "exile");
    plotted.playPermission = { kind: "plot", serial: next.rules.turnSerial };
    next.rules.lastAction = `${card.name} を計画しました。次のターン以降、自分のメインで0マナで唱えられます。`;
    return next;
  }
  if (action.tap) next.battlefield.find((item) => item.id === card.id).tapped = true;
  if (action.sacrifice) moveGoldfishRuleObject(next, card.id, "battlefield", "graveyard", "sacrifice");
  if (action.discardSelf) moveGoldfishRuleObject(next, card.id, "hand", "graveyard");
  for (const ref of options.cards || []) moveGoldfishRuleObject(next, ref.id, action.cards.zone, action.cards.zone === "hand" ? "graveyard" : "exile");
  recordGoldfishActivation(next, card, action, options.target);
  next.rules.lastAction = `${card.name}：${action.label}を起動しました。`;
  applyGoldfishStateActions(next);
  return next;
}

export function chooseGoldfishAction(state, answer) {
  const choice = state.rules.pendingChoice;
  if (choice?.type !== "action") throw new Error("起動前の選択がありません。");
  if (!goldfishFindObject(state, choice.card)) throw new Error("選択中のカードが移動しています。");
  const next = cloneGoldfishState(state);
  next.rules.pendingChoice = null;
  if (answer.cancel) { next.rules.lastAction = "キャンセルしました。コストは支払っていません。"; return next; }
  return activateGoldfishAction(next, choice.card.id, choice.actionId, { ...choice.options, ...answer });
}

export function engineActionOptions(state, card, action) {
  const targetSpec = action.targetSpec;
  const targets = targetSpec ? engineCandidates(state, { ...targetSpec, filter: targetSpec, target: true }, { source: goldfishReference(card) }) : [];
  if (targetSpec?.players) targets.unshift({ ref: { player: "opponent" }, label: "相手" }, { ref: { player: "self" }, label: "自分" });
  if (targetSpec?.virtualOpponent) targets.unshift({ ref: { player: "opponent", virtual: true }, label: "相手の対象（領域は省略）" });
  const costs = action.costSelect ? engineCandidates(state, { zone: action.costSelect.zone, filter: action.costSelect.filter }, { source: goldfishReference(card) }) : [];
  return { targets, costs };
}
function activateEngineAction(state, card, action, options) {
  const { targets, costs } = engineActionOptions(state, card, action);
  if (action.targetSpec && !action.targetSpec.optional && !targets.length) throw new Error("適正な対象がありません。");
  if (action.costSelect && costs.length < action.costSelect.count) throw new Error("コストにするカードが足りません。");
  if ((action.x && options.x == null) || (action.divideDamage ? options.allocation === undefined : action.targetSpec?.count ? options.targets === undefined : action.targetSpec && options.target === undefined) || (action.costSelect && !options.costCards)) {
    const next = cloneGoldfishState(state);
    next.rules.pendingChoice = { type: "action", card: goldfishReference(card, action.zone), actionId: action.id, sourceName: cardName(card), options: structuredClone(options) };
    next.rules.lastAction = `${cardName(card)}：選択を確定してからコストを支払います。`;
    return next;
  }
  if (action.divideDamage) {
    const a = options.allocation;
    if (!Array.isArray(a) || !a.length || a.length > action.divideDamage || new Set(a.map(v => JSON.stringify(v.target))).size !== a.length || a.some(v => !Number.isInteger(v.amount) || v.amount < 1 || !targets.some(c => sameGoldfishReference(c.ref, v.target))) || a.reduce((n, v) => n + v.amount, 0) !== action.divideDamage) throw new Error("2点を1〜2つの適正な対象に、各1点以上配分してください。");
  } else if (action.targetSpec?.count) {
    if (!Array.isArray(options.targets) || options.targets.length > action.targetSpec.count || options.targets.length < (action.targetSpec.optional ? 0 : action.targetSpec.count) || new Set(options.targets.map(r=>JSON.stringify(r))).size !== options.targets.length || options.targets.some(r=>!targets.some(c=>sameGoldfishReference(c.ref,r)))) throw new Error("異なる適正な対象を選んでください。");
  } else if (action.targetSpec && (!options.target && !action.targetSpec.optional || options.target && !targets.some(c => sameGoldfishReference(c.ref, options.target)))) throw new Error("適正な対象を選んでください。");
  if (action.costSelect && (!Array.isArray(options.costCards) || (action.costSelect.variable ? options.costCards.length < action.costSelect.count : options.costCards.length !== action.costSelect.count) || new Set(options.costCards.map(r => r.id)).size !== options.costCards.length || options.costCards.some(r => !costs.some(c => sameGoldfishReference(c.ref, r))))) throw new Error("コストにするカードを選んでください。");
  if (action.costSelect?.minPower && options.costCards.reduce((n, r) => { const c = goldfishFindObject(state, r); return n + Number(goldfishCharacteristics(state, c).power) + (/crews Vehicles as though its power were 2 greater/.test(c.oracleText) ? 2 : 0); }, 0) < action.costSelect.minPower) throw new Error(`搭乗には合計パワー${action.costSelect.minPower}以上が必要です。`);
  const plan = goldfishActionPayment(state, card, action, options);
  if (!plan.payable) throw new Error(plan.reason);
  if (state.players.self.life < (plan.life || 0) + (action.lifeCost || 0)) throw new Error("マナと能力のライフ・コストを合わせて支払えません。");
  if ((plan.life || action.lifeCost) && !options.confirmLife) {
    const next = cloneGoldfishState(state);
    next.rules.pendingChoice = { type: "action", card: goldfishReference(card, action.zone), actionId: action.id, sourceName: cardName(card), options: structuredClone(options) }; return next;
  }
  const next = payGoldfishPlan(state, plan), source = goldfishFindObject(next, goldfishReference(card, action.zone));
  if (action.once) (source.usedAbilities ||= []).push(action.id);
  next.rules.lastAction = `${cardName(card)}：${action.label}を起動しました。`;
  if (action.lifeCost) changeLife(next, -action.lifeCost);
  if (action.tap) source.tapped = true;
  if (action.discardHand) for (const c of [...next.hand]) moveGoldfishRuleObject(next, c.id, "hand", "graveyard");
  if (action.counterCost) addGameCounters(next, source, action.counterCost.name, action.counterCost.amount);
  if (action.loyalty != null) { source.counters.loyalty += action.loyalty; source.loyaltyUsed = next.rules.turnSerial; }
  if (action.sacrifice) moveGoldfishRuleObject(next, card.id, "battlefield", "graveyard", "sacrifice");
  if (action.discardSelf) moveGoldfishRuleObject(next, card.id, "hand", "graveyard");
  if (action.exileSelf) moveGoldfishRuleObject(next, card.id, action.zone, "exile");
  for (const cost of options.costCards || []) {
    if (action.costSelect.destination === "tap") goldfishFindObject(next, cost).tapped = true;
    else moveGoldfishRuleObject(next, cost.id, cost.zone || "battlefield", action.costSelect.destination, (cost.zone || "battlefield") === "battlefield" && action.costSelect.destination === "graveyard" ? "sacrifice" : "");
  }
  const entry = queueGameAbility(next, card, action.label, action.steps, { activated: true, target: options.target || null, targets: options.targets, targetSpec: action.targetSpec, allocation: structuredClone(options.allocation), costCards: (options.costCards || []).map(r => { const c = goldfishFindObject(state, r); return { ...structuredClone(c), lastKnownToughness: goldfishCharacteristics(state, c).toughness }; }), x: options.x || 0, snapshot: structuredClone(card), source: goldfishReference(card, action.zone) });
  recordGoldfishTargets(next, [options.target, ...(options.targets || []), ...(options.allocation || []).map(a => a.target)]);
  if (action.manaAbility) startEngineResolution(next, entry);
  if (!next.rules.pendingChoice) applyGoldfishStateActions(next);
  return flushEngineEvents(next);
}
