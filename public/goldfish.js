import { mergeCardMetadata } from "./card-metadata.js?v=20261020-solo6";
import { freshGoldfishRules, cloneGoldfishRules, assertGoldfishChoiceComplete, recordGoldfishCast,
  resolveGoldfishAbilityDraft, chooseGoldfishRuleDraft, resetGoldfishTurnRules, recordGoldfishEnter, isGoldfishBauble, recordGoldfishBauble, recordGoldfishUpkeep } from "./goldfish-rules.js?v=20261020-solo6";
import { resetGoldfishCardState, goldfishReference, goldfishFindObject, moveGoldfishRuleObject, cleanGoldfishAttachments, untapGoldfishObject } from "./goldfish-objects.js?v=20261020-solo6";
import { hasRuleCard, castBlockReason } from "./goldfish-constraints.js?v=20261020-solo6";
import { beginGoldfishCombatDraft, declareGoldfishAttackersDraft, resolveGoldfishCombatDraft } from "./goldfish-combat.js?v=20261020-solo6";
import { goldfishSpellProgram, validateGoldfishSpellTarget, startGoldfishSpellResolution, chooseGoldfishSpellResolution, canGoldfishAutoResolve, applyGoldfishStateActions } from "./goldfish-spells.js?v=20261020-solo6";
import { flushEngineEvents, chooseEngine, engineEndStep, engineMainStep, engineBeginningCombat, beginEngineOpening, gameLandPlayLimit } from "./goldfish-engine.js?v=20261020-solo6";
import { drawGameCards, chooseGameDraw, queueGameAbility, cardName } from "./goldfish-events.js?v=20261020-solo6";
import { continueEngineResolution } from "./goldfish-engine.js?v=20261020-solo6";
import { continueGoldfishSpellResolution } from "./goldfish-spells.js?v=20261020-solo6";
import { stepGoldfishSacrificeSequence } from "./goldfish-batch.js?v=20261020-solo6";

export const GOLDFISH_SCHEMA_VERSION = 2;
export const GOLDFISH_LANES = ["other", "creature", "land"];
export const GOLDFISH_MANA_TYPES = ["W", "U", "B", "R", "G", "C"];

export function normalizeGoldfishMana(value = {}) {
  return Object.fromEntries(GOLDFISH_MANA_TYPES.map((color) => [color, clampInteger(value?.[color], 0, 999)]));
}

const CARD_ZONES = ["library", "hand", "battlefield", "graveyard", "exile", "sideboard", "command", "stack"];
const TRACKER_LIMITS = {
  life: [-99, 999],
  poison: [0, 99],
  energy: [0, 999]
};

function clampInteger(value, minimum, maximum, fallback = 0) {
  const parsed = Number(value);
  const integer = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  return Math.max(minimum, Math.min(maximum, integer));
}

function normalizedFaces(faces) {
  return (Array.isArray(faces) ? faces : []).slice(0, 4).map((face) => ({
    name: String(face?.name || "").slice(0, 160),
    typeLine: String(face?.typeLine || "").slice(0, 240),
    oracleText: String(face?.oracleText || "").slice(0, 8000),
    manaCost: String(face?.manaCost || "").slice(0, 120),
    imageUrl: String(face?.imageUrl || "").slice(0, 1200),
    power: String(face?.power ?? "").slice(0, 12),
    toughness: String(face?.toughness ?? "").slice(0, 12),
    loyalty: String(face?.loyalty ?? "").slice(0, 12),
    colors: (face?.colors || []).filter(color => /^[WUBRG]$/.test(color))
  }));
}

function normalizedRows(rows) {
  return (rows || []).map((row) => ({
    name: String(row?.name || "").trim(),
    count: Number(row?.count),
    typeLine: String(row?.typeLine || "").slice(0, 240),
    layout: String(row?.layout || "").slice(0, 40),
    imageUrl: String(row?.imageUrl || "").slice(0, 1200),
    oracleText: String(row?.oracleText || "").slice(0, 8000),
    manaCost: String(row?.manaCost || "").slice(0, 120),
    power: String(row?.power ?? "").slice(0, 12),
    toughness: String(row?.toughness ?? "").slice(0, 12),
    loyalty: String(row?.loyalty ?? "").slice(0, 12),
    colors: (row?.colors || []).filter(color => /^[WUBRG]$/.test(color)),
    faces: normalizedFaces(row?.faces)
  })).filter((row) => row.name && Number.isInteger(row.count) && row.count > 0 && row.count <= 250);
}

function normalizedCounterMap(counters) {
  const normalized = {};
  if (!counters || typeof counters !== "object" || Array.isArray(counters)) return normalized;
  for (const [rawName, rawValue] of Object.entries(counters).slice(0, 24)) {
    const name = String(rawName || "").trim().slice(0, 40);
    const value = clampInteger(rawValue, -999, 999);
    if (name && value) normalized[name] = value;
  }
  return normalized;
}

export function defaultGoldfishLane(typeLine, name = "") {
  const type = String(typeLine || "");
  const cardName = String(name || "");
  if (/\bLand\b/i.test(type) || /^(?:Snow-Covered )?(?:Plains|Island|Swamp|Mountain|Forest|Wastes)$/i.test(cardName)) return "land";
  if (/\bCreature\b/i.test(type) || /Token Creature/i.test(type)) return "creature";
  return "other";
}

function makeCard(row, id, kind = "card") {
  return {
    id,
    name: row.name,
    typeLine: row.typeLine || "",
    layout: row.layout || "",
    imageUrl: row.imageUrl || "",
    oracleText: row.oracleText || "",
    manaCost: row.manaCost || "",
    power: row.power || "",
    toughness: row.toughness || "",
    loyalty: row.loyalty || "",
    colors: row.colors || [],
    faces: normalizedFaces(row.faces),
    faceIndex: 0,
    faceDown: false,
    tapped: false,
    lane: defaultGoldfishLane(row.typeLine, row.name),
    counters: {},
    powerOverride: "",
    toughnessOverride: "",
    note: "",
    groupId: "",
    incarnation: 0,
    temporaryEffects: [],
    attachedTo: null,
    kind
  };
}

function expandDeck(rows, prefix = "card") {
  const cards = [];
  for (const row of normalizedRows(rows)) {
    for (let copy = 0; copy < row.count; copy += 1) {
      cards.push(makeCard(row, `${prefix}-${cards.length + 1}`));
    }
  }
  return cards;
}

function cloneCard(card) {
  return {
    ...card,
    faces: normalizedFaces(card.faces),
    counters: normalizedCounterMap(card.counters),
    incarnation: clampInteger(card.incarnation, 0, 1_000_000),
    temporaryEffects: structuredClone(card.temporaryEffects || []),
    attachedTo: card.attachedTo ? { ...card.attachedTo } : null,
    ...(card.cast ? { cast: structuredClone(card.cast) } : {}),
    ...(card.playPermission ? { playPermission: { ...card.playPermission } } : {}),
    ...(card.ability ? { ability: structuredClone(card.ability) } : {})
  };
}

export function shuffleCards(cards, random = Math.random) {
  const shuffled = cards.map((card) => ({ ...cloneCard(card), tapped: false }));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.max(0, Math.min(0.999999999, random())) * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function drawFromLibrary(state, count) {
  if (state.phase === "playing") { drawGameCards(state, count); return; }
  for (let drawn = 0; drawn < count && state.library.length; drawn += 1) {
    state.hand.push(state.library.pop());
  }
}

function playerState(value, fallbackLife = 20) {
  return {
    life: clampInteger(value?.life, -99, 999, fallbackLife),
    poison: clampInteger(value?.poison, 0, 99),
    energy: clampInteger(value?.energy, 0, 999)
  };
}

export function createGoldfishGame(deckRows, {
  sideboardRows = [],
  onThePlay = true,
  startingLife = 20,
  registeredDeck = null,
  random = Math.random
} = {}) {
  const rows = normalizedRows(deckRows);
  const normalizedSideboard = normalizedRows(sideboardRows);
  const library = shuffleCards(expandDeck(rows), random);
  if (library.length < 7) throw new Error("ひとり回しには7枚以上のメインデッキが必要です。");
  const self = playerState({ life: startingLife }, startingLife);
  const state = {
    schemaVersion: GOLDFISH_SCHEMA_VERSION,
    deckRows: rows,
    sideboardRows: normalizedSideboard,
    registeredDeck: { main: normalizedRows(registeredDeck?.main || rows), side: normalizedRows(registeredDeck?.side || normalizedSideboard) },
    onThePlay: Boolean(onThePlay),
    library,
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    sideboard: expandDeck(normalizedSideboard, "side"),
    command: [],
    stack: [],
    rules: freshGoldfishRules(),
    manaPool: normalizeGoldfishMana(),
    players: {
      self,
      opponent: playerState({ life: startingLife }, startingLife)
    },
    // Kept as a compatibility alias for older saves and callers.
    life: self.life,
    turn: 0,
    mulligans: 0,
    bottomRequired: 0,
    phase: "opening",
    nextId: library.length + normalizedSideboard.reduce((sum, row) => sum + row.count, 0) + 1,
    nextGroupId: 1
  };
  drawFromLibrary(state, 7);
  return state;
}

export function cloneGoldfishState(state) {
  const next = {
    ...state,
    schemaVersion: GOLDFISH_SCHEMA_VERSION,
    deckRows: normalizedRows(state.deckRows),
    sideboardRows: normalizedRows(state.sideboardRows),
    registeredDeck: { main: normalizedRows(state.registeredDeck?.main || state.deckRows), side: normalizedRows(state.registeredDeck?.side || state.sideboardRows) },
    manaPool: normalizeGoldfishMana(state.manaPool),
    rules: cloneGoldfishRules(state),
    players: {
      self: playerState(state.players?.self || { life: state.life }, 20),
      opponent: playerState(state.players?.opponent, 20)
    }
  };
  next.life = next.players.self.life;
  for (const zone of CARD_ZONES) next[zone] = (state[zone] || []).map(cloneCard);
  next.nextId = clampInteger(state.nextId, 1, 1_000_000, CARD_ZONES.reduce((sum, zone) => sum + next[zone].length, 0) + 1);
  next.nextGroupId = clampInteger(state.nextGroupId, 1, 1_000_000, 1);
  return next;
}

export function restoreGoldfishGame(value, { metadata = [] } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("保存データが不正です。");
  const next = cloneGoldfishState(value);
  if (!next.deckRows.length || CARD_ZONES.reduce((sum, zone) => sum + next[zone].filter((card) => !["token", "copy", "ability"].includes(card.kind)).length, 0) < 7) {
    throw new Error("保存データに有効なデッキがありません。");
  }
  next.phase = next.phase === "playing" ? "playing" : "opening";
  next.turn = clampInteger(next.turn, 0, 999);
  next.mulligans = clampInteger(next.mulligans, 0, 7);
  next.bottomRequired = clampInteger(next.bottomRequired, 0, 7);
  if (metadata.length) {
    next.deckRows = normalizedRows(mergeCardMetadata(next.deckRows, metadata));
    next.sideboardRows = normalizedRows(mergeCardMetadata(next.sideboardRows, metadata));
    next.registeredDeck = { main: normalizedRows(mergeCardMetadata(next.registeredDeck.main, metadata)), side: normalizedRows(mergeCardMetadata(next.registeredDeck.side, metadata)) };
    for (const zone of CARD_ZONES) {
      next[zone] = next[zone].map((card) => {
        if (["token", "ability"].includes(card.kind)) return card;
        const enriched = mergeCardMetadata([card], metadata)[0];
        // A manually placed battlefield card keeps its lane.
        if (zone !== "battlefield" && !card.typeLine) enriched.lane = defaultGoldfishLane(enriched.typeLine, enriched.name);
        return enriched;
      });
    }
  }
  return next;
}

export function mulliganGoldfish(state, random = Math.random) {
  if (state.phase !== "opening") throw new Error("キープ後はマリガンできません。");
  const mulligans = Math.min(7, state.mulligans + 1);
  const next = createGoldfishGame(state.deckRows, {
    sideboardRows: state.sideboardRows,
    registeredDeck: state.registeredDeck,
    onThePlay: state.onThePlay,
    startingLife: state.players?.self?.life || state.life || 20,
    random
  });
  next.mulligans = mulligans;
  next.bottomRequired = Math.min(mulligans, next.hand.length);
  return next;
}

export function restartGoldfishGame(state, { onThePlay = state.onThePlay, random = Math.random } = {}) {
  return createGoldfishGame(state.deckRows, { sideboardRows: state.sideboardRows, registeredDeck: state.registeredDeck, onThePlay, random });
}

export function keepGoldfishHand(state, bottomCardIds = []) {
  if (state.phase !== "opening") throw new Error("すでにキープしています。");
  const selected = [...new Set(bottomCardIds)];
  if (selected.length !== state.bottomRequired) {
    throw new Error(`手札から${state.bottomRequired}枚を選んでライブラリーの一番下へ戻してください。`);
  }
  const selectedSet = new Set(selected);
  if (selected.some((id) => !state.hand.some((card) => card.id === id))) {
    throw new Error("戻すカードは現在の手札から選んでください。");
  }

  const next = cloneGoldfishState(state);
  const bottom = next.hand.filter((card) => selectedSet.has(card.id));
  next.hand = next.hand.filter((card) => !selectedSet.has(card.id));
  next.library.unshift(...bottom.map((card) => ({ ...card, tapped: false })));
  next.bottomRequired = 0;
  next.phase = "playing";
  next.turn = 1;
  if (!beginEngineOpening(next) && !next.onThePlay) drawFromLibrary(next, 1);
  return next;
}

export function drawGoldfishCards(state, count = 1) {
  assertGoldfishChoiceComplete(state);
  if (state.phase !== "playing") throw new Error("初手をキープしてからドローしてください。");
  const next = cloneGoldfishState(state);
  const before = next.hand.length;
  drawFromLibrary(next, clampInteger(count, 1, 100, 1));
  next.rules.lastAction = next.rules.pendingChoice?.type === "engine-draw" ? "ドローか発掘を選んでください。" : `${next.hand.length - before}枚引きました。`;
  return next;
}

export function drawGoldfishCard(state) {
  return drawGoldfishCards(state, 1);
}

export function setGoldfishCardsTapped(state, cardIds, tapped) {
  assertGoldfishChoiceComplete(state);
  const selected = new Set(Array.isArray(cardIds) ? cardIds : [cardIds]);
  const next = cloneGoldfishState(state);
  let changed = 0;
  next.battlefield = next.battlefield.map((card) => {
    if (!selected.has(card.id)) return card;
    changed += 1;
    return { ...card, tapped: typeof tapped === "boolean" ? tapped : !card.tapped };
  });
  if (!changed) throw new Error("戦場のカードだけをタップできます。");
  return next;
}

export function toggleGoldfishTapped(state, cardId) {
  return setGoldfishCardsTapped(state, [cardId]);
}

export function untapGoldfishAll(state) {
  assertGoldfishChoiceComplete(state);
  const next = cloneGoldfishState(state);
  for (const card of next.battlefield) untapGoldfishObject(card);
  return next;
}

function assertTurnCanEnd(state) {
  assertGoldfishChoiceComplete(state);
  if (state.phase !== "playing") throw new Error("初手をキープしてからターンを進めてください。");
  if (state.stack?.length) throw new Error("解決待ちのカードを処理してからターンを進めてください。");
  if (state.rules.combat && state.rules.combat.stage !== "done") throw new Error("戦闘ダメージを処理してからターンを進めてください。");
}

function startNextActiveTurn(state, player) {
  // Old saves did not record entry turns. They become attackable after the
  // next own untap, rather than guessing that they have haste right now.
  for (const card of state.battlefield) if (card.enteredTurn == null) card.enteredTurn = state.turn;
  state.manaPool = normalizeGoldfishMana();
  resetGoldfishTurnRules(state);
  applyGoldfishStateActions(state);
  state.rules.activePlayer = player;
  state.rules.turnSerial += 1;
  if (player === "self") {
    state.turn += 1;
    for (const card of state.battlefield) { if (!card.exerted) untapGoldfishObject(card); delete card.exerted; }
    state.rules.pendingTurnDraw = true;
  } else state.rules.pendingOpponentDraw = true;
  recordGoldfishUpkeep(state);
  state.rules.lastAction = player === "self" ? `自分のターン${state.turn}。アンタップしました。` : "相手のターンへ進みました。";
}

function finishGoldfishTurnProgress(state) {
  flushEngineEvents(state);
  if (state.rules.pendingChoice || state.stack.length) return state;
  if (state.rules.openingComplete) { state.rules.openingComplete = false; if (state.rules.openingDraw) drawGameCards(state, 1); state.rules.openingDraw = false; }
  if (state.rules.pendingChoice) return state;
  if (state.rules.endTurnEffect) { state.rules.endTurnEffect = false; state.rules.afterEndStep = state.rules.activePlayer === "self" ? "opponent" : "self"; }
  if (state.rules.resumeCombat) { state.rules.resumeCombat = false; beginGoldfishCombatDraft(state); return state; }
  if (state.rules.afterEndStep) {
    const limit = state.rules.noMaximumHandSize ? Infinity : hasRuleCard(state, "The Ten Rings") ? 10 : 7;
    if (state.rules.activePlayer === "self" && state.hand.length > limit) {
      state.rules.pendingChoice = { type: "cleanup", kind: "cards", sourceName: "クリンナップ", label: `手札上限${limit}枚：${state.hand.length - limit}枚を捨てる`, min: state.hand.length - limit, max: state.hand.length - limit, candidates: state.hand.map(c => ({ ref: goldfishReference(c, "hand"), label: c.name })) }; return state;
    }
    const destination = state.rules.afterEndStep; delete state.rules.afterEndStep;
    const endedOwnTurn = state.rules.activePlayer === "self";
    const extra = state.rules.extraTurns > 0;
    if (extra) state.rules.extraTurns--;
    startNextActiveTurn(state, extra || !endedOwnTurn ? "self" : "opponent");
    if (destination === "self" && endedOwnTurn && !extra) state.rules.resumeNextTurn = true;
    if (state.stack.length) return state;
  }
  if (state.rules.pendingOpponentDraw) {
    state.rules.pendingOpponentDraw = false;
    if (state.rules.opponentLibrary != null) {
      if (state.rules.opponentLibrary <= 0) state.rules.opponentEmptyDraw = true;
      else state.rules.opponentLibrary--;
    }
    if (hasRuleCard(state, "The Theorist, Jace Beleren")) for (const c of state.battlefield.filter(c => cardName(c) === "The Theorist, Jace Beleren" && c.automaticAbilities !== false)) queueGameAbility(state, c, "相手のドロー・ステップ：1枚引く", [{ op: "draw", count: 1 }]);
    if (state.rules.pendingChoice || state.stack.length) return state;
  }
  if (state.rules.resumeNextTurn) {
    state.rules.resumeNextTurn = false;
    startNextActiveTurn(state, "self");
  }
  if (state.rules.pendingTurnDraw && !state.stack.length) {
    state.rules.pendingTurnDraw = false;
    const count = drawGameCards(state, 1);
    state.rules.lastAction += state.rules.pendingChoice?.type === "engine-draw" ? " ドローか発掘を選んでください。" : count ? ` 通常のドローで${count}枚引きました。` : " 山札が空です。";
    state.rules.pendingMainStep = true;
  }
  if (state.rules.pendingMainStep && !state.rules.pendingChoice && !state.stack.length) { state.rules.pendingMainStep = false; engineMainStep(state); }
  return state;
}

export function endGoldfishTurn(state) {
  assertTurnCanEnd(state);
  if (state.rules.activePlayer !== "self") throw new Error("すでに相手のターンです。");
  const next = cloneGoldfishState(state);
  engineEndStep(next); next.rules.afterEndStep = "opponent";
  return finishGoldfishTurnProgress(next);
}

export function nextGoldfishTurn(state) {
  assertTurnCanEnd(state);
  const next = cloneGoldfishState(state);
  if (next.rules.activePlayer === "self") {
    engineEndStep(next); next.rules.afterEndStep = "self";
  } else startNextActiveTurn(next, "self");
  finishGoldfishTurnProgress(next);
  return next;
}

export function beginGoldfishCombat(state) {
  const next = cloneGoldfishState(state);
  assertGoldfishChoiceComplete(next);
  if (next.stack.length || next.rules.activePlayer !== "self") throw new Error("自分のターンにスタックを解決してください。");
  if (!next.rules.beginCombatStarted) {
    next.rules.beginCombatStarted = true;
    if (engineBeginningCombat(next)) { next.rules.resumeCombat = true; return next; }
  }
  beginGoldfishCombatDraft(next); return next;
}

export function resolveGoldfishCombat(state) {
  const next = cloneGoldfishState(state); resolveGoldfishCombatDraft(next); return next;
}

export function activateGoldfishBauble(state, cardId, player) {
  assertGoldfishChoiceComplete(state);
  const card = state.battlefield.find((item) => item.id === cardId);
  if (state.phase !== "playing" || !isGoldfishBauble(card) || card.tapped) throw new Error("アンタップ状態のミシュラのガラクタを選んでください。");
  const next = cloneGoldfishState(state);
  if (player == null) {
    next.rules.pendingChoice = { type: "bauble-target", sourceName: card.name, source: goldfishReference(card) };
    return next;
  }
  if (!["self", "opponent"].includes(player)) throw new Error("対象のプレイヤーを選んでください。");
  moveGoldfishRuleObject(next, cardId, "battlefield", "graveyard");
  recordGoldfishBauble(next, card, player);
  next.rules.lastAction = `${card.name}を生け贄にして起動しました。`;
  return next;
}

function locateCards(state, cardIds) {
  const requested = [...new Set(Array.isArray(cardIds) ? cardIds : [cardIds])].filter(Boolean);
  const requestedSet = new Set(requested);
  const locations = new Map();
  for (const zone of CARD_ZONES) {
    for (const card of state[zone] || []) {
      if (requestedSet.has(card.id)) locations.set(card.id, { card, zone });
    }
  }
  if (locations.size !== requested.length) throw new Error("選択したカードが見つかりません。");
  return requested.map((id) => locations.get(id));
}

export function canDragGoldfishCard(state, zone) {
  return !state?.rules?.pendingChoice && (state?.phase === "playing" || (state?.phase === "opening" && !state.bottomRequired && zone === "hand"));
}

export function dropGoldfishCards(state, cardIds, destination, options = {}) {
  let next = state;
  if (state.phase === "opening") {
    if (state.bottomRequired) throw new Error(`手札から戻す${state.bottomRequired}枚を選び、キープしてから移動してください。`);
    const locations = locateCards(state, cardIds);
    if (!locations.length || destination !== "battlefield" || !locations.every(({ zone }) => zone === "hand")) {
      throw new Error("初手は戦場へドラッグするとキープして開始します。");
    }
    next = keepGoldfishHand(state);
  }
  return moveGoldfishCards(next, cardIds, destination, options);
}

function resetBattlefieldState(card) {
  return resetGoldfishCardState(card);
}

function insertBattlefieldLane(battlefield, cards, lane, index) {
  const targetLane = GOLDFISH_LANES.includes(lane) ? lane : "other";
  const laneCards = battlefield.filter((card) => card.lane === targetLane);
  const targetIndex = Number.isInteger(index) ? Math.max(0, Math.min(index, laneCards.length)) : laneCards.length;
  laneCards.splice(targetIndex, 0, ...cards.map((card) => ({ ...card, lane: targetLane })));
  const byLane = new Map(GOLDFISH_LANES.map((name) => [name, name === targetLane ? laneCards : battlefield.filter((card) => card.lane === name)]));
  const unknown = battlefield.filter((card) => !GOLDFISH_LANES.includes(card.lane));
  return [...unknown, ...GOLDFISH_LANES.flatMap((name) => byLane.get(name))];
}

export function moveGoldfishCards(state, cardIds, destination, { lane, index } = {}) {
  assertGoldfishChoiceComplete(state);
  const locations = locateCards(state, cardIds);
  if (locations.some(({ card }) => card.kind === "ability")) throw new Error("誘発はカードとして移動できません。スタックの操作で解決・取り除いてください。");
  const next = cloneGoldfishState(state);
  const selected = new Set(locations.map(({ card }) => card.id));
  for (const zone of CARD_ZONES) next[zone] = next[zone].filter((card) => !selected.has(card.id));

  const flashbackIds = new Set(locations.filter(({ card, zone }) => zone === "stack" && card.cast?.flashback && destination !== "stack").map(({ card }) => card.id));
  let cards = locations.map(({ card, zone }) => {
    const cloned = cloneCard(card);
    const targetZone = destination.startsWith("library") ? "library" : destination;
    if (zone !== targetZone) cloned.incarnation += 1;
    if (zone === "battlefield" && destination === "battlefield") return cloned;
    const moved = resetBattlefieldState(cloned);
    if (destination === "battlefield") moved.enteredTurn = state.turn;
    return moved;
  });
  if (flashbackIds.size) {
    next.exile.push(...cards.filter((card) => flashbackIds.has(card.id)));
    cards = cards.filter((card) => !flashbackIds.has(card.id));
  }

  if (destination === "libraryBottom") next.library.unshift(...cards);
  else if (destination === "libraryTop") next.library.push(...cards.toReversed());
  else if (destination === "libraryShuffle") next.library = shuffleCards([...next.library, ...cards]);
  else if (destination === "battlefield") {
    if (lane) {
      next.battlefield = insertBattlefieldLane(next.battlefield, cards, lane, index);
    } else {
      for (const card of cards) {
        const targetLane = GOLDFISH_LANES.includes(card.lane) ? card.lane : defaultGoldfishLane(card.typeLine, card.name);
        next.battlefield = insertBattlefieldLane(next.battlefield, [card], targetLane);
      }
    }
  } else if (CARD_ZONES.includes(destination) && destination !== "library") {
    next[destination].push(...cards);
  } else {
    throw new Error("移動先が不正です。");
  }
  // Tokens (including permanent copies) cease to exist outside the battlefield.
  // They must never become drawable library cards after a bounce/correction.
  for (const zone of CARD_ZONES) {
    if (zone !== "battlefield") next[zone] = next[zone].filter((card) => !["token", "copy"].includes(card.kind) || zone === "stack" && card.kind === "copy");
  }
  // A detached bestow Aura becomes a creature again.
  cleanGoldfishAttachments(next);
  return next;
}

export function moveGoldfishCard(state, cardId, destination, options = {}) {
  return moveGoldfishCards(state, [cardId], destination, options);
}

// All explicit casts (including manually paid costs and exile casts) converge
// here. A zone correction through moveGoldfishCards is deliberately not a cast.
function goldfishCardType(card) {
  return card.faces?.[card.faceIndex || 0]?.typeLine || String(card.typeLine || "").split(" // ")[0];
}

export function goldfishPlayDestination(card) {
  const type = goldfishCardType(card);
  if (/\bLand\b/.test(type)) return "battlefield";
  if (/\b(Creature|Artifact|Enchantment|Planeswalker|Battle|Instant|Sorcery)\b/.test(type)) return "stack";
  return null;
}

export function goldfishCastTiming(state, card) {
  if (state.rules.effectCast?.card.id === card.id && state.rules.effectCast.entryId === state.rules.automation?.entryId) return true;
  const fast = /\bInstant\b/.test(goldfishCardType(card)) || /^Flash(?:\s|$)/m.test(card.oracleText || "") || /\bSorcery\b/.test(goldfishCardType(card)) && state.rules.sorceryFlashUntil > state.rules.turnSerial;
  return fast || (!state.stack.length && !state.rules.pendingTurnDraw && !state.rules.resumeNextTurn && state.rules.activePlayer !== "opponent" && !(state.rules.combat && state.rules.combat.stage !== "done"));
}

export function playGoldfishCard(state, cardId, { target, flashback = false, ...castData } = {}) {
  assertGoldfishChoiceComplete(state);
  if (state.phase !== "playing") throw new Error("初手をキープしてからプレイしてください。");
  const card = state.hand.find((item) => item.id === cardId);
  if (!card) throw new Error("プレイするカードは手札から選んでください。");
  const destination = goldfishPlayDestination(card);
  if (!destination) throw new Error("カードタイプを確認できません。詳細操作から移動先を選んでください。");
  const type = goldfishCardType(card);
  if (!goldfishCastTiming(state, card)) throw new Error("スタックに応答するとき・相手のターン・戦闘中は、インスタントか瞬速を持つカードを選んでください。");
  if (destination === "stack" && !castData.fuse) validateGoldfishSpellTarget(state, card, target, castData);
  if (destination === "stack") { const blocked = castBlockReason(state); if (blocked) throw new Error(blocked); }
  if (destination === "battlefield") {
    if (state.rules.landsPlayed == null) throw new Error("このターンに土地をプレイした回数を設定してください。");
    if (state.rules.landsPlayed >= gameLandPlayLimit(state)) throw new Error("このターンの土地はプレイ済みです。プレイできる回数を使い切りました。");
    if (state.stack.length) throw new Error("スタックを解決してから土地をプレイしてください。");
  }
  const next = moveGoldfishCards(state, [cardId], destination, { lane: defaultGoldfishLane(type, card.name) });
  if (destination === "stack") {
    const spell = next.stack.find((item) => item.id === cardId);
    spell.cast = { target: structuredClone(target || null), flashback, ...castData };
    recordGoldfishCast(next, spell);
  } else { next.rules.landsPlayed += 1; recordGoldfishEnter(next, next.battlefield.find((item) => item.id === cardId)); applyGoldfishStateActions(next); }
  return flushEngineEvents(next);
}

function dispatchGoldfishEntries(state) {
  const refs = state.rules.entered || [];
  state.rules.entered = [];
  for (const ref of refs) {
    const card = state.battlefield.find((item) => item.id === ref.id && item.incarnation === ref.incarnation) || ref.snapshot;
    if (card) recordGoldfishEnter(state, card);
  }
  return flushEngineEvents(state);
}

export function resolveGoldfishSpell(state, { manual = false } = {}) {
  assertGoldfishChoiceComplete(state);
  if (state.phase !== "playing" || !state.stack?.length) throw new Error("解決待ちのカードがありません。");
  const card = state.stack.at(-1);
  if (card.kind === "ability") {
    const next = cloneGoldfishState(state);
    resolveGoldfishAbilityDraft(next);
    if (!next.rules.pendingChoice) applyGoldfishStateActions(next);
    return finishGoldfishTurnProgress(dispatchGoldfishEntries(next));
  }
  if (!manual && goldfishSpellProgram(card)) {
    const next = cloneGoldfishState(state);
    startGoldfishSpellResolution(next);
    if (!next.rules.pendingChoice) applyGoldfishStateActions(next);
    return finishGoldfishTurnProgress(dispatchGoldfishEntries(next));
  }
  const type = goldfishCardType(card);
  if (!goldfishPlayDestination(card)) throw new Error("カードタイプを確認できません。詳細操作から移動先を選んでください。");
  const destination = /\b(Instant|Sorcery)\b/.test(type) ? "graveyard" : "battlefield";
  const next = moveGoldfishCards(state, [card.id], destination, { lane: defaultGoldfishLane(type, card.name) });
  if (destination === "battlefield") {
    const entered = next.battlefield.find((item) => item.id === card.id);
    if (entered.kind === "copy") entered.kind = "token";
    entered.enteredSerial = next.rules.turnSerial;
    entered.warped = !!card.cast?.warp; entered.dashed = !!card.cast?.dash;
    entered.castColors = card.cast?.colorsSpent || [];
    entered.wasCast = !!card.cast;
    entered.castFrom = card.cast?.fromZone;
    entered.castManaByColor = card.cast?.manaByColor || {};
    entered.castFormat = structuredClone(card.cast?.format || {});
    entered.kumanoCounter = card.cast?.kumanoCounter;
    entered.manaSpent = card.cast?.manaSpent;
    entered.castX = card.cast?.x || 0;
    entered.delvedCards = card.cast?.delvedCards || [];
    if (card.cast?.bestow && goldfishFindObject(next, card.cast.target)) {
      entered.summonedAsBestow = true; entered.originalTypeLine = entered.typeLine;
      entered.typeLine = "Enchantment — Aura"; entered.lane = "other"; entered.attachedTo = { ...card.cast.target };
    }
    entered.evoked = !!card.cast?.evoked;
    if (card.cast?.hasteMana && card.cast.serial === next.rules.turnSerial) entered.temporaryEffects.push({ keywords: ["haste"], turn: next.turn, label: "栄光の闘技場" });
    recordGoldfishEnter(next, entered);
  }
  next.rules.lastAction = `${card.name}を${destination === "battlefield" ? "戦場" : "墓地"}へ。`;
  if (destination === "battlefield") applyGoldfishStateActions(next);
  return finishGoldfishTurnProgress(dispatchGoldfishEntries(next));
}

export function chooseGoldfishRule(state, answer) {
  let next = cloneGoldfishState(state);
  const choice = next.rules.pendingChoice;
  if (choice?.type === "cleanup") {
    if (!Array.isArray(answer.refs) || answer.refs.length !== choice.min || new Set(answer.refs.map(r => r.id)).size !== answer.refs.length || answer.refs.some(r => r.zone !== "hand" || !goldfishFindObject(next, r))) throw new Error("手札上限まで捨てるカードを選んでください。");
    next.rules.pendingChoice = null;
    for (const r of answer.refs) moveGoldfishRuleObject(next, r.id, "hand", "graveyard");
  } else if (choice?.type === "engine-draw") {
    chooseGameDraw(next, answer);
    if (!next.rules.drawing) {
      if (next.rules.automation) continueEngineResolution(next);
      else if (next.rules.resolution) continueGoldfishSpellResolution(next);
    }
  } else if (choice?.type.startsWith("engine-")) chooseEngine(next, answer);
  else if (choice?.type === "attack") declareGoldfishAttackersDraft(next, answer);
  else if (choice?.type === "bauble-target") {
    if (!goldfishFindObject(next, choice.source)) throw new Error("起動するガラクタが見つかりません。");
    next.rules.pendingChoice = null;
    if (!answer.cancel) next = activateGoldfishBauble(next, choice.source.id, answer.player);
  }
  else if (choice?.type.startsWith("spell-")) chooseGoldfishSpellResolution(next, answer);
  else chooseGoldfishRuleDraft(next, answer);
  if (!next.rules.pendingChoice) applyGoldfishStateActions(next);
  return finishGoldfishTurnProgress(dispatchGoldfishEntries(next));
}

export function advanceGoldfishGame(state, { autoOrder = true } = {}) {
  let next = cloneGoldfishState(state);
  const messages = [];
  for (let count = 0; count < 1000; count += 1) {
    if (next.rules.win) break;
    if (!next.rules.pendingChoice) applyGoldfishStateActions(next);
    finishGoldfishTurnProgress(next);
    if (!next.stack.length && !next.rules.pendingChoice && next.rules.sacrificeSequence) next = stepGoldfishSacrificeSequence(next);
    if (next.rules.pendingChoice?.type === "order" && autoOrder) {
      // This is a user preference, never a claim that every order is equivalent.
      const priority = { boost: 0, surveil: 1, cutter: 2, manual: 3 };
      const ids = [...next.rules.pendingChoice.entryIds].sort((a, b) => (priority[next.stack.find((e) => e.id === a).ability.rule] ?? 9) - (priority[next.stack.find((e) => e.id === b).ability.rule] ?? 9));
      next = chooseGoldfishRule(next, { order: ids });
    }
    if (next.rules.pendingChoice || !next.stack.length) break;
    const top = next.stack.at(-1);
    if (top.kind !== "ability" && !canGoldfishAutoResolve(top)) { messages.push(`${top.name}：カード本文の操作で効果を処理してください。`); break; }
    next = resolveGoldfishSpell(next);
    if (!next.rules.pendingChoice) messages.push(next.rules.lastAction);
  }
  if (messages.length && !next.rules.pendingChoice) next.rules.lastAction = next.rules.batchError || messages.join(" / ");
  return next;
}

export function setGoldfishLandCount(state, count) {
  assertGoldfishChoiceComplete(state);
  if (!Number.isInteger(count) || count < 0 || count > 99) throw new Error("土地の回数は0〜99で指定してください。");
  const next = cloneGoldfishState(state); next.rules.landsPlayed = count; return next;
}

export function advanceGoldfishTriggers(state) {
  const next = cloneGoldfishState(state);
  const messages = [];
  // Never auto-resolve the underlying spell or pass a required choice.
  for (let count = 0; count < 1000 && !next.rules.pendingChoice && next.stack.at(-1)?.kind === "ability"; count += 1) {
    resolveGoldfishAbilityDraft(next);
    if (!next.rules.pendingChoice) messages.push(next.rules.lastAction);
  }
  if (messages.length) next.rules.lastAction = messages.join(" / ");
  return next;
}

export function setGoldfishCastCount(state, count) {
  assertGoldfishChoiceComplete(state);
  if (!Number.isInteger(count) || count < 0 || count > 999) throw new Error("唱えた回数は0〜999で指定してください。");
  const next = cloneGoldfishState(state);
  next.rules.spellsCast = count;
  next.rules.castCountKnown = true;
  return next;
}

export function removeGoldfishStackAbility(state, id) {
  assertGoldfishChoiceComplete(state);
  if (!state.stack.some((entry) => entry.id === id && entry.kind === "ability")) throw new Error("誘発が見つかりません。");
  const next = cloneGoldfishState(state);
  next.stack = next.stack.filter((entry) => entry.id !== id);
  return finishGoldfishTurnProgress(next);
}

export function setGoldfishAutomaticAbilities(state, id, enabled) {
  assertGoldfishChoiceComplete(state);
  const next = cloneGoldfishState(state);
  const card = next.battlefield.find((item) => item.id === id);
  if (!card) throw new Error("戦場のカードを選んでください。");
  card.automaticAbilities = Boolean(enabled);
  return next;
}

export function takeGoldfishCardsFromLibrary(state, cardIds, destination, random = Math.random, options = {}) {
  const requested = [...new Set(Array.isArray(cardIds) ? cardIds : [cardIds])];
  if (requested.some((id) => !state.library.some((card) => card.id === id))) {
    throw new Error("選択したカードは山札にありません。");
  }
  if (!["hand", "battlefield", "graveyard", "exile", "command"].includes(destination)) {
    throw new Error("山札からの移動先が不正です。");
  }
  const next = moveGoldfishCards(state, requested, destination, options);
  next.library = shuffleCards(next.library, random);
  return next;
}

export function takeGoldfishCardFromLibrary(state, cardId, destination, random = Math.random, options = {}) {
  return takeGoldfishCardsFromLibrary(state, [cardId], destination, random, options);
}

export function peekGoldfishLibrary(state, count = 1) {
  const amount = clampInteger(count, 1, 100, 1);
  return state.library.slice(-amount).reverse().map(cloneCard);
}

export function moveGoldfishTopCards(state, count, destination, options = {}) {
  const cards = peekGoldfishLibrary(state, count);
  if (!cards.length) return cloneGoldfishState(state);
  return moveGoldfishCards(state, cards.map((card) => card.id), destination, options);
}

export function shuffleGoldfishLibrary(state, random = Math.random) {
  assertGoldfishChoiceComplete(state);
  const next = cloneGoldfishState(state);
  next.library = shuffleCards(next.library, random);
  return next;
}

export function setGoldfishTracker(state, player, tracker, value) {
  assertGoldfishChoiceComplete(state);
  if (!["self", "opponent"].includes(player)) throw new Error("プレイヤーが不正です。");
  if (!Object.hasOwn(TRACKER_LIMITS, tracker)) throw new Error("管理値が不正です。");
  const next = cloneGoldfishState(state);
  const [minimum, maximum] = TRACKER_LIMITS[tracker];
  next.players[player][tracker] = clampInteger(value, minimum, maximum);
  next.life = next.players.self.life;
  return next;
}

export function setGoldfishLife(state, life) {
  return setGoldfishTracker(state, "self", "life", life);
}

export function adjustGoldfishCounter(state, cardIds, counterName, delta = 1) {
  assertGoldfishChoiceComplete(state);
  const name = String(counterName || "").trim().slice(0, 40);
  if (!name) throw new Error("カウンター名を入力してください。");
  const amount = clampInteger(delta, -999, 999);
  const selected = new Set(Array.isArray(cardIds) ? cardIds : [cardIds]);
  const next = cloneGoldfishState(state);
  let changed = 0;
  next.battlefield = next.battlefield.map((card) => {
    if (!selected.has(card.id)) return card;
    const counters = { ...card.counters };
    const value = clampInteger((counters[name] || 0) + amount, -999, 999);
    if (value) counters[name] = value;
    else delete counters[name];
    changed += 1;
    return { ...card, counters };
  });
  if (!changed) throw new Error("戦場のカードを選択してください。");
  return next;
}

export function setGoldfishPowerToughness(state, cardIds, power, toughness) {
  assertGoldfishChoiceComplete(state);
  const selected = new Set(Array.isArray(cardIds) ? cardIds : [cardIds]);
  const next = cloneGoldfishState(state);
  let changed = 0;
  next.battlefield = next.battlefield.map((card) => {
    if (!selected.has(card.id)) return card;
    changed += 1;
    return {
      ...card,
      powerOverride: String(power ?? "").trim().slice(0, 12),
      toughnessOverride: String(toughness ?? "").trim().slice(0, 12)
    };
  });
  if (!changed) throw new Error("戦場のカードを選択してください。");
  return next;
}

export function setGoldfishCardNote(state, cardIds, note) {
  assertGoldfishChoiceComplete(state);
  const selected = new Set(Array.isArray(cardIds) ? cardIds : [cardIds]);
  const next = cloneGoldfishState(state);
  let changed = 0;
  next.battlefield = next.battlefield.map((card) => {
    if (!selected.has(card.id)) return card;
    changed += 1;
    return { ...card, note: String(note || "").slice(0, 240) };
  });
  if (!changed) throw new Error("戦場のカードを選択してください。");
  return next;
}

export function createGoldfishToken(state, {
  name = "トークン",
  typeLine = "Token Creature",
  power = "1",
  toughness = "1",
  imageUrl = "",
  oracleText = "",
  count = 1,
  lane
} = {}) {
  assertGoldfishChoiceComplete(state);
  if (state.phase !== "playing") throw new Error("初手をキープしてからトークンを置いてください。");
  const next = cloneGoldfishState(state);
  const amount = clampInteger(count, 1, 50, 1);
  const row = normalizedRows([{
    name: String(name || "トークン").trim() || "トークン",
    count: 1,
    typeLine,
    power,
    toughness,
    imageUrl,
    oracleText
  }])[0];
  const cards = [];
  for (let index = 0; index < amount; index += 1) {
    cards.push({ ...makeCard(row, `extra-${next.nextId++}`, "token"), enteredTurn: state.turn });
  }
  const targetLane = GOLDFISH_LANES.includes(lane) ? lane : defaultGoldfishLane(row.typeLine, row.name);
  next.battlefield = insertBattlefieldLane(next.battlefield, cards, targetLane);
  return next;
}

export function copyGoldfishCards(state, cardIds) {
  assertGoldfishChoiceComplete(state);
  const locations = locateCards(state, cardIds);
  if (locations.some(({ card }) => card.kind === "ability")) throw new Error("この操作では誘発をコピーできません。");
  const next = cloneGoldfishState(state);
  for (const { card } of locations) {
    const copy = {
      ...resetBattlefieldState(cloneCard(card)),
      id: `extra-${next.nextId++}`,
      kind: "copy",
      enteredTurn: state.turn,
      copyOf: card.id,
      lane: GOLDFISH_LANES.includes(card.lane) ? card.lane : defaultGoldfishLane(card.typeLine, card.name)
    };
    next.battlefield = insertBattlefieldLane(next.battlefield, [copy], copy.lane);
  }
  return next;
}

export function toggleGoldfishFaceDown(state, cardIds) {
  assertGoldfishChoiceComplete(state);
  const selected = new Set(Array.isArray(cardIds) ? cardIds : [cardIds]);
  const next = cloneGoldfishState(state);
  let changed = 0;
  for (const zone of ["battlefield", "exile"]) {
    next[zone] = next[zone].map((card) => {
      if (!selected.has(card.id)) return card;
      changed += 1;
      return { ...card, faceDown: !card.faceDown };
    });
  }
  if (!changed) throw new Error("戦場または追放のカードを選択してください。");
  return next;
}

export function cycleGoldfishFace(state, cardIds) {
  assertGoldfishChoiceComplete(state);
  const selected = new Set(Array.isArray(cardIds) ? cardIds : [cardIds]);
  const next = cloneGoldfishState(state);
  let changed = 0;
  for (const zone of CARD_ZONES) {
    next[zone] = next[zone].map((card) => {
      if (!selected.has(card.id) || card.faces.length < 2) return card;
      changed += 1;
      return { ...card, faceIndex: (card.faceIndex + 1) % card.faces.length, faceDown: false };
    });
  }
  if (!changed) throw new Error("別の面を持つカードを選択してください。");
  return next;
}

export function groupGoldfishCards(state, cardIds) {
  assertGoldfishChoiceComplete(state);
  const selected = new Set(Array.isArray(cardIds) ? cardIds : [cardIds]);
  if (selected.size < 2) throw new Error("グループ化するカードを2枚以上選択してください。");
  const next = cloneGoldfishState(state);
  const cards = next.battlefield.filter((card) => selected.has(card.id));
  if (cards.length !== selected.size) throw new Error("戦場のカードだけをグループ化できます。");
  const existing = new Set(cards.map((card) => card.groupId).filter(Boolean));
  const groupId = existing.size === 1 ? "" : `group-${next.nextGroupId++}`;
  next.battlefield = next.battlefield.map((card) => selected.has(card.id) ? { ...card, groupId } : card);
  return next;
}
