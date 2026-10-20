import { activeFace as face, cardName as name, isType, copiableGoldfishValues, addGameCounters, makeGameToken, queueGameAbility as queue, changeLife } from "./goldfish-events.js?v=20261021-public30k";
import { goldfishReference as ref, goldfishFindObject as find, moveGoldfishRuleObject as move } from "./goldfish-objects.js?v=20261021-public30k";
import { verifiedGoldfishCard, TOKENS, draw, discard } from "./goldfish-card-programs.js?v=20261021-public30k";
import { goldfishCardActions } from "./goldfish-action-definitions.js?v=20261021-public30k";
import { goldfishCharacteristics, goldfishKeywords } from "./goldfish-rules.js?v=20261021-public30k";
import { damage } from "./goldfish-engine.js?v=20261021-public30k";
import { ARTIFACT_NOTES, artifactEnter, artifactActions, artifactEvent, artifactStep, artifactChoose } from "./goldfish-artifact-programs.js?v=20261021-public30k";

const live = s => s.battlefield.filter(c => verifiedGoldfishCard(c));
const ask = (s, c, data) => { s.rules.pendingChoice = { type: "engine-choice", entryId: c.entryId, sourceName: c.sourceName, ...data }; };
export const ABILITY_EXTENSION_NOTES = {
  ...ARTIFACT_NOTES,
  "Agatha's Soul Cauldron": "墓地追放→別の誘発でカウンター。追放したクリーチャーの起動型能力を継承し、クリーチャーの起動に任意の色のマナを使える",
  "Triumph of Saint Katherine": "各ターン最初のドローの奇跡・死亡時の6枚と自身の山札への戻し方",
  "Captain Marvel, Earth's Protector": "パワーアップの登場ターンの軽減・1回限りの起動・カウンター",
  "M.O.D.O.K.": "自分のターンに3ライフで謀議。捨てた非土地ならカウンター",
  "Riverchurn Monument": "選んだプレイヤーの切削・消尽の1回制限",
  "Leatherhead, Swamp Stalker": "呪禁カウンター・戦闘後の任意のカウンター除去と破壊誘発",
  "Magda, the Hoardmaster": "各ターン最初の悪事でタップ状態の宝物・3宝物でドラゴン",
  "Drop of Honey": "アップキープの最小パワーの破壊・クリーチャー不在時の生け贄",
  "Screaming Nemesis": "受けたダメージの反射・プレイヤーの回復禁止",
  "Elesh Norn, Mother of Machines": "自分のパーマネントの登場誘発を1回追加",
  "Oildeep Gearhulk": "自分の手札を任意で1枚交換。相手の手札内容はひとり回しの省略領域"
};
export function hasAbilityExtension(c) { return verifiedGoldfishCard(c) && Boolean(ABILITY_EXTENSION_NOTES[name(c)]); }
export function extensionEnter(s, c) {
  if (artifactEnter(s, c)) return;
  if (verifiedGoldfishCard(c) && name(c) === "Oildeep Gearhulk")
    queue(s, c, "手札を見て、任意で1枚を捨てて引き直す", [{ op: "ext-oildeep" }], { targetSpec: { zone: "none", players: true } });
}

export function extensionActions(c) {
  const actions = [...artifactActions(c)], act = (id, label, cost, steps, extra = {}) => actions.push({ id: `engine:ext-${id}`, zone: "battlefield", cost, label, description: label, steps, ...extra });
  if (verifiedGoldfishCard(c)) {
    const n = name(c);
    if (n === "Agatha's Soul Cauldron") act("cauldron", "{T}：墓地を追放・クリーチャーなら＋1/＋1", "{0}", [{ op: "ext-cauldron" }], { tap: true, targetSpec: { zone: "graveyard" } });
    if (n === "Captain Marvel, Earth's Protector") act("power-up", "パワーアップ：＋1/＋1・破壊不能", "{5}{W}{W}", [{ op: "source-counter", name: "+1/+1", count: 1 }, { op: "source-counter", name: "indestructible", count: 1 }], { once: true, powerUp: true });
    if (n === "M.O.D.O.K.") act("connive", "3ライフ：謀議する", "{0}", [draw(), discard(1, { remember: "connived" }), { op: "ext-connive" }], { lifeCost: 3, ownTurn: true });
    if (n === "Riverchurn Monument") {
      act("river-mill", "{1},{T}：選んだプレイヤーが2枚切削", "{1}", [{ op: "ext-river-mill", count: 2 }], { tap: true, targetSpec: { zone: "none", players: true, count: 2, optional: true } });
      act("river-exhaust", "消尽 {2}{U}{U},{T}：墓地枚数分を切削", "{2}{U}{U}", [{ op: "ext-river-mill", exhaust: true }], { tap: true, once: true, targetSpec: { zone: "none", players: true, count: 2, optional: true } });
    }
    if (n === "Magda, the Hoardmaster") act("magda", "宝物3つ：4/4飛行・速攻のドラゴン", "{0}", [{ op: "ext-token", token: { name: "Scorpion Dragon", typeLine: "Token Creature — Scorpion Dragon", power: "4", toughness: "4", colors: ["R"], oracleText: "Flying, haste" } }], { main: true, costSelect: { zone: "battlefield", filter: { types: ["Treasure"] }, count: 3, destination: "graveyard" } });
  }
  for (const inherited of c.grantedAbilityCards || []) {
    const borrowed = { ...structuredClone(c), ...inherited.values, faces: [], faceIndex: 0, grantedAbilityCards: [] };
    delete borrowed.copyRuleName;
    for (const a of goldfishCardActions(borrowed).filter(a => a.zone === "battlefield")) {
      let steps = a.steps;
      if (a.id === "frog-counter") steps = [{ op: "source-counter", name: "+1/+1", count: 1 }];
      if (a.id === "frog-flying") steps = [{ op: "source-keyword", keyword: "flying" }];
      if (!steps) continue;
      actions.push({ ...a, id: `engine:cauldron-${inherited.ref.id}-${a.id}`, label: `${inherited.values.name}：${a.label}`, steps,
        ...(a.cards ? { costSelect: { zone: a.cards.zone, count: a.cards.count, destination: a.cards.zone === "hand" ? "graveyard" : "exile" }, cards: undefined } : {}) });
    }
  }
  return actions;
}

export function extensionState(s) {
  const cauldrons = live(s).filter(c => name(c) === "Agatha's Soul Cauldron");
  const granted = cauldrons.flatMap(c => (c.linkedExile || []).map(r => ({ card: find(s, r), ref: r }))).filter(x => x.card && isType(x.card, "Creature"))
    .map(x => ({ ref: x.ref, values: copiableGoldfishValues(x.card) }));
  for (const c of s.battlefield) {
    delete c.grantedAbilityCards;
    if (!c.faceDown && c.automaticAbilities !== false && isType(c, "Creature") && c.counters["+1/+1"] > 0 && granted.length) c.grantedAbilityCards = structuredClone(granted);
  }
  if (!s.rules.automation && !s.battlefield.some(c => isType(c, "Creature"))) for (const c of live(s).filter(c => name(c) === "Drop of Honey")) {
    if (!s.stack.some(e => e.ability?.source.id === c.id && e.ability.steps?.some(op => op.op === "ext-honey-empty"))) queue(s, c, "クリーチャーがいない：生け贄", [{ op: "ext-honey-empty" }]);
  }
}

export function extensionEvent(s, e) {
  artifactEvent(s, e);
  if (e.kind === "draw" && e.countThisTurn === 1 && e.card && verifiedGoldfishCard(e.card)) {
    const cost = face(e.card).oracleText.match(/\bMiracle ((?:\{[^}]+\})+)/)?.[1];
    if (cost) queue(s, e.card, `最初のドローを公開：奇跡 ${cost}`, [{ op: "effect-cast", card: ref(e.card, "hand"), cost }]);
  }
  if (e.kind === "move" && e.from === "battlefield" && e.to === "graveyard" && name(e.original) === "Triumph of Saint Katherine" && verifiedGoldfishCard(e.original))
    queue(s, e.original, "自身と上6枚を追放して混ぜ、上に戻す", [{ op: "ext-katherine-return", dead: ref(e.card, "graveyard") }]);
  if (e.kind === "damage" && name(e.card) === "Screaming Nemesis" && verifiedGoldfishCard(e.card))
    queue(s, e.card, `${e.amount}点を別の対象へ返す`, [{ op: "ext-nemesis", amount: e.amount }], { targetSpec: { zone: "battlefield", types: ["Creature", "Planeswalker", "Battle"], players: true, virtualOpponent: true, excludeSelf: true } });
}

export function extensionUpkeep(s) {
  if (s.rules.activePlayer === "self") for (const c of live(s).filter(c => name(c) === "Drop of Honey")) queue(s, c, "最もパワーが低いクリーチャーを破壊", [{ op: "ext-honey" }]);
}
export function extensionCombatDamage(s, c) {
  if (verifiedGoldfishCard(c) && name(c) === "Leatherhead, Swamp Stalker") queue(s, c, "カウンターを取り除いて破壊してもよい", [{ op: "ext-leatherhead" }]);
}
export function recordGoldfishTargets(s, targets = []) {
  if (!targets.some(r => r?.player === "opponent")) return;
  for (const c of live(s).filter(c => name(c) === "Magda, the Hoardmaster" && c.crimeSerial !== s.rules.turnSerial)) {
    c.crimeSerial = s.rules.turnSerial;
    queue(s, c, "このターン最初の悪事：タップ状態の宝物", [{ op: "ext-token", token: { ...TOKENS.treasure, tapped: true } }]);
  }
}

export function extensionStep(s, c, op) {
  if (artifactStep(s, c, op)) return true;
  const source = find(s, c.source), target = find(s, c.target);
  switch (op.op) {
    case "ext-token": makeGameToken(s, op.token); return true;
    case "ext-cauldron": {
      if (!target) return true;
      const creature = isType(target, "Creature"), exiled = move(s, target.id, "graveyard", "exile");
      if (source) (source.linkedExile ||= []).push(ref(exiled, "exile"));
      if (creature) queue(s, source || c.snapshot, "クリーチャーを追放：＋1/＋1カウンター", [{ op: "target-counter", name: "+1/+1", count: 1 }], { targetSpec: { zone: "battlefield", types: ["Creature"] } });
      return true;
    }
    case "ext-connive":
      if (source && c.vars.connived?.some(x => !isType(x, "Land"))) addGameCounters(s, source, "+1/+1", 1);
      return true;
    case "ext-river-mill":
      for (const r of c.targets) {
        const count = op.exhaust ? r.player === "self" ? s.graveyard.length : s.rules.opponentGraveyardCount || 0 : op.count;
        if (r.player === "self") for (let i = 0; i < count && s.library.length; i++) move(s, s.library.at(-1).id, "library", "graveyard");
        else {
          const actual = s.rules.opponentLibrary == null ? count : Math.min(count, s.rules.opponentLibrary);
          if (s.rules.opponentLibrary != null) s.rules.opponentLibrary -= actual;
          s.rules.opponentGraveyardCount = (s.rules.opponentGraveyardCount || 0) + actual;
          (s.rules.notices ||= []).push({ text: `相手は${actual}枚切削（相手のカード内容は省略）`, serial: s.rules.turnSerial });
        }
      }
      return true;
    case "ext-katherine-return": {
      const pile = [], card = find(s, op.dead);
      if (card) pile.push(move(s, card.id, "graveyard", "exile"));
      for (let i = 0; i < 6 && s.library.length; i++) pile.push(move(s, s.library.at(-1).id, "library", "exile"));
      for (const x of pile) x.faceDown = true;
      if (card && pile.length === 7) {
        for (let i = pile.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pile[i], pile[j]] = [pile[j], pile[i]]; }
        for (const x of pile) move(s, x.id, "exile", "library");
      }
      return true;
    }
    case "ext-honey-empty": if (source && !s.battlefield.some(x => isType(x, "Creature"))) move(s, source.id, "battlefield", "graveyard", "effect-sacrifice"); return true;
    case "ext-honey": {
      const creatures = s.battlefield.filter(x => isType(x, "Creature")), min = Math.min(...creatures.map(x => Number(goldfishCharacteristics(s, x).power)));
      const lowest = creatures.filter(x => Number(goldfishCharacteristics(s, x).power) === min);
      if (lowest.length === 1) { if (!goldfishKeywords(s, lowest[0]).has("indestructible")) move(s, lowest[0].id, "battlefield", "graveyard"); }
      else if (lowest.length) ask(s, c, { kind: "cards", label: "同じ最小パワーの1体を選ぶ（対象を取らない）", min: 1, max: 1, candidates: lowest.map(x => ({ ref: ref(x), label: name(x) })) });
      return true;
    }
    case "ext-nemesis":
      damage(s, c.target, op.amount);
      if (c.target?.player && !c.target.virtual) (s.rules.cannotGainLife ||= {})[c.target.player] = true;
      return true;
    case "ext-oildeep":
      if (c.target?.player === "self") ask(s, c, { kind: "cards", label: "捨てて引き直すカード（選ばずに終えてもよい）", min: 0, max: Math.min(1, s.hand.length), candidates: s.hand.map(x => ({ ref: ref(x, "hand"), label: name(x) })) });
      else (s.rules.notices ||= []).push({ text: "Oildeep Gearhulk：相手の手札の確認・交換（相手のカード内容は省略）", serial: s.rules.turnSerial });
      return true;
    case "ext-leatherhead": {
      const counters = Object.entries(source?.counters || {}).filter(([, count]) => count > 0);
      if (counters.length) ask(s, c, { kind: "buttons", label: "取り除くカウンター", options: [{ value: "none", label: "取り除かない" }, ...counters.map(([key]) => ({ value: key, label: `${key}を1個取り除く` }))] });
      return true;
    }
    default: return false;
  }
}

export function duplicateEnterAbilities(s, start, enteringCard) {
  // Saga chapters trigger from lore counters, not from the permanent entering.
  if (enteringCard && isType(enteringCard, "Saga")) return;
  const extra = live(s).filter(c => name(c) === "Elesh Norn, Mother of Machines").length;
  if (!extra) return;
  const originals = s.stack.slice(start).filter(e => e.kind === "ability");
  for (const entry of originals) for (let i = 0; i < extra; i++) s.stack.push({ ...structuredClone(entry), id: `ability-${s.rules.nextEventId++}` });
  if (s.rules.pendingChoice?.type === "order") s.rules.pendingChoice.entryIds = s.stack.slice(start).toReversed().map(e => e.id);
}
export function extensionChoose(s, c, op, a) {
  if (artifactChoose(s, c, op, a)) return true;
  if (op.op === "ext-oildeep") {
    const card = find(s, a.refs[0]);
    if (card) {
      move(s, card.id, "hand", "graveyard");
      c.steps.splice(c.step + 1, 0, draw());
    }
    return true;
  }
  if (op.op === "ext-honey") {
    const card = find(s, a.refs[0]);
    if (card && !goldfishKeywords(s, card).has("indestructible")) move(s, card.id, "battlefield", "graveyard");
    return true;
  }
  if (op.op === "ext-leatherhead") {
    const source = find(s, c.source);
    if (a.value !== "none" && source?.counters[a.value] > 0) {
      addGameCounters(s, source, a.value, -1);
      queue(s, source, "カウンターを取り除いた：相手のアーティファクト／エンチャントを破壊", [{ op: "destroy-target" }], { targetSpec: { zone: "battlefield", types: ["Artifact", "Enchantment"], opposingPermanent: true, virtualOpponent: true } });
    }
    return true;
  }
  return false;
}
