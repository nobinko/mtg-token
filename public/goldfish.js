export const GOLDFISH_SCHEMA_VERSION = 2;
export const GOLDFISH_LANES = ["other", "creature", "land"];

const CARD_ZONES = ["library", "hand", "battlefield", "graveyard", "exile", "sideboard", "command"];
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
    imageUrl: String(face?.imageUrl || "").slice(0, 1200),
    power: String(face?.power ?? "").slice(0, 12),
    toughness: String(face?.toughness ?? "").slice(0, 12)
  }));
}

function normalizedRows(rows) {
  return (rows || []).map((row) => ({
    name: String(row?.name || "").trim(),
    count: Number(row?.count),
    typeLine: String(row?.typeLine || "").slice(0, 240),
    imageUrl: String(row?.imageUrl || "").slice(0, 1200),
    oracleText: String(row?.oracleText || "").slice(0, 8000),
    manaCost: String(row?.manaCost || "").slice(0, 120),
    power: String(row?.power ?? "").slice(0, 12),
    toughness: String(row?.toughness ?? "").slice(0, 12),
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
    imageUrl: row.imageUrl || "",
    oracleText: row.oracleText || "",
    manaCost: row.manaCost || "",
    power: row.power || "",
    toughness: row.toughness || "",
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
    counters: normalizedCounterMap(card.counters)
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
    onThePlay: Boolean(onThePlay),
    library,
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    sideboard: expandDeck(normalizedSideboard, "side"),
    command: [],
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

export function restoreGoldfishGame(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("保存データが不正です。");
  const next = cloneGoldfishState(value);
  if (!next.deckRows.length || next.library.length + next.hand.length + next.battlefield.length + next.graveyard.length + next.exile.length < 7) {
    throw new Error("保存データに有効なデッキがありません。");
  }
  next.phase = next.phase === "playing" ? "playing" : "opening";
  next.turn = clampInteger(next.turn, 0, 999);
  next.mulligans = clampInteger(next.mulligans, 0, 7);
  next.bottomRequired = clampInteger(next.bottomRequired, 0, 7);
  return next;
}

export function mulliganGoldfish(state, random = Math.random) {
  if (state.phase !== "opening") throw new Error("キープ後はマリガンできません。");
  const mulligans = Math.min(7, state.mulligans + 1);
  const next = createGoldfishGame(state.deckRows, {
    sideboardRows: state.sideboardRows,
    onThePlay: state.onThePlay,
    startingLife: state.players?.self?.life || state.life || 20,
    random
  });
  next.mulligans = mulligans;
  next.bottomRequired = Math.min(mulligans, next.hand.length);
  return next;
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
  if (!next.onThePlay) drawFromLibrary(next, 1);
  return next;
}

export function drawGoldfishCards(state, count = 1) {
  if (state.phase !== "playing") throw new Error("初手をキープしてからドローしてください。");
  const next = cloneGoldfishState(state);
  drawFromLibrary(next, clampInteger(count, 1, 100, 1));
  return next;
}

export function drawGoldfishCard(state) {
  return drawGoldfishCards(state, 1);
}

export function setGoldfishCardsTapped(state, cardIds, tapped) {
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
  const next = cloneGoldfishState(state);
  next.battlefield = next.battlefield.map((card) => ({ ...card, tapped: false }));
  return next;
}

export function nextGoldfishTurn(state) {
  if (state.phase !== "playing") throw new Error("初手をキープしてからターンを進めてください。");
  const next = untapGoldfishAll(state);
  next.turn += 1;
  drawFromLibrary(next, 1);
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

function resetBattlefieldState(card) {
  return {
    ...card,
    tapped: false,
    faceDown: false,
    counters: {},
    powerOverride: "",
    toughnessOverride: "",
    note: "",
    groupId: ""
  };
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
  const locations = locateCards(state, cardIds);
  const next = cloneGoldfishState(state);
  const selected = new Set(locations.map(({ card }) => card.id));
  for (const zone of CARD_ZONES) next[zone] = next[zone].filter((card) => !selected.has(card.id));

  const cards = locations.map(({ card, zone }) => {
    const cloned = cloneCard(card);
    return zone === "battlefield" && destination === "battlefield" ? cloned : resetBattlefieldState(cloned);
  });

  if (destination === "libraryBottom") next.library.unshift(...cards);
  else if (destination === "libraryTop") next.library.push(...cards.toReversed());
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
  return next;
}

export function moveGoldfishCard(state, cardId, destination, options = {}) {
  return moveGoldfishCards(state, [cardId], destination, options);
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
  const next = cloneGoldfishState(state);
  next.library = shuffleCards(next.library, random);
  return next;
}

export function setGoldfishTracker(state, player, tracker, value) {
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
  count = 1,
  lane
} = {}) {
  if (state.phase !== "playing") throw new Error("初手をキープしてからトークンを置いてください。");
  const next = cloneGoldfishState(state);
  const amount = clampInteger(count, 1, 50, 1);
  const row = normalizedRows([{
    name: String(name || "トークン").trim() || "トークン",
    count: 1,
    typeLine,
    power,
    toughness,
    imageUrl
  }])[0];
  const cards = [];
  for (let index = 0; index < amount; index += 1) {
    cards.push(makeCard(row, `extra-${next.nextId++}`, "token"));
  }
  const targetLane = GOLDFISH_LANES.includes(lane) ? lane : defaultGoldfishLane(row.typeLine, row.name);
  next.battlefield = insertBattlefieldLane(next.battlefield, cards, targetLane);
  return next;
}

export function copyGoldfishCards(state, cardIds) {
  const locations = locateCards(state, cardIds);
  const next = cloneGoldfishState(state);
  for (const { card } of locations) {
    const copy = {
      ...resetBattlefieldState(cloneCard(card)),
      id: `extra-${next.nextId++}`,
      kind: "copy",
      copyOf: card.id,
      lane: GOLDFISH_LANES.includes(card.lane) ? card.lane : defaultGoldfishLane(card.typeLine, card.name)
    };
    next.battlefield = insertBattlefieldLane(next.battlefield, [copy], copy.lane);
  }
  return next;
}

export function toggleGoldfishFaceDown(state, cardIds) {
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
