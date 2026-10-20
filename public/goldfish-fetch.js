import { cloneGoldfishState, moveGoldfishCards, setGoldfishCardsTapped, setGoldfishTracker, shuffleGoldfishLibrary } from "./goldfish.js?v=20261021-public30k";
import { moveGoldfishRuleObject } from "./goldfish-objects.js?v=20261021-public30k";
import { abilityBlockReason } from "./goldfish-constraints.js?v=20261021-public30k";
import { recordGoldfishEnter } from "./goldfish-rules.js?v=20261021-public30k";
import { flushEngineEvents } from "./goldfish-engine.js?v=20261021-public30k";

const basicTypes = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
const escapeRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const front = (card) => card.faces?.[0] || card;
const current = (card) => card.faces?.[card.faceIndex || 0] || card;
const typeLine = (card) => card.typeLine || (/^(?:Snow-Covered )?(?:Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(card.name) ? `Basic Land — ${card.name}` : "");

// Deliberately recognize complete, single-land abilities. Mana costs, multiple
// searches and other effects stay manual instead of silently resolving wrongly.
export function goldfishFetchRule(card) {
  if (!card || card.faceDown || !/\bLand\b/.test(typeLine(current(card)))) return null;
  const face = current(card);
  const self = `(?:this land|${escapeRegExp(face.name)})`;
  const targets = `(?:basic land|(?:${basicTypes.join("|")})(?: or (?:${basicTypes.join("|")}))?)`;
  const pattern = new RegExp(`^\\{T\\}, (?:Pay (\\d+) life, )?Sacrifice ${self}: Search your library for (?:a|an) (${targets}) card, put it onto the battlefield( tapped)?, then shuffle\\.( Then if you control four or more lands, untap that land\\.)?$`, "i");
  for (const line of String(face.oracleText || "").split(/\r?\n/)) {
    const match = line.trim().match(pattern);
    if (match) return { life: Number(match[1] || 0), basic: match[2].toLowerCase() === "basic land",
      types: basicTypes.filter((type) => new RegExp(`\\b${type}\\b`, "i").test(match[2])),
      tapped: Boolean(match[3]), untapAtFour: Boolean(match[4]), targetLabel: match[2] };
  }
  return null;
}

function fetchContext(state, sourceId) {
  const source = state.battlefield.find((card) => card.id === sourceId);
  const rule = goldfishFetchRule(source);
  if (state.phase !== "playing" || !rule) throw new Error("対応するフェッチランドを戦場で1枚選んでください。未対応の能力は山札操作で処理できます。");
  if (!/\bBasic\b/.test(typeLine(current(source))) && state.battlefield.some(c => current(c).name === "Blood Moon" && !c.faceDown && c.automaticAbilities !== false)) throw new Error("血染めの月により、この土地はフェッチ能力を失っています。");
  if (source.tapped) throw new Error("タップ中のフェッチランドは起動できません。");
  const blocked = abilityBlockReason(state, source); if (blocked) throw new Error(blocked);
  if (state.players.self.life < rule.life) throw new Error("フェッチの起動に必要なライフがありません。");
  return { source, rule };
}

export function goldfishFetchTargets(state, sourceId) {
  const { rule } = fetchContext(state, sourceId);
  return state.library.filter((card) => {
    const type = typeLine(front(card));
    return /\bLand\b/.test(type) && (rule.basic ? /\bBasic\b/.test(type)
      : rule.types.some((subtype) => type.split(/—| - /).slice(1).some((part) => new RegExp(`\\b${subtype}\\b`).test(part))));
  });
}

export function goldfishFetchEntry(state, sourceId, land) {
  const { rule } = fetchContext(state, sourceId);
  const face = front(land);
  const text = face.oracleText || "";
  const self = `(?:this land|${escapeRegExp(face.name)})`;
  const fixedTapped = new RegExp(`^${self} enters(?: the battlefield)? tapped\\.`, "im").test(text);
  const shock = /you may pay 2 life\. If you don't, (?:it|[^.]+) enters(?: the battlefield)? tapped\./i.test(text);
  const surveil = new RegExp(`When ${self} enters(?: the battlefield)?, surveil 1\\.`, "i").test(text);
  const remainingLands = state.battlefield.filter((card) => card.id !== sourceId && !card.faceDown && /\bLand\b/.test(typeLine(current(card)))).length;
  const choices = [];
  let note = "";
  if (rule.untapAtFour && remainingLands + 1 >= 4) {
    choices.push({ key: "untapped", tapped: false, life: 0, label: "戦場へ → アンタップ" });
    note = "タップインした後、土地が4枚以上になるためアンタップします。";
  } else if (rule.tapped || fixedTapped) {
    choices.push({ key: "tapped", tapped: true, life: 0, label: "タップ状態で戦場へ" });
  } else if (shock) {
    choices.push({ key: "tapped", tapped: true, life: 0, label: "タップイン（支払いなし）" });
    if (state.players.self.life - rule.life >= 2) choices.push({ key: "pay2", tapped: false, life: 2, label: "2点払ってアンタップイン" });
    else note = "フェッチの支払い後、追加の2点を払うライフがありません。";
  } else if (/enters(?: the battlefield)?[^.]*tapped/i.test(text)) {
    choices.push({ key: "tapped", tapped: true, life: 0, label: "条件を確認 → タップイン" },
      { key: "untapped", tapped: false, life: 0, label: "条件を確認 → アンタップイン" });
    note = "この土地の条件をカード本文で確認して選んでください。";
  } else {
    choices.push({ key: "untapped", tapped: false, life: 0, label: "戦場へ" });
  }
  return { choices, surveil, note };
}

// One immutable transition: canceling the UI leaves the board untouched, and
// undo restores costs, both lands and the original library order together.
export function resolveGoldfishFetch(state, sourceId, targetId, { entry, random = Math.random } = {}) {
  const { rule } = fetchContext(state, sourceId);
  const target = targetId ? goldfishFetchTargets(state, sourceId).find((card) => card.id === targetId) : null;
  if (targetId && !target) throw new Error("このフェッチで探せる土地を山札から選んでください。");
  const choice = target ? goldfishFetchEntry(state, sourceId, target).choices.find((option, index) => entry ? option.key === entry : index === 0) : null;
  if (target && !choice) throw new Error("この土地の出し方と支払えるライフを確認してください。");
  let next = cloneGoldfishState(state);
  moveGoldfishRuleObject(next, sourceId, "battlefield", "graveyard", "sacrifice");
  next = setGoldfishTracker(next, "self", "life", next.players.self.life - rule.life - (choice?.life || 0));
  if (target) {
    next = moveGoldfishCards(next, [target.id], "battlefield", { lane: "land" });
    next = setGoldfishCardsTapped(next, [target.id], choice.tapped);
  }
  next = shuffleGoldfishLibrary(next, random);
  if (target) recordGoldfishEnter(next, next.battlefield.find((card) => card.id === target.id));
  return flushEngineEvents(next);
}
