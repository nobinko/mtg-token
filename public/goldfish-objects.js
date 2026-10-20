// Shared object lifetime rules for manual zone moves and automatic effects.
import { hasRuleCard } from "./goldfish-constraints.js?v=20261021-public30f";
import { verifiedGoldfishCard } from "./goldfish-card-programs.js?v=20261021-public30f";
export const goldfishReference = (card, zone) => ({ id: card.id, incarnation: card.incarnation || 0, ...(zone ? { zone } : {}) });
export const goldfishFindObject = (state, ref) => (state[ref?.zone || "battlefield"] || [])
  .find((card) => card.id === ref?.id && (card.incarnation || 0) === ref.incarnation);
export const sameGoldfishReference = (a, b) => a?.player || b?.player ? a?.player === b?.player : a?.id === b?.id && a?.incarnation === b?.incarnation && (a?.zone || "battlefield") === (b?.zone || "battlefield");
export function untapGoldfishObject(card) {
  if (!card.tapped) return;
  if (card.counters?.stun > 0) card.counters.stun--;
  else { card.tapped = false; delete card.netLocked; }
}
export const goldfishIsLegendary = (state, card) => /\bLegendary\b/.test((card.faces?.[card.faceIndex || 0] || card).typeLine || "") || Boolean(state.rules.ringBearer && sameGoldfishReference(state.rules.ringBearer, goldfishReference(card)));

export function resetGoldfishCardState(card) {
  if (card.copyBase) { card = { ...card, ...structuredClone(card.copyBase) }; delete card.copyBase; }
  const next = { ...card, tapped: false, faceDown: false, counters: {}, powerOverride: "", toughnessOverride: "",
    note: "", groupId: "", temporaryEffects: [], attachedTo: null, automaticAbilities: true, damage: 0 };
  delete next.cast;
  delete next.wasCast;
  delete next.castFrom;
  delete next.delvedCards;
  delete next.castManaByColor;
  delete next.playPermission;
  delete next.stageAbility;
  delete next.copyRuleName;
  delete next.copyEntryChosen;
  delete next.copiedFlying;
  delete next.permanentCopy;
  delete next.ygraFood;
  if (card.ygraType) next.typeLine = card.ygraType;
  delete next.ygraType;
  if (card.ygraFaceTypes && next.faces) {
    next.faces = structuredClone(next.faces);
    for (const [index, type] of Object.entries(card.ygraFaceTypes)) next.faces[Number(index)].typeLine = type;
  }
  delete next.ygraFaceTypes;
  delete next.trollLandAbility;
  delete next.grantedAbilityCards;
  delete next.usedAbilities;
  delete next.crimeSerial;
  delete next.netLocked;
  delete next.harnessed;
  delete next.artifactExiledOpponent;
  delete next.exerted;
  delete next.greatHallAnimated;
  for (const key of ["chosenName", "castX", "unearthed", "stationed", "addedArtifactSerial", "monumentSerial", "monumentModes", "suppressedKeywords", "suppressedBy", "lostAbilitiesOriginal", "exileOnDeathSerial", "trollAura", "castFormat", "manaSpent", "impending", "unlockedDoors", "linkedExile", "solved", "scoutSerial"]) delete next[key];
  if (card.originalTypeLine) { next.typeLine = card.originalTypeLine; delete next.originalTypeLine; }
  if (card.originalFaces) { next.faces = structuredClone(card.originalFaces); delete next.originalFaces; }
  for (const key of ["prepared", "warped", "dashed", "level", "loyaltyUsed", "enteredSerial", "enteredTurn", "earthbent", "grantedCast", "imprinted", "regeneration", "sagaChapter", "sagaAbilities", "summonedAsBestow", "boundCards", "animated", "evoked", "mobilized", "attackedSerial", "castColors", "chosenType"]) delete next[key];
  return next;
}

export function cleanGoldfishAttachments(state) {
  for (const card of state.battlefield) if (card.suppressedBy && !goldfishFindObject(state, card.suppressedBy)) { card.automaticAbilities = card.lostAbilitiesOriginal; delete card.suppressedBy; delete card.suppressedKeywords; delete card.lostAbilitiesOriginal; }
  for (const card of state.battlefield) if (card.attachedTo && !goldfishFindObject(state, card.attachedTo)) {
    card.attachedTo = null;
    if (card.summonedAsBestow) { card.typeLine = card.originalTypeLine; delete card.originalTypeLine; card.summonedAsBestow = false; card.lane = "creature"; }
  }
}

// Internal draft-only primitive. The public engine owns cloning and choice locks.
export function moveGoldfishRuleObject(state, id, from, destination, reason = "") {
  const index = state[from].findIndex((card) => card.id === id);
  if (index < 0) throw new Error("処理するカードが元の領域にありません。");
  const before = state[from][index], beforeFace = before.faces?.[before.faceIndex || 0] || before;
  if (from === "hand" && destination === "graveyard" && !reason) reason = "discard";
  const madnessCost = reason === "discard" && beforeFace.name === "Fiery Temper" && verifiedGoldfishCard(before) ? "{R}" : null;
  if (madnessCost) destination = "exile";
  if (from === "battlefield" && ["sacrifice", "effect-sacrifice"].includes(reason)) {
    state.rules.permanentsSacrificed = (state.rules.permanentsSacrificed || 0) + 1;
    if (/\bArtifact\b/.test(beforeFace.typeLine)) state.rules.artifactsSacrificed = (state.rules.artifactsSacrificed || 0) + 1;
  }
  const discardWatchers = reason === "discard" ? state.battlefield.filter(c => (c.faces?.[c.faceIndex || 0] || c).name === "Monument to Endurance").map(c => structuredClone(c)) : [];
  if (destination === "battlefield" && ["graveyard", "library"].includes(from) && /Creature/.test(beforeFace.typeLine || "") && hasRuleCard(state, "Grafdigger's Cage")) return before;
  if (destination === "graveyard" && (hasRuleCard(state, "Rest in Peace") || state.rules.gaeaWillSerial === state.rules.turnSerial)) destination = "exile";
  if (from === "battlefield" && destination === "graveyard" && (before.exileOnDeathSerial === state.rules.turnSerial || before.counters?.finality)) destination = "exile";
  const graveyardWatchers = from === "graveyard" ? state.battlefield.filter(c => (c.faces?.[c.faceIndex || 0] || c).name === "Murktide Regent" && !c.faceDown && c.automaticAbilities !== false).map(c => structuredClone(c)) : [];
  const sacrificeWatchers = reason === "sacrifice" && from === "battlefield" ? state.battlefield.filter(c => (c.faces?.[c.faceIndex || 0] || c).name === "Biotech Specialist" && !c.faceDown && c.automaticAbilities !== false).map(c => structuredClone(c)) : [];
  const original = state[from].splice(index, 1)[0];
  if (from === "battlefield" && original.unearthed && destination !== "exile" && destination !== "battlefield") destination = "exile";
  const to = destination.startsWith("library") ? "library" : destination;
  const card = resetGoldfishCardState(original);
  if (card.kind === "copy" && to === "battlefield") card.kind = "token";
  if (to === "battlefield" && from !== to) card.enteredTurn = state.turn;
  if (to === "battlefield" && from !== to) card.enteredSerial = state.rules.turnSerial;
  if (from !== to) card.incarnation = (card.incarnation || 0) + 1;
  if (!["battlefield", "stack"].includes(to)) card.faceIndex = 0;
  const actual = from === "stack" && original.cast?.flashback && to !== "exile" ? "exile" : to;
  if (!["token", "copy"].includes(card.kind) || actual === "battlefield" || (card.kind === "copy" && actual === "stack")) {
    if (destination === "libraryBottom" && actual === "library") state.library.unshift(card);
    else state[actual].push(card);
  }
  cleanGoldfishAttachments(state);
  if (from !== actual) (state.rules.events ||= []).push({ kind: "move", batch: state.rules.movementBatch ?? state.rules.nextEventId++, from, to: actual, original: structuredClone(original), card: structuredClone(card), ...(reason ? { reason } : {}), ...(madnessCost ? { madnessCost } : {}), ...(discardWatchers.length ? { discardWatchers } : {}), ...(graveyardWatchers.length ? { graveyardWatchers } : {}), ...(sacrificeWatchers.length ? { sacrificeWatchers } : {}) });
  return card;
}
