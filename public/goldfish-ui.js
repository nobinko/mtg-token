import {
  adjustGoldfishCounter,
  cloneGoldfishState,
  canDragGoldfishCard,
  copyGoldfishCards,
  createGoldfishGame,
  createGoldfishToken,
  cycleGoldfishFace,
  drawGoldfishCard,
  drawGoldfishCards,
  dropGoldfishCards,
  groupGoldfishCards,
  keepGoldfishHand,
  moveGoldfishCards,
  moveGoldfishTopCards,
  mulliganGoldfish,
  nextGoldfishTurn,
  endGoldfishTurn,
  beginGoldfishCombat,
  resolveGoldfishCombat,
  activateGoldfishBauble,
  goldfishCastTiming,
  peekGoldfishLibrary,
  goldfishPlayDestination,
  resolveGoldfishSpell,
  chooseGoldfishRule,
  advanceGoldfishGame,
  setGoldfishCastCount,
  setGoldfishLandCount,
  removeGoldfishStackAbility,
  setGoldfishAutomaticAbilities,
  restoreGoldfishGame,
  restartGoldfishGame,
  GOLDFISH_MANA_TYPES,
  setGoldfishCardNote,
  setGoldfishCardsTapped,
  setGoldfishPowerToughness,
  setGoldfishTracker,
  shuffleGoldfishLibrary,
  takeGoldfishCardsFromLibrary,
  toggleGoldfishFaceDown,
  untapGoldfishAll
} from "./goldfish.js?v=20261020-solo6";
import { goldfishCharacteristics, goldfishRuleCoverage, goldfishGraveyardTypes, isGoldfishBauble } from "./goldfish-rules.js?v=20261020-solo6";
import { gameLandPlayLimit } from "./goldfish-engine.js?v=20261020-solo6";
import { extraCastChoice } from "./goldfish-modal.js?v=20261020-solo6";
import { goldfishLandManaOptions, goldfishLandEntryOptions, goldfishManaCost, goldfishManaText, canPlayGoldfishGraveyard,
  planGoldfishPayment, planGoldfishCastPayment, goldfishCastingCost, activateGoldfishLand, setGoldfishMana, clearGoldfishMana, castGoldfishCard, chooseGoldfishCast } from "./goldfish-mana.js?v=20261020-solo6";
import { goldfishSpellProgram, goldfishSpellTargets } from "./goldfish-spells.js?v=20261020-solo6";
import { renderGoldfishSpellChoice } from "./goldfish-choice-ui.js?v=20261020-solo6";
import { goldfishCardActions, goldfishPlotReady } from "./goldfish-action-definitions.js?v=20261020-solo6";
import { activateGoldfishAction, chooseGoldfishAction, goldfishActionReason, goldfishActionPayment } from "./goldfish-actions.js?v=20261020-solo6";
import { goldfishCardOperations } from "./goldfish-effects.js?v=20261020-solo6";
import { goldfishFetchRule, goldfishFetchTargets, goldfishFetchEntry, resolveGoldfishFetch } from "./goldfish-fetch.js?v=20261020-solo6";
import { goldfishShortcut } from "./goldfish-shortcuts.js?v=20261020-solo6";
import { mergeCardMetadata } from "./card-metadata.js?v=20261020-solo6";
import { castPreparedGoldfishSpell, goldfishCombos, repeatGoldfishCombo } from "./goldfish-practice.js?v=20261020-solo6";
import { goldfishAlternativeModes, castGoldfishAlternative, chooseGoldfishAlternative } from "./goldfish-alternatives.js?v=20261020-solo6";

import { sideboardGoldfishGame, goldfishFinish } from "./goldfish-sideboard.js?v=20261020-solo6";
import { renderSideboardEditor } from "./goldfish-sideboard-ui.js?v=20261020-solo6";
import { beginGoldfishSacrificeSequence } from "./goldfish-batch.js?v=20261020-solo6";
const ZONES = ["library", "hand", "battlefield", "graveyard", "exile", "sideboard", "command", "stack"];
const ZONE_LABELS = {
  library: "山札",
  libraryTop: "山札の上",
  libraryBottom: "山札の下",
  libraryShuffle: "山札へ戻してシャッフル",
  hand: "手札",
  battlefield: "戦場",
  graveyard: "墓地",
  exile: "追放",
  sideboard: "サイドボード",
  command: "統率／相棒",
  stack: "解決待ち"
};
const LANE_LABELS = { other: "その他", creature: "クリーチャー", land: "土地" };
const MAX_TIMELINE = 60;
import { GOLDFISH_SAVE_PREFIX as SAVE_PREFIX, parseGoldfishSave, writeGoldfishSave, rememberGoldfishSession, lastGoldfishSession, deckFromGoldfishSave } from "./goldfish-storage.js?v=20261020-solo6";

function normalizeName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function scryfallImageUrl(name) {
  const params = new URLSearchParams({ format: "image", version: "normal", exact: name });
  return `https://api.scryfall.com/cards/named?${params}`;
}

function cardFace(card) {
  return card.faces?.[card.faceIndex || 0] || null;
}

function cardDisplayName(card) {
  return cardFace(card)?.name || card.name;
}

function cardImageUrl(card) {
  return cardFace(card)?.imageUrl || card.imageUrl || scryfallImageUrl(card.name);
}

function deckSignature(deck) {
  const serialized = [...(deck?.mainboard || []), { name: "//sideboard", count: 0 }, ...(deck?.sideboard || [])]
    .map((row) => `${Number(row.count) || 0}:${normalizeName(row.name)}`)
    .join("|");
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function displayTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
}

export function createGoldfishController(dialog) {
  const find = (selector) => {
    const element = dialog.querySelector(selector);
    if (!element) throw new Error(`ひとり回しUIが不足しています: ${selector}`);
    return element;
  };

  const ui = {
    title: find("#goldfish-title"),
    playDraw: find("#goldfish-play-draw"),
    message: find("#goldfish-message"),
    preview: find("#goldfish-preview"),
    selectedName: find("#goldfish-selected-name"),
    selectedDetail: find("#goldfish-selected-detail"),
    cardActions: find("#goldfish-card-actions"),
    counterTools: find("#goldfish-counter-tools"),
    counterList: find("#goldfish-counter-list"),
    power: find("#goldfish-power"),
    toughness: find("#goldfish-toughness"),
    note: find("#goldfish-card-note"),
    undo: find("#goldfish-undo"),
    redo: find("#goldfish-redo"),
    openLibrary: find("#goldfish-open-library"),
    library: find("#goldfish-library-browser"),
    libraryQuery: find("#goldfish-library-query"),
    librarySummary: find("#goldfish-library-summary"),
    libraryResults: find("#goldfish-library-results"),
    librarySearchPanel: find("#goldfish-library-search-panel"),
    libraryTopPanel: find("#goldfish-library-top-panel"),
    topCount: find("#goldfish-top-count"),
    topResults: find("#goldfish-top-results"),
    gameLog: find("#goldfish-game-log"),
    gameLogList: find("#goldfish-game-log-list"),
    shortcutHelp: find("#goldfish-shortcut-help"),
    inspector: find(".goldfish-inspector"),
    layout: find(".goldfish-layout"),
    saveStatus: find("#goldfish-save-status"),
    resume: find("#goldfish-resume"),
    randomResult: find("#goldfish-random-result")
  };

  let activeDeck = null;
  let storageKey = "";
  let state = null;
  let selectedIds = new Set();
  let primaryId = "";
  let mulliganBottomIds = new Set();
  let dragged = null;
  let libraryOpen = false;
  let libraryMode = "search";
  let librarySearch = "";
  let fetchSourceId = "";
  let surveilSourceName = "";
  let topCardIds = [];
  let topOperation = null;
  let gameLogOpen = false;
  let shortcutsOpen = false;
  let panelName = "";
  let browsedZone = "graveyard";
  let panelReturnFocus = null;
  let hoverTimer = null;
  let timeline = [];
  let timelineIndex = -1;
  let openRequestId = 0;
  let handPayments = new Map();
  let manaMode = "pool";
  let manaCardId = "";
  let costX = 0;
  let autoTriggers = true;
  let autoOrder = true;
  let rulesOrder = [];
  let focusedChoiceKey = "";

  function topCountValue() {
    const count = Math.max(1, Math.min(100, Math.trunc(Number(ui.topCount.value)) || 1));
    ui.topCount.value = String(count);
    return count;
  }

  function allLocations() {
    const result = new Map();
    if (!state) return result;
    for (const zone of ZONES) {
      for (const card of state[zone] || []) if (card.kind !== "ability") result.set(card.id, { card, zone });
    }
    return result;
  }

  function findCard(cardId) {
    return allLocations().get(cardId) || null;
  }

  function validSelectedIds() {
    const locations = allLocations();
    selectedIds = new Set([...selectedIds].filter((id) => locations.has(id)));
    if (!selectedIds.has(primaryId)) primaryId = [...selectedIds][0] || "";
    return [...selectedIds];
  }

  function timelineEntry(message) {
    return {
      at: new Date().toISOString(),
      message,
      state: cloneGoldfishState(state),
      selectedIds: validSelectedIds(),
      primaryId
    };
  }

  function writeSave(payload, manual) {
    if (!storageKey) return false;
    try {
      writeGoldfishSave(localStorage, storageKey, payload);
      rememberGoldfishSession(localStorage, storageKey, ui.title.textContent.replace(/ — ひとり回し$/, ""));
      ui.saveStatus.textContent = `${manual ? "保存" : "自動保存"} ${displayTime(payload.savedAt)}`;
      find("#goldfish-save-indicator").textContent = "保存済み";
      find("#goldfish-save-indicator").classList.remove("save-failed");
      ui.resume.disabled = false;
      return true;
    } catch (error) {
      ui.saveStatus.textContent = `保存失敗: ${error.message}`;
      find("#goldfish-save-indicator").textContent = "保存できていません：ツールを確認";
      find("#goldfish-save-indicator").classList.add("save-failed");
      return false;
    }
  }

  function saveSession(manual = false) {
    if (!state || !storageKey) return;
    const savedAt = new Date().toISOString();
    const fullPayload = {
      version: 2,
      signature: deckSignature(activeDeck),
      autoTap: find("#goldfish-auto-tap").checked,
      autoTriggers,
      autoOrder,
      savedAt,
      timelineIndex,
      timeline,
      state,
      selectedIds: validSelectedIds(),
      primaryId
    };
    if (writeSave(fullPayload, manual)) return;
    writeSave({
      version: 2,
      signature: deckSignature(activeDeck),
      autoTap: find("#goldfish-auto-tap").checked,
      autoTriggers,
      autoOrder,
      savedAt,
      timelineIndex: 0,
      timeline: [timelineEntry("保存時点")],
      state,
      selectedIds: validSelectedIds(),
      primaryId
    }, manual);
  }

  function hasSavedSession() {
    if (!storageKey) return false;
    try {
      const saved = parseGoldfishSave(localStorage.getItem(storageKey));
      return saved?.version === 2 && saved.signature === deckSignature(activeDeck) && saved.state;
    } catch {
      return false;
    }
  }

  function pushTimeline(message) {
    timeline = timeline.slice(0, timelineIndex + 1);
    timeline.push(timelineEntry(message));
    if (timeline.length > MAX_TIMELINE) timeline.shift();
    timelineIndex = timeline.length - 1;
    saveSession(false);
  }

  function commit(nextState, message, {
    select = validSelectedIds(),
    primary = primaryId,
    closeLibrary = false
  } = {}) {
    if (fetchSourceId || surveilSourceName) closeLibrary = true;
    fetchSourceId = "";
    surveilSourceName = "";
    state = nextState;
    selectedIds = new Set(select);
    primaryId = primary;
    mulliganBottomIds = new Set();
    if (closeLibrary) {
      libraryOpen = false;
      topOperation = null;
      librarySearch = "";
      topCardIds = [];
    }
    pushTimeline(message);
    render(message);
  }

  function restoreTimeline(index, message) {
    if (!timeline[index]) return;
    fetchSourceId = "";
    surveilSourceName = "";
    libraryOpen = false;
    panelName = "";
    topOperation = null;
    timelineIndex = index;
    state = cloneGoldfishState(timeline[index].state);
    selectedIds = new Set(timeline[index].selectedIds || []);
    primaryId = timeline[index].primaryId || "";
    mulliganBottomIds = new Set();
    topCardIds = [];
    saveSession(false);
    render(message || timeline[index].message);
  }

  function undo() {
    if (timelineIndex <= 0) return;
    restoreTimeline(timelineIndex - 1, "ひとつ前の操作に戻しました。");
  }

  function redo() {
    if (timelineIndex >= timeline.length - 1) return;
    restoreTimeline(timelineIndex + 1, "操作をやり直しました。");
  }

  function groupedLibrary(cards) {
    const groups = new Map();
    for (const card of cards) {
      const current = groups.get(card.name) || { name: card.name, cards: [] };
      current.cards.push(card);
      groups.set(card.name, current);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
  }

  function clearDropHighlights() {
    dragged = null;
    dialog.classList.remove("is-dragging-card");
    find(".goldfish-table-column").inert = Boolean(panelName || libraryOpen || gameLogOpen || shortcutsOpen);
    for (const element of dialog.querySelectorAll(".is-drop-ready, .is-drop-over, .is-dragging")) {
      element.classList.remove("is-drop-ready", "is-drop-over", "is-dragging");
    }
  }

  function dragIdsFor(card) {
    const selected = validSelectedIds();
    if (selectedIds.has(card.id) && selected.length > 1) return selected;
    if (card.groupId) {
      const grouped = state.battlefield.filter((item) => item.groupId === card.groupId).map((item) => item.id);
      if (grouped.length > 1) return grouped;
    }
    return [card.id];
  }

  function beginDrag(event, card, zone, { shuffleLibrary = false } = {}) {
    if (fetchSourceId || surveilSourceName || !canDragGoldfishCard(state, zone)) {
      event.preventDefault();
      return;
    }
    const cardIds = dragIdsFor(card);
    dragged = { cardIds, sourceZone: zone, shuffleLibrary };
    // Let the browser capture the drag image before hiding hit targets in the
    // source drawer, otherwise Chromium can cancel the drag at dragstart.
    requestAnimationFrame(() => { if (dragged) dialog.classList.add("is-dragging-card"); });
    // A zone/library drawer must not cover or inert the destination during drag.
    find(".goldfish-table-column").inert = false;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cardIds.join(","));
    event.currentTarget.classList.add("is-dragging");
    for (const target of dialog.querySelectorAll("[data-goldfish-drop]")) {
      if (canDropOn(target)) target.classList.add("is-drop-ready");
    }
  }

  function canDropOn(target) {
    if (topOperation && dragged?.sourceZone === "library") {
      if (topOperation.destinations && !(topOperation.destinations[target.dataset.goldfishDrop] >= dragged.cardIds.length)) return false;
      const allowed = topOperation.kind === "surveil" ? ["libraryTop", "graveyard"] : topOperation.kind === "scry" ? ["libraryTop", "libraryBottom"] : null;
      if (allowed && !allowed.includes(target.dataset.goldfishDrop)) return false;
    }
    return !fetchSourceId && !surveilSourceName && dragged && (state?.phase === "playing" || (state?.phase === "opening" && !state.bottomRequired && dragged.sourceZone === "hand" && target.dataset.goldfishDrop === "battlefield"));
  }

  function cardAriaLabel(card) {
    const parts = [cardDisplayName(card)];
    const characteristics = goldfishCharacteristics(state, card);
    if (characteristics.power !== "" && characteristics.power != null) parts.push(`${characteristics.power}/${characteristics.toughness}`, ...characteristics.notes);
    if (card.tapped) parts.push("タップ");
    if (card.faceDown) parts.push("裏向き");
    const counters = Object.entries(card.counters || {}).map(([name, value]) => `${name} ${value}`);
    if (counters.length) parts.push(counters.join("、"));
    return parts.join("、");
  }

  function appendCardBadges(surface, card) {
    const badges = document.createElement("span");
    badges.className = "goldfish-card-badges";
    if (card.kind === "token" || card.kind === "copy") {
      const badge = document.createElement("span");
      badge.className = "kind-badge";
      badge.textContent = card.kind === "copy" ? "COPY" : "TOKEN";
      badges.append(badge);
    }
    for (const [name, value] of Object.entries(card.counters || {})) {
      const badge = document.createElement("span");
      badge.textContent = `${name} ${value}`;
      badges.append(badge);
    }
    const { power, toughness, notes } = goldfishCharacteristics(state, card);
    if (power || toughness) {
      const badge = document.createElement("span");
      badge.className = "pt-badge";
      badge.textContent = `${power || "?"}/${toughness || "?"}`;
      badges.append(badge);
    }
    if (notes.length) {
      const badge = document.createElement("span");
      badge.className = "rules-badge";
      badge.textContent = notes.some((note) => note.includes("ターン終了")) ? "強化中" : notes.some((note) => note.startsWith("昂揚")) ? "昂揚" : "装着";
      badge.title = notes.join(" / ");
      badges.append(badge);
    }
    if (card.groupId) {
      const badge = document.createElement("span");
      badge.className = "group-badge";
      badge.textContent = "GROUP";
      badges.append(badge);
    }
    if (card.note) {
      const badge = document.createElement("span");
      badge.className = "note-badge";
      badge.textContent = "MEMO";
      badges.append(badge);
    }
    if (card.damage) { const badge = document.createElement("span"); badge.className = "damage-badge"; badge.textContent = `${card.damage}点ダメージ`; badges.append(badge); }
    if (card.playPermission) {
      const badge = document.createElement("span"); badge.className = "rules-badge";
      const p = card.playPermission, persistent = ["adventure", "airbend"].includes(p.kind);
      const valid = persistent || p.kind === "warp" ? persistent || p.serial < state.rules.turnSerial : p.expires != null ? p.expires >= state.rules.turnSerial : p.serial != null ? p.serial === state.rules.turnSerial : p.turn === state.turn && state.rules.activePlayer === "self";
      badge.textContent = p.kind === "plot" ? goldfishPlotReady(state, card) ? "計画済み・0マナ" : "計画済み" : p.kind === "airbend" ? "{2}で唱えられる" : p.kind === "adventure" ? "出来事から唱えられる" : p.kind === "warp" ? valid ? "ワープから唱えられる" : "次ターンから使用可" : valid ? "追放から使用可" : "期限終了"; badges.append(badge);
    }
    if (badges.childElementCount) surface.append(badges);
  }

  function createCardButton(card, zone, {
    visual = false,
    lazy = false,
    shuffleLibrary = false,
    position = 0
  } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "goldfish-card-chip";
    button.dataset.cardId = card.id;
    button.dataset.cardZone = zone;
    button.dataset.cardPosition = String(position);
    if (zone === "hand") {
      const offset = position - (state.hand.length - 1) / 2;
      button.style.setProperty("--hand-angle", `${Math.max(-6, Math.min(6, offset * 1.4))}deg`);
      button.style.setProperty("--hand-offset", `${Math.min(14, Math.abs(offset) * 2)}px`);
      const payment = handPayments.get(card.id);
      if (payment?.payable) {
        button.classList.add("is-affordable");
        button.dataset.manaReady = "true";
      }
    }
    if (zone === "exile" && goldfishPlotReady(state, card)) button.classList.add("is-affordable");
    button.draggable = !fetchSourceId && !surveilSourceName && canDragGoldfishCard(state, zone);
    if (button.draggable) button.classList.add("is-draggable");
    if (visual) button.classList.add("goldfish-card-visual");
    if (card.tapped) button.classList.add("is-tapped");
    if (card.faceDown) button.classList.add("is-face-down");
    if (selectedIds.has(card.id)) button.classList.add("is-selected");
    if (mulliganBottomIds.has(card.id)) button.classList.add("is-bottom-choice");
    if (card.groupId) button.dataset.groupId = card.groupId;
    const manaHint = zone === "hand" && handPayments.get(card.id)?.payable ? `、マナ支払い可${goldfishManaCost(card).includes("{X}") ? "（X=0）" : ""}` : "";
    button.setAttribute("aria-label", cardAriaLabel(card) + manaHint);
    if (zone === "hand" && state?.phase === "opening" && state.bottomRequired > 0) {
      button.setAttribute("aria-pressed", String(mulliganBottomIds.has(card.id)));
    }

    if (visual) {
      const surface = document.createElement("span");
      surface.className = "goldfish-card-surface";
      if (card.faceDown) {
        const back = document.createElement("span");
        back.className = "goldfish-card-back";
        back.textContent = "MAGIC";
        surface.append(back);
      } else if (card.kind === "token" && card.name === "Monk" && !card.imageUrl) {
        const token = document.createElement("span");
        token.className = "goldfish-monk-face";
        token.textContent = "✧\nMONK\n白 · 果敢";
        surface.append(token);
      } else {
        const image = document.createElement("img");
        image.draggable = false;
        image.src = cardImageUrl(card);
        image.alt = "";
        image.loading = lazy ? "lazy" : "eager";
        image.decoding = "async";
        image.addEventListener("error", () => {
          if (!image.dataset.fallback && card.imageUrl) {
            image.dataset.fallback = "1";
            image.src = scryfallImageUrl(card.name);
            return;
          }
          image.hidden = true;
          button.classList.add("image-unavailable");
        });
        surface.append(image);
      }
      const caption = document.createElement("span");
      caption.className = "goldfish-card-caption";
      caption.textContent = cardDisplayName(card);
      surface.append(caption);
      if (zone === "hand" && position < 9) {
        const shortcut = document.createElement("kbd");
        shortcut.className = "goldfish-hand-key";
        shortcut.textContent = String(position + 1);
        button.setAttribute("aria-keyshortcuts", String(position + 1));
        surface.append(shortcut);
      }
      appendCardBadges(surface, card);
      button.append(surface);
    } else {
      button.textContent = cardDisplayName(card);
    }

    button.title = button.draggable
      ? `${cardAriaLabel(card)}${manaHint} — ${zone === "hand" ? "ダブルクリックでプレイ／" : zone === "battlefield" ? goldfishCardActions(card).some((item) => item.id === "equip") ? "ダブルクリックで装備／" : "ダブルクリックでマナ・タップ／" : ""}右クリックで詳細`
      : cardAriaLabel(card);
    button.addEventListener("click", (event) => selectCard(card, zone, event));
    button.addEventListener("dblclick", (event) => {
      event.preventDefault();
      if (state.phase !== "playing" || !["hand", "battlefield"].includes(zone)) return;
      if (!selectedIds.has(card.id)) {
        selectedIds = new Set([card.id]);
        primaryId = card.id;
      }
      if (zone === "hand") performCardAction("play");
      else if (zone === "exile" && card.playPermission?.kind === "plot") performCardAction("exile-play");
      else if (zone === "battlefield" && goldfishCardActions(card).some((item) => item.id === "equip")) performCardAction("ability:equip");
      else if (isGoldfishBauble(card)) performCardAction("bauble");
      else toggleSelectedTapped();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!selectedIds.has(card.id)) {
        selectedIds = new Set([card.id]);
        primaryId = card.id;
      }
      showPanel("inspector");
    });
    button.addEventListener("dragstart", (event) => beginDrag(event, card, zone, { shuffleLibrary }));
    button.addEventListener("dragend", () => { clearDropHighlights(); renderPanels(); });
    button.addEventListener("mouseenter", () => {
      hideHoverPreview();
      if (card.faceDown || (card.kind === "token" && !card.imageUrl) || panelName || libraryOpen || gameLogOpen || shortcutsOpen || dragged) return;
      hoverTimer = setTimeout(() => {
        const preview = find("#goldfish-hover-preview");
        preview.querySelector("img").src = cardImageUrl(card);
        preview.querySelector("span").textContent = cardDisplayName(card);
        preview.classList.toggle("is-left", button.getBoundingClientRect().left > dialog.clientWidth / 2);
        preview.hidden = false;
      }, 300);
    });
    button.addEventListener("mouseleave", hideHoverPreview);
    button.addEventListener("dragstart", hideHoverPreview);
    return button;
  }

  function hideHoverPreview() {
    clearTimeout(hoverTimer);
    find("#goldfish-hover-preview").hidden = true;
  }

  function selectCard(card, zone, event = {}) {
    primaryId = card.id;
    if (state.phase === "opening" && zone === "hand" && state.bottomRequired > 0) {
      if (mulliganBottomIds.has(card.id)) mulliganBottomIds.delete(card.id);
      else if (mulliganBottomIds.size < state.bottomRequired) mulliganBottomIds.add(card.id);
      else {
        render(`戻すカードは${state.bottomRequired}枚です。別のカードを外してから選んでください。`);
        return;
      }
      selectedIds = new Set([card.id]);
      render();
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      if (selectedIds.has(card.id)) selectedIds.delete(card.id);
      else selectedIds.add(card.id);
      if (!selectedIds.size) primaryId = "";
    } else {
      selectedIds = new Set([card.id]);
    }
    // Preserve the clicked DOM node: replacing it here swallowed dblclick and
    // keyboard focus before the browser could dispatch the next event.
    renderSelection();
  }

  function renderSelection() {
    const ids = validSelectedIds();
    for (const button of dialog.querySelectorAll("[data-card-id]")) {
      button.classList.toggle("is-selected", ids.includes(button.dataset.cardId));
    }
    renderInspector(state.phase === "opening");
    renderContext();
  }

  function renderZone(containerId, countId, cards, zone, { visual = false } = {}) {
    const container = find(`#${containerId}`);
    find(`#${countId}`).textContent = String(cards.length);
    container.replaceChildren();
    if (!cards.length) {
      const empty = document.createElement("span");
      empty.className = "goldfish-empty";
      empty.textContent = "ここへドロップ";
      container.append(empty);
      return;
    }
    cards.forEach((card, position) => container.append(createCardButton(card, zone, { visual, position })));
  }

  function renderBattlefield() {
    const lanes = {
      other: state.battlefield.filter((card) => card.lane === "other"),
      creature: state.battlefield.filter((card) => card.lane === "creature"),
      land: state.battlefield.filter((card) => card.lane === "land")
    };
    find("#goldfish-battlefield-count").textContent = String(state.battlefield.length);
    renderZone("goldfish-battlefield-other", "goldfish-other-count", lanes.other, "battlefield", { visual: true });
    renderZone("goldfish-battlefield-creature", "goldfish-creature-count", lanes.creature, "battlefield", { visual: true });
    renderZone("goldfish-battlefield-land", "goldfish-land-count", lanes.land, "battlefield", { visual: true });
    for (const [lane, cards] of Object.entries(lanes)) {
      const zone = find(`#goldfish-battlefield-${lane}`);
      zone.style.setProperty("--lane-count", String(Math.max(1, cards.length)));
      zone.parentElement.classList.toggle("is-empty-lane", !cards.length);
    }
  }

  function makeLibraryResult(group, { shuffleLibrary }) {
    const card = group.cards[0];
    const row = document.createElement("article");
    row.className = "goldfish-library-result";
    const cardButton = createCardButton(card, "library", { visual: true, lazy: true, shuffleLibrary });
    cardButton.classList.add("goldfish-library-card");
    const detail = document.createElement("div");
    detail.className = "goldfish-library-result-detail";
    const heading = document.createElement("h4");
    heading.textContent = group.name;
    const count = document.createElement("p");
    count.textContent = `${group.cards.length}枚`;
    const actions = document.createElement("div");
    actions.className = "goldfish-library-result-actions";
    if (fetchSourceId) {
      const entry = goldfishFetchEntry(state, fetchSourceId, card);
      for (const choice of entry.choices) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = choice.label;
        button.addEventListener("click", () => finishFetch(card.id, choice.key));
        actions.append(button);
      }
      count.textContent += [entry.note, entry.surveil ? "続けて諜報1を選びます。" : ""].filter(Boolean).map((text) => ` ／ ${text}`).join("");
      detail.append(heading, count, actions);
      row.append(cardButton, detail);
      return row;
    }
    const destinations = shuffleLibrary
      ? [["battlefield", "戦場"], ["hand", "手札"], ["graveyard", "墓地"], ["exile", "追放"]]
      : surveilSourceName || topOperation?.kind === "surveil" ? [["libraryTop", "上に残す"], ["graveyard", "墓地へ"]]
        : topOperation?.kind === "scry" ? [["libraryTop", "上に残す"], ["libraryBottom", "下へ"]]
        : [["hand", "手札"], ["battlefield", "戦場"], ["graveyard", "墓地"], ["exile", "追放"], ["libraryTop", "上"], ["libraryBottom", "下"]];
    for (const [destination, label] of destinations) {
      if (topOperation?.destinations && !topOperation.destinations[destination]) continue;
      const moveButton = document.createElement("button");
      moveButton.type = "button";
      moveButton.textContent = label;
      moveButton.addEventListener("click", () => {
        try {
          moveThroughUi([card.id], destination, { shuffleLibrary });
        } catch (error) {
          render(error.message);
        }
      });
      actions.append(moveButton);
    }
    detail.append(heading, count, actions);
    row.append(cardButton, detail);
    return row;
  }

  function renderLibrary() {
    ui.openLibrary.setAttribute("aria-expanded", String(libraryOpen));
    ui.library.classList.toggle("is-guided", Boolean(fetchSourceId || surveilSourceName));
    find("#goldfish-library-title").textContent = fetchSourceId ? "フェッチ先を選ぶ" : surveilSourceName ? "諜報1" : topOperation ? topOperation.label : "山札操作";
    find("#goldfish-library-caption").textContent = fetchSourceId ? findCard(fetchSourceId)?.card.name || "フェッチ" : surveilSourceName || topOperation?.name || "サーチ・ドロー・山札の上を見る";
    find("#goldfish-close-library").textContent = fetchSourceId ? "キャンセル" : "閉じる";
    find(".goldfish-library-tabs").hidden = Boolean(fetchSourceId || surveilSourceName || topOperation);
    find(".goldfish-library-footer").hidden = Boolean(fetchSourceId || surveilSourceName || topOperation);
    find(".goldfish-top-controls").hidden = Boolean(surveilSourceName || topOperation);
    find("#goldfish-top-hint").textContent = surveilSourceName ? "シャッフル後の一番上です。上に残すか、墓地へ置いてください。" : topOperation?.kind === "surveil" ? "墓地へ送るか、上に残すかを選びます。複数枚を上に残す場合、最後に選んだカードが一番上です。" : topOperation?.kind === "scry" ? "下へ送るか、上に残すかを選びます。複数枚を上に残す場合、最後に選んだカードが一番上です。" : "見るだけでは順番を変えません。表示したカードを山札の上／下や各ゾーンへドラッグできます。";
    if (topOperation?.destinations) find("#goldfish-top-hint").textContent = `あと ${Object.entries(topOperation.destinations).filter(([, count]) => count).map(([zone, count]) => `${ZONE_LABELS[zone]}へ${count}枚`).join("・") || "0枚"}。カードを1枚ずつ振り分けます。`;
    find("#goldfish-fetch-fail").hidden = !fetchSourceId;
    const rule = fetchSourceId ? goldfishFetchRule(findCard(fetchSourceId)?.card) : null;
    find("#goldfish-library-hint").textContent = rule
      ? `探せる土地: ${rule.targetLabel}。確定すると元の土地を生け贄にし、${rule.life ? `ライフ${rule.life}点を払い、` : ""}取得後にシャッフルします。Escでキャンセル。対応済みの登場・離脱誘発と墓地への置換も反映します。`
      : "ここから移動すると山札を自動でシャッフルします。フェッチは戦場の土地を選んでFでも起動できます。";
    for (const tab of dialog.querySelectorAll("[data-goldfish-library-mode]")) {
      tab.setAttribute("aria-selected", String(tab.dataset.goldfishLibraryMode === libraryMode));
    }
    ui.librarySearchPanel.hidden = libraryMode !== "search";
    ui.libraryTopPanel.hidden = libraryMode !== "top";
    if (!libraryOpen) return;

    if (libraryMode === "search") {
      if (ui.libraryQuery.value !== librarySearch) ui.libraryQuery.value = librarySearch;
      const groups = groupedLibrary(fetchSourceId ? goldfishFetchTargets(state, fetchSourceId) : state.library);
      const query = librarySearch.trim().toLocaleLowerCase();
      const visible = query ? groups.filter((group) => group.name.toLocaleLowerCase().includes(query)) : groups;
      ui.librarySummary.textContent = `${fetchSourceId ? "取得可能な土地" : `山札 ${state.library.length}枚`} / ${groups.length}種類` + (query ? ` — ${visible.length}種類に絞り込み` : "");
      ui.libraryResults.replaceChildren();
      if (!visible.length) {
        const empty = document.createElement("p");
        empty.className = "goldfish-library-empty";
        empty.textContent = "一致するカードがありません。";
        ui.libraryResults.append(empty);
      } else {
        for (const group of visible) ui.libraryResults.append(makeLibraryResult(group, { shuffleLibrary: true }));
      }
      return;
    }

    const available = new Map(state.library.map((card) => [card.id, card]));
    topCardIds = topCardIds.filter((id) => available.has(id));
    ui.topResults.replaceChildren();
    const cards = topCardIds.map((id) => available.get(id));
    if (!cards.length) {
      const empty = document.createElement("p");
      empty.className = "goldfish-library-empty";
      empty.textContent = topOperation ? "カードの振り分けが終わりました。" : "「見る」で山札の上を表示します。";
      ui.topResults.append(empty);
      if (topOperation) {
        const back = document.createElement("button"); back.type = "button"; back.textContent = "続きのカード本文の操作へ";
        const sourceId = topOperation.cardId;
        back.addEventListener("click", () => openManaPanel("effects", sourceId)); ui.topResults.append(back);
      }
    } else {
      cards.forEach((card, index) => ui.topResults.append(makeLibraryResult({ name: `${index + 1}. ${card.name}`, cards: [card] }, { shuffleLibrary: false })));
    }
  }

  function renderGameLog() {
    ui.gameLogList.replaceChildren();
    timeline.forEach((entry, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "goldfish-log-entry";
      if (index === timelineIndex) button.classList.add("is-current");
      button.setAttribute("aria-current", index === timelineIndex ? "step" : "false");
      const turn = entry.state?.turn ? `T${entry.state.turn}` : "初手";
      button.textContent = `${index + 1}. ${turn} ${displayTime(entry.at)} — ${entry.message}`;
      button.addEventListener("click", () => restoreTimeline(index, `履歴${index + 1}の盤面を表示しています。次の操作でここから分岐します。`));
      item.append(button);
      ui.gameLogList.append(item);
    });
  }

  function renderPanels() {
    if (state && (state.rules.pendingChoice || !state.rules.castCountKnown)) {
      panelName = "rules";
      libraryOpen = false; gameLogOpen = false; shortcutsOpen = false;
      fetchSourceId = ""; surveilSourceName = "";
    }
    ui.library.hidden = !libraryOpen;
    ui.gameLog.hidden = !gameLogOpen;
    ui.shortcutHelp.hidden = !shortcutsOpen;
    const otherPanel = libraryOpen || gameLogOpen || shortcutsOpen;
    ui.inspector.hidden = otherPanel || panelName !== "inspector";
    find("#goldfish-zones-browser").hidden = otherPanel || panelName !== "zones";
    find("#goldfish-tools").hidden = otherPanel || panelName !== "tools";
    find("#goldfish-mana-panel").hidden = otherPanel || panelName !== "mana";
    find("#goldfish-rules-panel").hidden = otherPanel || panelName !== "rules";
    find("#goldfish-sideboard-panel").hidden = otherPanel || panelName !== "sideboard";
    find("#goldfish-panel-shade").hidden = !otherPanel && !panelName;
    find(".goldfish-table-column").inert = Boolean(otherPanel || panelName);
    ui.layout.classList.toggle("is-side-panel-open", Boolean(otherPanel || panelName));
    find("#goldfish-tools-toggle").setAttribute("aria-expanded", String(panelName === "tools" && !otherPanel));
    for (const section of dialog.querySelectorAll("[data-goldfish-zone-section]")) section.hidden = section.dataset.goldfishZoneSection !== browsedZone;
    for (const button of dialog.querySelectorAll("[data-goldfish-open-zone]")) button.setAttribute("aria-pressed", String(panelName === "zones" && button.dataset.goldfishOpenZone === browsedZone));
    find("#goldfish-toggle-game-log").setAttribute("aria-expanded", String(gameLogOpen));
    find("#goldfish-shortcuts").setAttribute("aria-expanded", String(shortcutsOpen));
    renderLibrary();
    if (gameLogOpen) renderGameLog();
    if (panelName === "rules") renderRulesPanel();
  }

  function showPanel(name = "", zone = browsedZone) {
    if (!state || dialog.classList.contains("is-loading-goldfish")) return;
    hideHoverPreview();
    if (name && !panelName && !libraryOpen && !gameLogOpen && !shortcutsOpen) panelReturnFocus = document.activeElement;
    panelName = name;
    topOperation = null;
    browsedZone = zone;
    libraryOpen = false;
    gameLogOpen = false;
    shortcutsOpen = false;
    fetchSourceId = "";
    surveilSourceName = "";
    renderPanels();
    renderSelection();
    if (name) {
      const panel = name === "inspector" ? ui.inspector : find(name === "sideboard" ? "#goldfish-sideboard-panel" : name === "tools" ? "#goldfish-tools" : name === "mana" ? "#goldfish-mana-panel" : name === "rules" ? "#goldfish-rules-panel" : "#goldfish-zones-browser");
      panel.querySelector("button")?.focus();
    } else if (panelReturnFocus?.isConnected && !panelReturnFocus.closest("[hidden]")) panelReturnFocus.focus();
    else find("#goldfish-tools-toggle").focus();
  }

  function renderContext() {
    const selected = validSelectedIds().map((id) => findCard(id));
    const primary = findCard(primaryId);
    const actions = [];
    if (primary) {
      find("#goldfish-context-name").textContent = selected.length > 1 ? `${selected.length}枚を選択中` : cardDisplayName(primary.card);
      if (state.phase === "playing") {
        if (selected.length === 1 && primary.zone === "hand") {
          actions.push([goldfishPlayDestination(primary.card) === "battlefield" ? "土地を出す ↵" : "唱える ↵", "play", !goldfishPlayDestination(primary.card)]);
        } else if (selected.every(({ zone }) => zone === "battlefield")) {
          const produces = selected.length === 1 && goldfishLandManaOptions(primary.card, state).length;
          actions.push([primary.card.tapped ? "アンタップ T" : produces ? "マナを出す T" : "タップ T", "tap"]);
          const rule = selected.length === 1 && goldfishFetchRule(primary.card);
          if (selected.length === 1 && isGoldfishBauble(primary.card)) actions.unshift(["ガラクタを起動", "bauble", primary.card.tapped]);
          if (rule) actions.push(["フェッチ F", "fetch", primary.card.tapped || state.players.self.life < rule.life]);
          else actions.push(["墓地へ G", "graveyard"]);
        } else if (primary.zone !== "stack") {
          actions.push(["手札へ H", "hand"], ["戦場へ B", "battlefield"]);
          if (selected.length === 1 && primary.zone === "exile" && goldfishPlayDestination(primary.card)) actions.unshift([primary.card.playPermission?.kind === "plot" ? "計画から0マナで唱える" : "追放からプレイ", "exile-play", primary.card.playPermission?.kind === "plot" && !goldfishPlotReady(state, primary.card)]);
          if (selected.length === 1 && primary.zone === "graveyard" && canPlayGoldfishGraveyard(state, primary.card)) actions.unshift([goldfishPlayDestination(primary.card) === "battlefield" ? "墓地から土地をプレイ" : goldfishSpellProgram(primary.card)?.harmonize ? "調和で唱える" : "墓地から唱える", "flashback"]);
          if (selected.length === 1 && primary.zone === "sideboard" && state.rules.wish === state.rules.turnSerial) actions.unshift(["願いから唱える", "wish-play"]);
        }
        if (selected.length === 1) for (const ability of goldfishCardActions(primary.card).filter((item) => item.zone === primary.zone)) {
          const reason = goldfishActionReason(state, primary.card, ability) || (!goldfishActionPayment(state, primary.card, ability, { autoTap: find("#goldfish-auto-tap").checked }).payable ? "マナ不足" : "");
          actions.unshift([ability.label, `ability:${ability.id}`, Boolean(reason), reason]);
        }
        if (selected.length === 1 && primary.zone === "battlefield" && primary.card.prepared) actions.unshift(["準備呪文を唱える", "prepared"]);
        if (selected.length === 1 && primary.zone === "battlefield" && goldfishCardActions(primary.card).some(a => a.id === "engine:bombardment")) actions.unshift(["まとめて砲撃", "batch-bombardment"]);
        if (selected.length === 1) for (const mode of goldfishAlternativeModes(primary.card, primary.zone)) actions.unshift([mode.label, "alternative:" + mode.id]);
        if (selected.length === 1 && primary.zone === "hand") for (const [keyword, label] of [["Warp", "ワープ"], ["Dash", "疾駆"], ["Kicker", "キッカー"]]) {
          const cost = (primary.card.faces?.[0]?.oracleText || primary.card.oracleText || "").match(new RegExp(keyword + " ((?:\\{[^}]+\\})+)"))?.[1];
          if (cost) actions.unshift([label + " " + cost, "cast-mode:" + keyword.toLowerCase()]);
        }
        if (selected.length === 1 && primary.zone === "hand" && primary.card.layout === "split" && /Fuse/.test(primary.card.oracleText || "")) actions.unshift(["融合 {1}{R}{W}", "cast-mode:fuse"]);
        if (selected.length === 1) for (const combo of goldfishCombos(state).filter(c => c.cardId === primary.card.id)) actions.unshift([combo.label, "combo:" + combo.id]);
        if (selected.length === 1 && ["stack", "battlefield"].includes(primary.zone) && goldfishCardOperations(primary.card).text) actions.push(["本文の操作", "effects"]);
      }
      if (selected.length === 1 && primary.card.faces?.length > 1 && primary.card.layout !== "preparation") actions.push(["別の面", "face"]);
      actions.push(["詳細", "details"]);
    } else {
      find("#goldfish-context-name").textContent = state.phase === "opening" ? "手札を確認してキープ" : "手札をダブルクリックでプレイ";
    }
    let zoneActions = find("#goldfish-zones-browser").querySelector(".goldfish-zone-card-actions");
    if (!zoneActions) {
      zoneActions = document.createElement("div");
      zoneActions.className = "goldfish-zone-card-actions";
      find("#goldfish-zones-browser").append(zoneActions);
    }
    for (const container of [find("#goldfish-context-actions"), zoneActions]) {
      container.replaceChildren();
      for (const [label, action, disabled, reason] of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.disabled = Boolean(disabled);
        if (reason) button.title = reason;
        if (action === "play" || action === "fetch" || action.startsWith("ability:")) button.className = "primary-button";
        button.addEventListener("click", () => action === "details" ? showPanel("inspector") : performCardAction(action));
        container.append(button);
      }
    }
  }

  function renderTrackerInputs() {
    for (const input of dialog.querySelectorAll("[data-goldfish-tracker-input]")) {
      if (document.activeElement === input) continue;
      const [player, tracker] = input.dataset.goldfishTrackerInput.split(":");
      input.value = String(state.players[player][tracker]);
    }
  }

  function renderInspector(opening) {
    const ids = validSelectedIds();
    const locations = allLocations();
    const selected = ids.map((id) => locations.get(id)).filter(Boolean);
    const primary = locations.get(primaryId) || selected[0];
    if (!selected.length || !primary) {
      ui.selectedName.textContent = "カードを選択してください。";
      ui.selectedDetail.textContent = "";
      ui.preview.hidden = true;
      ui.preview.removeAttribute("src");
      ui.cardActions.hidden = true;
      ui.counterTools.hidden = true;
      return;
    }

    ui.selectedName.textContent = selected.length > 1 ? `${selected.length}枚を選択中` : cardDisplayName(primary.card);
    const counters = Object.entries(primary.card.counters || {}).map(([name, value]) => `${name}:${value}`).join(" / ");
    ui.selectedDetail.textContent = [
      ZONE_LABELS[primary.zone] || primary.zone,
      primary.card.lane ? LANE_LABELS[primary.card.lane] : "",
      cardFace(primary.card)?.typeLine || primary.card.typeLine,
      counters,
      primary.card.note
    ].filter(Boolean).join(" ／ ");
    const hasPreview = !primary.card.faceDown && !(primary.card.kind === "token" && !primary.card.imageUrl);
    if (hasPreview) ui.preview.src = cardImageUrl(primary.card);
    else ui.preview.removeAttribute("src");
    ui.preview.hidden = !hasPreview;
    ui.cardActions.hidden = opening;

    const battlefieldOnly = selected.every(({ zone }) => zone === "battlefield");
    const battlefieldAny = selected.some(({ zone }) => zone === "battlefield");
    const zoneSet = new Set(selected.map(({ zone }) => zone));
    for (const button of ui.cardActions.querySelectorAll("button[data-goldfish-action]")) {
      const action = button.dataset.goldfishAction;
      button.disabled = false;
      if (action === "tap") button.disabled = !battlefieldAny;
      if (action === "cost") button.disabled = selected.length !== 1 || primary.zone !== "hand";
      if (action === "effects") button.disabled = selected.length !== 1;
      if (action === "group") button.disabled = !battlefieldOnly || selected.length < 2;
      if (action === "fetch") {
        const rule = goldfishFetchRule(primary.card);
        button.disabled = selected.length !== 1 || primary.zone !== "battlefield" || !rule || primary.card.tapped || state.players.self.life < rule.life;
        button.title = rule ? `取得先: ${rule.targetLabel} ／ ライフ支払い: ${rule.life}点` : "対応するフェッチランドを選択。未対応の能力は山札操作で処理できます。";
      }
      if (action === "face") button.disabled = selected.length !== 1 || (primary.card.faces?.length || 0) < 2;
      if (action === "facedown") button.disabled = ![...zoneSet].every((zone) => zone === "battlefield" || zone === "exile");
    }

    ui.counterTools.hidden = !battlefieldOnly;
    if (!battlefieldOnly) return;
    ui.counterList.replaceChildren();
    for (const [name, value] of Object.entries(primary.card.counters || {})) {
      const row = document.createElement("span");
      row.textContent = `${name} ${value}`;
      ui.counterList.append(row);
    }
    if (document.activeElement !== ui.power) ui.power.value = primary.card.powerOverride || "";
    if (document.activeElement !== ui.toughness) ui.toughness.value = primary.card.toughnessOverride || "";
    if (document.activeElement !== ui.note) ui.note.value = primary.card.note || "";
  }

  function render(message = "") {
    if (!state) return;
    hideHoverPreview();
    const focusedCard = document.activeElement?.dataset?.cardId;
    find("#goldfish-turn").textContent = state.turn || "—";
    const finish = goldfishFinish(state);
    find("#goldfish-finish").hidden = !finish;
    find("#goldfish-finish").textContent = finish ? `${finish.label}（${state.turn}ターン目）` : "";
    find("#goldfish-turn-side").textContent = state.rules.activePlayer === "opponent" ? "相手のターン" : "自分のターン";
    find("#goldfish-library-count").textContent = String(state.library.length);
    handPayments = new Map(state.phase === "playing" ? state.hand.filter((card) => goldfishPlayDestination(card) === "stack")
      .map((card) => [card.id, !goldfishCastTiming(state, card) ? { payable: false, reason: "メインフェイズでプレイします" } : goldfishSpellProgram(card)?.target && !goldfishSpellTargets(state, card).length ? { payable: false, reason: "適正な対象がありません" } : planGoldfishCastPayment(state, card, { preview: true, autoTap: find("#goldfish-auto-tap").checked })]) : []);
    renderManaPool();
    renderTrackerInputs();
    renderZone("goldfish-hand", "goldfish-hand-count", state.hand, "hand", { visual: true });
    renderPlottedCards();
    find("#goldfish-hand").style.setProperty("--hand-count", String(Math.max(1, state.hand.length)));
    find("#goldfish-hand").classList.toggle("is-large-hand", state.hand.length > 12);
    renderBattlefield();
    renderZone("goldfish-graveyard", "goldfish-graveyard-count", state.graveyard, "graveyard", { visual: true });
    renderZone("goldfish-exile", "goldfish-exile-count", state.exile, "exile", { visual: true });
    renderZone("goldfish-sideboard", "goldfish-sideboard-count", state.sideboard, "sideboard", { visual: true });
    renderZone("goldfish-command", "goldfish-command-count", state.command, "command", { visual: true });
    renderRulesStack();
    find("#goldfish-stack-zone").classList.toggle("has-spells", Boolean(state.stack.length));
    find("#goldfish-resolve").hidden = !state.stack.length;
    find("#goldfish-resolve").textContent = state.stack.at(-1)?.kind === "ability" ? "誘発を解決 Space" : "呪文を解決 Space";
    find("#goldfish-cast-count").textContent = state.rules.castCountKnown ? `呪文 ${state.rules.spellsCast} · 土地 ${state.rules.landsPlayed ?? "?"}/${gameLandPlayLimit(state)}${state.rules.dayNight ? ` · ${state.rules.dayNight === "day" ? "昼" : "夜"}` : ""}` : "呪文回数を設定";
    find("#goldfish-next-turn").hidden = Boolean(state.stack.length) || state.phase === "opening";
    const combat = state.rules.combat;
    if (combat && combat.stage !== "done") find("#goldfish-next-turn").hidden = true;
    find("#goldfish-attack").hidden = state.phase !== "playing" || state.rules.activePlayer !== "self" || combat?.stage === "done";
    find("#goldfish-attack").textContent = combat?.stage === "normal" ? "通常ダメージ" : combat ? "戦闘ダメージ" : "攻撃する";
    find("#goldfish-attack").disabled = Boolean(state.stack.length);
    find("#goldfish-end-turn").hidden = state.phase !== "playing" || state.rules.activePlayer !== "self" || Boolean(state.stack.length) || Boolean(combat && combat.stage !== "done");
    for (const count of dialog.querySelectorAll("[data-goldfish-zone-count]")) count.textContent = state[count.dataset.goldfishZoneCount].length;
    for (const image of dialog.querySelectorAll("[data-goldfish-pile-image]")) {
      const card = state[image.dataset.goldfishPileImage].at(-1);
      image.hidden = !card || card.faceDown;
      if (card && !card.faceDown) image.src = cardImageUrl(card);
      else image.removeAttribute("src");
    }

    const opening = state.phase === "opening";
    find("#goldfish-opening").hidden = !opening;
    find("#goldfish-opening-title").textContent = state.bottomRequired ? `${state.bottomRequired}枚を山札の下へ` : "この手札で始めますか？";
    find("#goldfish-opening-hint").textContent = state.bottomRequired ? `戻すカードを選んでキープ（選択 ${mulliganBottomIds.size} / ${state.bottomRequired}枚）` : "下の7枚を確認して、キープかマリガンを選びます。";
    find("#goldfish-mulligan").disabled = !opening || state.mulligans >= 7;
    find("#goldfish-keep").disabled = !opening || mulliganBottomIds.size !== state.bottomRequired;
    find("#goldfish-draw").disabled = opening;
    find("#goldfish-next-turn").disabled = opening || Boolean(state.stack.length) || Boolean(combat && combat.stage !== "done");
    find("#goldfish-untap-all").disabled = opening || !state.battlefield.length;
    find("#goldfish-tap-all").disabled = opening || !state.battlefield.length;
    ui.playDraw.disabled = !opening;
    ui.playDraw.value = state.onThePlay ? "play" : "draw";
    ui.undo.disabled = timelineIndex <= 0;
    ui.redo.disabled = timelineIndex >= timeline.length - 1;
    ui.openLibrary.disabled = opening;
    if (opening) libraryOpen = false;
    ui.resume.disabled = !hasSavedSession();
    renderPanels();
    renderInspector(opening);
    renderContext();
    if (panelName === "mana") renderManaPanel();
    const choiceKey = state.rules.pendingChoice ? `${state.rules.pendingChoice.type}:${state.rules.pendingChoice.entryId || state.rules.pendingChoice.entryIds?.join(",")}` : !state.rules.castCountKnown ? "cast-count" : "";
    if (choiceKey && focusedChoiceKey !== choiceKey) find("#goldfish-rules-content").querySelector("input, button:not(:disabled)")?.focus({ preventScroll: true });
    focusedChoiceKey = choiceKey;
    if (focusedCard) {
      const replacement = [...dialog.querySelectorAll("[data-card-id]")].find((button) => button.dataset.cardId === focusedCard && !button.closest("[hidden]"));
      if (replacement && !replacement.closest("[inert]")) replacement.focus({ preventScroll: true });
    }

    if (message) ui.message.textContent = message;
    else if (opening && state.bottomRequired) {
      ui.message.textContent = `マリガン${state.mulligans}回。手札から戻す${state.bottomRequired}枚を選択してください（${mulliganBottomIds.size}/${state.bottomRequired}）。`;
    } else if (opening) {
      ui.message.textContent = "初手7枚です。戦場へドラッグするとキープして開始します。マリガン・キープのボタンも使えます。";
    } else {
      ui.message.textContent = "光る手札は印刷コスト分のマナがあります。土地はダブルクリックでマナ、呪文はスタックへドラッグして唱えます。";
    }
  }

  function moveThroughUi(cardIds, destination, {
    lane,
    index,
    shuffleLibrary = false,
    closeLibrary = shuffleLibrary
  } = {}) {
    const locations = cardIds.map((id) => findCard(id)).filter(Boolean);
    if (locations.length !== cardIds.length) throw new Error("移動するカードが見つかりません。");
    const fromLibrary = locations.every(({ zone }) => zone === "library");
    if (fromLibrary && topOperation?.destinations && !(topOperation.destinations[destination] >= cardIds.length)) throw new Error("この効果で残っている行き先へ1枚ずつ振り分けてください。");
    let next;
    if (fromLibrary && shuffleLibrary && !destination.startsWith("library")) {
      next = takeGoldfishCardsFromLibrary(state, cardIds, destination, Math.random, { lane, index });
    } else {
      next = dropGoldfishCards(state, cardIds, destination, { lane, index });
    }
    if (fromLibrary && libraryMode === "top") topCardIds = topCardIds.filter((id) => !cardIds.includes(id));
    if (fromLibrary && topOperation?.destinations) topOperation.destinations[destination] -= cardIds.length;
    const names = locations.map(({ card }) => card.name);
    const subject = names.length === 1 ? `「${names[0]}」` : `${names.length}枚`;
    const laneText = destination === "battlefield" && lane ? `の${LANE_LABELS[lane]}` : "";
    const suffix = fromLibrary && shuffleLibrary ? "。山札をシャッフルしました。" : "。";
    const opening = state.phase === "opening" ? "初手をキープし、" : "";
    commit(next, `${opening}${subject}を${ZONE_LABELS[destination] || destination}${laneText}へ移しました${suffix}`, {
      select: cardIds,
      primary: cardIds[0],
      closeLibrary
    });
  }

  function selectedBattlefieldIds() {
    return validSelectedIds().filter((id) => findCard(id)?.zone === "battlefield");
  }

  function toggleSelectedTapped() {
    const ids = selectedBattlefieldIds();
    if (!ids.length) {
      render("戦場のカードを選択してください。");
      return;
    }
    if (ids.length === 1) {
      const card = findCard(ids[0]).card;
      const options = goldfishLandManaOptions(card, state);
      if (!card.tapped && options.length) {
        if (options.length === 1 && !options[0].life) {
          commit(activateGoldfishLand(state, card.id), `「${cardDisplayName(card)}」から ${goldfishManaText(options[0].pool)} を出しました。`);
        } else openManaPanel("source", card.id);
        return;
      }
    }
    commit(setGoldfishCardsTapped(state, ids), `${ids.length}枚のタップ状態を切り替えました。`, { select: ids, primary: ids[0] });
  }

  function renderManaPool() {
    const pool = find("#goldfish-mana-pool");
    pool.replaceChildren();
    const names = { W: "白", U: "青", B: "黒", R: "赤", G: "緑", C: "無色" };
    for (const color of GOLDFISH_MANA_TYPES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `goldfish-mana-orb mana-${color}`;
      button.textContent = `${color} ${state.manaPool[color]}`;
      button.classList.toggle("has-mana", state.manaPool[color] > 0);
      button.setAttribute("aria-label", `${names[color]}マナ ${state.manaPool[color]}。マナを調整`);
      button.addEventListener("click", () => openManaPanel("pool"));
      pool.append(button);
    }
  }

  function openManaPanel(mode, cardId = "") {
    manaMode = mode;
    manaCardId = cardId;
    costX = 0;
    showPanel("mana");
    renderManaPanel();
  }

  function finishPlay(cardId, options = {}, base = state) {
    try {
      const fromExile = base.exile.some((item) => item.id === cardId);
      const fromGraveyard = base.graveyard.some((item) => item.id === cardId);
      const fromSideboard = base.sideboard.some((item) => item.id === cardId);
      const card = (fromSideboard ? base.sideboard : fromExile ? base.exile : fromGraveyard ? base.graveyard : base.hand).find((item) => item.id === cardId);
      let next = castGoldfishCard(base, cardId, { autoTap: find("#goldfish-auto-tap").checked, fromExile, fromGraveyard, fromSideboard, ...options });
      const land = goldfishPlayDestination(card) === "battlefield";
      if (autoTriggers) next = advanceGoldfishGame(next, { autoOrder });
      panelName = "";
      commit(next, next.rules.pendingChoice ? next.rules.lastAction || `${cardDisplayName(card)}：選択してください。` : land ? `「${cardDisplayName(card)}」を戦場へ。` :
        `「${cardDisplayName(card)}」を唱えました。${options.manual ? "コストは手動処理。" : `${goldfishCastingCost(card, { fromExile, fromGraveyard, state: base, ...options })} を支払い。`}${next.rules.lastAction}`,
        { select: [cardId], primary: cardId, closeLibrary: true });
    } catch (error) { render(error.message); }
  }

  function playWithMana(cardId) {
    let base = state;
    if (state.phase === "opening") base = keepGoldfishHand(state, [...mulliganBottomIds]);
    const fromExile = base.exile.some((item) => item.id === cardId), fromGraveyard = base.graveyard.some((item) => item.id === cardId);
    const card = [...base.hand, ...base.exile, ...base.graveyard].find((item) => item.id === cardId);
    if (!card) throw new Error("プレイするカードを選んでください。");
    const land = goldfishPlayDestination(card) === "battlefield";
    const choices = land ? goldfishLandEntryOptions(card, base) : [];
    const plan = land ? null : planGoldfishCastPayment(base, card, { preview: true, autoTap: find("#goldfish-auto-tap").checked, fromExile, fromGraveyard });
    if (choices.length > 1 || (!land && (!plan.payable || plan.life || goldfishManaCost(card).includes("{X}")))) {
      if (base !== state) commit(base, "初手をキープしました。", { select: [cardId], primary: cardId });
      openManaPanel(land ? "land" : "cost", cardId);
    } else finishPlay(cardId, {}, base);
  }

  function renderPlottedCards() {
    const header = find("#goldfish-hand").parentElement.querySelector("header");
    let tray = header.querySelector(".goldfish-plotted-cards");
    if (!tray) { tray = document.createElement("div"); tray.className = "goldfish-plotted-cards"; tray.setAttribute("aria-label", "追放からプレイできるカード"); header.append(tray); }
    const plotted = state.exile.filter((card) => { const p = card.playPermission; return p && (["plot", "warp", "adventure", "airbend"].includes(p.kind) || p.expires != null && p.expires >= state.rules.turnSerial || p.serial === state.rules.turnSerial); });
    tray.replaceChildren(); tray.hidden = !plotted.length;
    header.querySelector("p").hidden = Boolean(plotted.length);
    for (const card of plotted) {
      const planned = card.playPermission.kind === "plot";
      const ready = planned ? goldfishPlotReady(state, card) : card.playPermission.kind !== "warp" || card.playPermission.serial < state.rules.turnSerial;
      const button = document.createElement("button"); button.type = "button";
      button.className = ready ? "is-ready" : "";
      button.textContent = `${planned ? "計画" : card.playPermission.kind === "warp" ? "ワープ" : "追放からプレイ"}：${cardDisplayName(card)}`;
      button.disabled = !ready || Boolean(state.rules.pendingChoice);
      button.title = ready ? "クリックで支払いを確認してプレイ" : "後のターンの適正なタイミングで唱えられます";
      button.addEventListener("click", () => playWithMana(card.id)); tray.append(button);
    }
  }

  function renderRulesStack() {
    const container = find("#goldfish-stack");
    container.replaceChildren();
    find("#goldfish-stack-count").textContent = String(state.stack.length);
    const top = state.stack.at(-1);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "goldfish-stack-summary";
    button.textContent = top ? `${top.kind === "ability" ? top.ability.label : top.name} ▸` : "誘発・順番を見る";
    button.title = top ? `次に解決：${top.name} ${top.ability?.label || ""}` : "スタックと自動処理の設定";
    button.addEventListener("click", () => showPanel("rules"));
    container.append(button);
  }

  function finishRuleChoice(answer, advance = autoTriggers) {
    try {
      let next = state.rules.pendingChoice?.type === "cast-alternative" ? chooseGoldfishAlternative(state, answer) : state.rules.pendingChoice?.type === "action" ? chooseGoldfishAction(state, answer) : ["cast-target", "cast-sacrifice", "cast-preflight", "land-count"].includes(state.rules.pendingChoice?.type) ? chooseGoldfishCast(state, answer) : chooseGoldfishRule(state, answer);
      const message = next.rules.lastAction;
      if (advance && !answer.cancel) next = advanceGoldfishGame(next, { autoOrder });
      rulesOrder = [];
      panelName = next.rules.pendingChoice ? "rules" : "";
      commit(next, next.rules.lastAction === message ? message : `${message} ${next.rules.lastAction}`, { select: [], primary: "", closeLibrary: true });
      if (next.rules.pendingChoice) find("#goldfish-rules-content").querySelector("button:not(:disabled)")?.focus();
    } catch (error) { ui.message.textContent = error.message; }
  }

  function saveChoiceDraft(draft) {
    if (!state.rules.pendingChoice) return;
    state = cloneGoldfishState(state);
    state.rules.pendingChoice.draft = structuredClone(draft);
    // Editing an unconfirmed selection is not another game action, but must
    // survive closing/reopening, including timeline-based resume.
    if (timeline[timelineIndex]) timeline[timelineIndex] = { ...timeline[timelineIndex], state: cloneGoldfishState(state) };
    saveSession();
  }

  function renderRulesPanel() {
    const content = find("#goldfish-rules-content");
    content.replaceChildren();
    const choice = state.rules.pendingChoice;
    const title = find("#goldfish-rules-title");
    find("#goldfish-rules-close").hidden = Boolean(choice || !state.rules.castCountKnown);
    const paragraph = (text, className = "goldfish-panel-hint") => {
      const node = document.createElement("p"); node.className = className; node.textContent = text; content.append(node); return node;
    };
    const action = (label, callback, primary = false) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label;
      if (primary) button.className = "primary-button";
      button.addEventListener("click", callback); content.append(button); return button;
    };
    const image = (card) => {
      const wrapper = document.createElement("div"); wrapper.className = "goldfish-rule-card";
      const img = document.createElement("img"); img.src = cardImageUrl(card); img.alt = cardDisplayName(card);
      img.addEventListener("error", () => { img.hidden = true; });
      const name = document.createElement("strong"); name.textContent = cardDisplayName(card);
      wrapper.append(img, name); content.append(wrapper);
    };
    if (choice && renderGoldfishSpellChoice({ state, choice, content, title, action, paragraph, imageUrl: cardImageUrl, answer: finishRuleChoice, saveDraft: saveChoiceDraft })) return;
    if (!state.rules.castCountKnown) {
      title.textContent = "保存したゲームを続ける";
      paragraph("旧保存データには、このターンに唱えた呪文の回数がありません。コーリ鋼の誘発を正しく数えるため、すでに唱えた回数を設定してください。土地は含みません。");
      const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.max = "999"; input.value = "0"; input.setAttribute("aria-label", "すでに唱えた呪文の回数"); content.append(input);
      action("この回数で再開", () => { try { panelName = ""; commit(setGoldfishCastCount(state, Number(input.value)), "唱えた回数を設定しました。"); } catch (error) { ui.message.textContent = error.message; } }, true);
      action("初手からやり直す", () => find("#goldfish-new-game").click());
      return;
    }
    if (choice?.type === "order") {
      title.textContent = "どの順で解決しますか？";
      paragraph(`同時に ${choice.entryIds.length} 件誘発しました。上から順に解決します。呪文はその下で待ちます。`);
      if (rulesOrder.length !== choice.entryIds.length || rulesOrder.some((id) => !choice.entryIds.includes(id))) rulesOrder = [...choice.entryIds];
      const list = document.createElement("ol"); list.className = "goldfish-trigger-order";
      rulesOrder.forEach((id, index) => {
        const entry = state.stack.find((item) => item.id === id);
        const row = document.createElement("li");
        const text = document.createElement("span"); text.textContent = `${index + 1}. ${entry.ability.label} — ${entry.name}`; row.append(text);
        for (const [delta, label] of [[-1, "先に"], [1, "後に"]]) {
          const button = document.createElement("button"); button.type = "button"; button.textContent = delta < 0 ? "↑" : "↓";
          button.setAttribute("aria-label", `${entry.name}の${entry.ability.label}を${label}解決`);
          button.disabled = index + delta < 0 || index + delta >= rulesOrder.length;
          button.addEventListener("click", () => { [rulesOrder[index], rulesOrder[index + delta]] = [rulesOrder[index + delta], rulesOrder[index]]; renderRulesPanel(); }); row.append(button);
        }
        list.append(row);
      });
      content.append(list);
      action("この順で進む", () => finishRuleChoice({ order: rulesOrder }), true);
      action("順を確定して、応答する", () => finishRuleChoice({ order: rulesOrder }, false));
      return;
    }
    if (choice?.type === "surveil") {
      title.textContent = "諜報1";
      paragraph(`${choice.sourceName} の誘発を解決中。山札の一番上を選んでください。`);
      const card = state.library.find((item) => item.id === choice.cardId);
      if (card) image(card);
      action("山札の上に残す", () => finishRuleChoice({ destination: "top" }), true);
      action("墓地へ置く", () => finishRuleChoice({ destination: "graveyard" }));
      paragraph(`墓地のカードタイプ：${goldfishGraveyardTypes(state).length} 種類。元の呪文はまだ解決していません。`);
      return;
    }
    if (choice?.type === "attach") {
      title.textContent = "モンクに装着しますか？";
      paragraph(`${choice.sourceName} から、果敢を持つ白の1/1モンクが出ました。`);
      const token = document.createElement("div"); token.className = "goldfish-monk-preview";
      token.textContent = "MONK\n1/1 · 白 · 果敢"; content.append(token);
      action("装着する — 2/2・トランプル・速攻", () => finishRuleChoice({ attach: true }), true);
      action("装着しない — 1/1のまま", () => finishRuleChoice({ attach: false }));
      paragraph("このモンクの果敢は、次に非クリーチャー呪文を唱えたときから誘発します。");
      return;
    }
    if (choice?.type === "manual") {
      title.textContent = "この能力は手動確認が必要です";
      paragraph(choice.sourceName, "goldfish-mana-card-name");
      paragraph(choice.text, "goldfish-oracle-text");
      paragraph("誘発条件・対象・効果を確認してください。下のボタンで盤面の操作に戻ります。呪文はスタックに残ります。");
      action("盤面で手動処理する", () => finishRuleChoice({ acknowledge: true }, false), true);
      return;
    }
    title.textContent = "スタックと誘発";
    const label = document.createElement("label"); label.className = "goldfish-auto-trigger-option";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = autoTriggers;
    checkbox.addEventListener("change", () => { autoTriggers = checkbox.checked; saveSession(); });
    label.append(checkbox, "選択が必要になるまで自動進行"); content.append(label);
    const orderLabel = document.createElement("label"); orderLabel.className = "goldfish-auto-trigger-option";
    const orderCheck = document.createElement("input"); orderCheck.type = "checkbox"; orderCheck.checked = !autoOrder;
    orderCheck.addEventListener("change", () => { autoOrder = !orderCheck.checked; saveSession(); });
    orderLabel.append(orderCheck, "誘発の解決順を毎回選ぶ"); content.append(orderLabel);
    paragraph("通常は強化 → 諜報 → モンク生成の順で進みます。応答を挟むときは自動進行をオフにして、Spaceで1つずつ解決できます。");
    if (state.stack.length) {
      const list = document.createElement("ol"); list.className = "goldfish-stack-list";
      state.stack.toReversed().forEach((entry, index) => {
        const row = document.createElement("li");
        const name = document.createElement("strong"); name.textContent = `${index + 1}. ${entry.ability?.label || "呪文"} — ${entry.name}`;
        const text = document.createElement("p"); text.textContent = entry.oracleText || "本文の効果を処理してから解決します。";
        row.append(name, text);
        const button = document.createElement("button"); button.type = "button";
        if (entry.kind === "ability") {
          button.textContent = "この誘発を取り除く（打ち消し等）";
          button.addEventListener("click", () => { try { commit(removeGoldfishStackAbility(state, entry.id), `${entry.name}の誘発を手動で取り除きました。`); } catch (error) { ui.message.textContent = error.message; } });
        } else {
          button.textContent = "カード本文の操作";
          button.addEventListener("click", () => openManaPanel("effects", entry.id));
          button.disabled = index !== 0;
        }
        row.append(button); list.append(row);
      });
      content.append(list);
      if (state.stack.length) {
        action("1つ解決する", () => { try { commit(resolveGoldfishSpell(state), "誘発を1つ解決します。"); } catch (error) { ui.message.textContent = error.message; } });
        action("選択が必要になるまで進む", () => { try { const next = advanceGoldfishGame(state, { autoOrder }); panelName = ""; commit(next, next.rules.lastAction); } catch (error) { ui.message.textContent = error.message; } }, true);
      }
    } else paragraph("スタックは空です。唱えると、対応している誘発がここに出ます。");
    const countLabel = document.createElement("label"); countLabel.textContent = "このターンに唱えた回数 ";
    const count = document.createElement("input"); count.type = "number"; count.min = "0"; count.max = "999"; count.value = state.rules.spellsCast;
    count.setAttribute("aria-label", "このターンに唱えた回数"); countLabel.append(count); content.append(countLabel);
    action("回数を手動で修正", () => { try { commit(setGoldfishCastCount(state, Number(count.value)), "唱えた回数を修正しました。"); } catch (error) { ui.message.textContent = error.message; } });
    const landLabel = document.createElement("label"); landLabel.textContent = "このターンの土地プレイ ";
    const landCount = document.createElement("input"); landCount.type = "number"; landCount.min = "0"; landCount.max = "99"; landCount.value = state.rules.landsPlayed ?? 0; landCount.setAttribute("aria-label", "このターンの土地プレイ回数"); landLabel.append(landCount); content.append(landLabel);
    action("土地の回数を修正", () => { try { commit(setGoldfishLandCount(state, Number(landCount.value)), "土地の回数を修正しました。"); } catch (error) { ui.message.textContent = error.message; } });
    paragraph("果敢・媒介者・コーリ鋼・精鋭射手団の目立ちたがりの唱えたときの能力に対応。能力を失う効果やトークン倍化などは、カード本文の操作で自動処理をオフにして調整してください。");
  }

  function renderManaPanel() {
    const content = find("#goldfish-mana-content");
    const title = find("#goldfish-mana-title");
    content.replaceChildren();
    const paragraph = (text, className = "goldfish-panel-hint") => {
      const node = document.createElement("p"); node.textContent = text; node.className = className; content.append(node); return node;
    };
    const action = (label, run, { primary = false, disabled = false } = {}) => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = label; button.className = primary ? "primary-button" : "";
      button.disabled = disabled;
      button.addEventListener("click", () => { try { run(); } catch (error) { render(error.message); } });
      content.append(button); return button;
    };
    const selected = findCard(manaCardId);
    if (manaMode === "deck") {
      title.textContent = "このデッキの自動処理と操作";
      paragraph("実際のカード本文で対応を確認しています。自動の効果は唱えて選択するだけで進みます。カードを押すと本文と手動操作も開けます。");
      for (const row of activeDeck.mainboard) {
        const location = [...allLocations().values()].find(({ card }) => card.name === row.name);
        if (!location) continue;
        const { operations } = goldfishCardOperations(location.card);
        const spell = goldfishSpellProgram(location.card);
        const automatic = [...goldfishRuleCoverage(location.card).automatic, ...(spell ? [spell.label] : [])];
        action(`${row.name} — ${automatic.length ? `自動：${automatic.join(" / ")}` : operations.length ? `手動：${operations.map((op) => op.label).join(" / ")}` : "本文を確認"}`, () => openManaPanel("effects", location.card.id));
      }
      return;
    }
    if (manaMode === "pool" || !selected) {
      title.textContent = "マナプール";
      paragraph("通常の土地はダブルクリック／Tでマナを出せます。条件付きの能力や宝物などで出したマナは、ここで調整できます。");
      for (const color of GOLDFISH_MANA_TYPES) {
        const row = document.createElement("div"); row.className = "goldfish-mana-adjust";
        const name = document.createElement("strong"); name.textContent = `${color}  ${state.manaPool[color]}`; row.append(name);
        for (const delta of [-1, 1]) {
          const button = document.createElement("button"); button.type = "button"; button.textContent = delta > 0 ? "＋" : "−";
          button.setAttribute("aria-label", `${color}マナを1${delta > 0 ? "増やす" : "減らす"}`);
          button.disabled = delta < 0 && !state.manaPool[color];
          button.addEventListener("click", () => commit(setGoldfishMana(state, color, state.manaPool[color] + delta), `${color}マナを調整しました。`));
          row.append(button);
        }
        content.append(row);
      }
      action("ステップ／フェイズ終了：マナを空にする", () => {
        panelName = ""; commit(clearGoldfishMana(state), "未使用のマナを空にしました。");
      });
      paragraph("次のターンでは自動で空になります。土地のアンタップだけではマナは取り消されません。起動を取り消すときは「戻す」を使います。");
      return;
    }
    const card = selected.card;
    title.textContent = manaMode === "effects" ? "カード本文の操作" : manaMode === "source" ? "出すマナを選ぶ" : manaMode === "land" ? "土地を出す" : "マナを支払う";
    paragraph(cardDisplayName(card), "goldfish-mana-card-name");
    const oracle = goldfishCardOperations(card);
    if (selected.zone === "exile" && ["cost", "land"].includes(manaMode)) paragraph("追放からプレイできる効果と、その有効期間をカード本文で確認してから実行してください。");
    if (manaMode === "source") {
      goldfishLandManaOptions(card, state).forEach((option, index) => action(
        `${goldfishManaText(option.pool)} を出す${option.life ? `（${option.life}${option.damage ? "ダメージ" : "ライフ支払い"}）` : ""}`, () => {
          panelName = ""; commit(activateGoldfishLand(state, card.id, index), `「${cardDisplayName(card)}」から ${goldfishManaText(option.pool)} を出しました。`);
        }, { primary: true, disabled: card.tapped || (option.life > 0 && state.players.self.life <= option.life) }));
    } else if (manaMode === "land") {
      goldfishLandEntryOptions(card, state).forEach((choice, index) => action(choice.label, () => finishPlay(card.id, { entry: index }), { primary: true, disabled: state.players.self.life < choice.life }));
    } else if (manaMode === "cost") {
      const origin = { fromGraveyard: selected.zone === "graveyard", fromExile: selected.zone === "exile", fromSideboard: selected.zone === "sideboard", state };
      paragraph(`${origin.fromGraveyard ? goldfishSpellProgram(card)?.harmonize ? "調和（クリーチャーのタップで軽減可）" : "墓地からの支払い" : "支払いコスト"} ${goldfishCastingCost(card, origin) || "なし／未取得"} · 自動タップ ${find("#goldfish-auto-tap").checked ? "ON" : "OFF"}`);
      let xInput;
      if (goldfishManaCost(card).includes("{X}")) {
        const label = document.createElement("label"); label.textContent = "Xの値";
        xInput = document.createElement("input"); xInput.type = "number"; xInput.min = "0"; xInput.max = "99"; xInput.step = "1"; xInput.value = String(costX);
        label.append(xInput); content.append(label);
      }
      const explanation = paragraph("");
      const pay = action(selected.zone === "exile" ? "使用許可を確認して支払う" : "支払って唱える", () => finishPlay(card.id, { x: costX, confirmLife: true }), { primary: true });
      const refresh = () => {
        const plan = planGoldfishCastPayment(state, card, { preview: true, autoTap: find("#goldfish-auto-tap").checked, x: costX, ...origin });
        let preflight = null;
        try { preflight = extraCastChoice(state, card, { ...origin, x: costX }); } catch {}
        pay.disabled = !plan.payable && !preflight;
        pay.textContent = preflight ? "唱え方・対象・追加コストを選ぶ" : "支払って唱える";
        const lands = plan.activations?.map(({ id }) => cardDisplayName(findCard(id).card)).join("、");
        const usesPool = GOLDFISH_MANA_TYPES.some((color) => (state.manaPool[color] || 0) > (plan.remaining?.[color] || 0));
        explanation.textContent = preflight ? "モードや代替コストを選んでから、支払えるか確認します。選択が終わるまでマナは使いません。" : plan.payable ? `${lands ? `タップするマナ源：${lands}。` : usesPool ? "プールのマナで支払えます。" : "タップする必要はありません。"}${plan.life ? `ライフが${plan.life}点減ります。` : ""}` : plan.reason;
      };
      xInput?.addEventListener("input", () => { costX = xInput.value === "" ? NaN : Number(xInput.value); refresh(); });
      refresh();
      if (/\/P\}/.test(goldfishManaCost(card))) {
        const lifePlan = planGoldfishCastPayment(state, card, { preview: true, autoTap: find("#goldfish-auto-tap").checked, x: costX, phyrexianLife: true, ...origin });
        action(`ファイレクシア・マナをライフで支払う（${lifePlan.life || 2}点）`, () => finishPlay(card.id, { x: costX, confirmLife: true, phyrexianLife: true }), { disabled: !lifePlan.payable });
      }
      const manual = document.createElement("details");
      const summary = document.createElement("summary"); summary.textContent = "軽減・追加・代替コストを手動処理"; manual.append(summary);
      const hint = document.createElement("p"); hint.textContent = "必要なマナ・ライフ・生け贄などを自分で処理した後に使います。この操作では土地やマナプールを変更しません。"; manual.append(hint);
      const manualButton = action("コストを手動処理済み → スタックへ", () => finishPlay(card.id, { manual: true }));
      manual.append(manualButton); content.append(manual);
    } else if (manaMode === "effects") {
      if (selected.zone === "stack" && state.stack.at(-1)?.id !== card.id) {
        paragraph("この呪文の上に解決待ちがあります。先に上の誘発・呪文を処理してください。");
        action("スタックを見る", () => showPanel("rules"), { primary: true });
        if (oracle.text) paragraph(oracle.text, "goldfish-oracle-text");
        return;
      }
      const coverage = goldfishRuleCoverage(card);
      const spell = goldfishSpellProgram(card);
      if (selected.zone === "stack" && spell) {
        paragraph(`自動解決：${spell.label}`);
        action("呪文の効果を解決する", () => find("#goldfish-resolve").click(), { primary: true });
        if (oracle.text) paragraph(oracle.text, "goldfish-oracle-text");
        return;
      }
      if (coverage.automatic.length) paragraph(`自動対応：${coverage.automatic.join(" / ")}。`);
      const characteristics = goldfishCharacteristics(state, card);
      if (characteristics.notes.length) paragraph(characteristics.notes.join(" / "));
      paragraph("下は手動処理用です。自動解決した効果を重ねて実行しないでください。記載以外の効果・対象・条件は本文を確認してください。");
      if (selected.zone === "battlefield" && coverage.automatic.length) action(card.automaticAbilities === false ? "このカードの自動能力をオン" : "このカードの自動能力をオフ（能力喪失など）", () => {
        commit(setGoldfishAutomaticAbilities(state, card.id, card.automaticAbilities === false), "このカードの自動能力の設定を変更しました。すでにスタックにある誘発は残ります。");
      });
      for (const operation of oracle.operations) action(operation.label, () => {
        if (["top", "surveil", "scry"].includes(operation.kind)) {
          ui.topCount.value = String(operation.count);
          setLibraryOpen(true, "top");
          topOperation = { ...operation, destinations: operation.destinations ? { ...operation.destinations } : null, cardId: card.id, name: cardDisplayName(card) };
          topCardIds = peekGoldfishLibrary(state, operation.count).map((item) => item.id);
          render(`「${cardDisplayName(card)}」：上から${operation.count}枚。本文に従って行き先を選んでください。`);
        } else if (operation.kind === "draw") { const next = drawGoldfishCards(state, operation.count); commit(next, next.rules.lastAction); }
        else commit(moveGoldfishTopCards(state, operation.count, "graveyard"), `「${cardDisplayName(card)}」：${operation.count}枚切削しました。`);
      });
      if (/search your library/i.test(oracle.text)) action("山札から探す", () => setLibraryOpen(true, "search"));
      action("山札の上を見る・振り分ける", () => setLibraryOpen(true, "top"));
      if (selected.zone === "stack" && state.stack.at(-1)?.id === card.id) action("処理を終えて解決", () => {
        panelName = ""; const next = resolveGoldfishSpell(state, { manual: true }); commit(next, next.rules.lastAction);
      }, { primary: true });
      action("このカードを墓地へ", () => { panelName = ""; moveThroughUi([card.id], "graveyard"); });
      action("このカードを追放", () => { panelName = ""; moveThroughUi([card.id], "exile"); });
    }
    if (oracle.text) paragraph(oracle.text, "goldfish-oracle-text");
  }

  find("#goldfish-mana-open").addEventListener("click", () => openManaPanel("pool"));
  find("#goldfish-deck-actions").addEventListener("click", () => openManaPanel("deck"));
  find("#goldfish-auto-tap").addEventListener("change", () => { saveSession(false); render("自動タップの設定を変更しました。手札の光も更新しました。"); });

  function setLibraryOpen(open, mode = libraryMode) {
    topOperation = null;
    hideHoverPreview();
    if (open && state?.phase !== "playing") {
      render("初手をキープしてから山札を操作してください。");
      return;
    }
    if (open) panelReturnFocus = document.activeElement;
    panelName = "";
    libraryOpen = Boolean(open);
    fetchSourceId = "";
    surveilSourceName = "";
    libraryMode = mode;
    gameLogOpen = false;
    shortcutsOpen = false;
    if (libraryOpen && libraryMode === "search") librarySearch = "";
    render(libraryOpen ? (libraryMode === "search" ? "サーチ後は自動でシャッフルします。" : "山札の上を確認できます。") : "");
    if (libraryOpen && libraryMode === "search") requestAnimationFrame(() => ui.libraryQuery.focus());
    else if (!libraryOpen) ui.openLibrary.focus();
  }

  function startFetch() {
    topOperation = null;
    hideHoverPreview();
    const ids = validSelectedIds();
    if (ids.length !== 1) throw new Error("戦場のフェッチランドを1枚選んでFを押してください。");
    goldfishFetchTargets(state, ids[0]); // Validate before opening; no game mutation.
    panelReturnFocus = document.activeElement;
    panelName = "";
    fetchSourceId = ids[0];
    surveilSourceName = "";
    libraryOpen = true;
    libraryMode = "search";
    librarySearch = "";
    gameLogOpen = false;
    shortcutsOpen = false;
    render("取得する土地と出し方を選んでください。確定前ならキャンセルできます。");
    requestAnimationFrame(() => ui.libraryQuery.focus());
  }

  function finishFetch(targetId, entryKey) {
    try {
      const source = findCard(fetchSourceId)?.card;
      const target = targetId ? state.library.find((card) => card.id === targetId) : null;
      let next = resolveGoldfishFetch(state, fetchSourceId, targetId, { entry: entryKey });
      const cost = state.players.self.life - next.players.self.life;
      const result = target ? `「${target.name}」を${next.battlefield.find((card) => card.id === targetId).tapped ? "タップ状態で" : ""}戦場へ。` : "土地を見つけずに終了。";
      const message = `「${source.name}」を生け贄に${cost ? `して${cost}点支払い` : "し"}、${result}山札をシャッフルしました。`;
      if (autoTriggers) next = advanceGoldfishGame(next, { autoOrder });
      commit(next, message, { select: target ? [targetId] : [], primary: targetId || "", closeLibrary: true });
      if (!next.rules.pendingChoice) ui.openLibrary.focus();
    } catch (error) { render(error.message); }
  }

  function resetGame(message = "", { preserveHistory = false } = {}) {
    if (!activeDeck) return;
    panelName = "";
    topOperation = null;
    state = preserveHistory && state ? restartGoldfishGame(state, { onThePlay: ui.playDraw.value === "play" }) : createGoldfishGame(activeDeck.mainboard, {
      sideboardRows: activeDeck.sideboard,
      onThePlay: ui.playDraw.value === "play"
    });
    selectedIds = new Set();
    primaryId = "";
    mulliganBottomIds = new Set();
    dragged = null;
    libraryOpen = false;
    libraryMode = "search";
    librarySearch = "";
    fetchSourceId = "";
    surveilSourceName = "";
    topCardIds = [];
    gameLogOpen = false;
    shortcutsOpen = false;
    if (!preserveHistory) { timeline = []; timelineIndex = -1; }
    pushTimeline("新しい初手を引きました。");
    render(message || "初手7枚から開始します。マリガン・キープを選んでください。戻すで直前の盤面に戻れます。");
  }

  async function enrichDeck(deck) {
    const names = [...new Set([...(deck.mainboard || []), ...(deck.sideboard || [])].map((row) => row.name).filter(Boolean))];
    if (!names.length) return deck;
    const response = await fetch("/api/card-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "カード種別を取得できませんでした。");
    return { ...deck, mainboard: mergeCardMetadata(deck.mainboard, data.cards), sideboard: mergeCardMetadata(deck.sideboard, data.cards) };
  }

  function setLoading(loading) {
    dialog.classList.toggle("is-loading-goldfish", loading);
    find(".goldfish-layout").inert = loading;
    for (const button of dialog.querySelectorAll(".goldfish-topbar-actions button:not(#goldfish-close)")) button.inert = loading;
  }

  async function open(deck, title) {
    const requestId = ++openRequestId;
    if (state) saveSession(false);
    state = null;
    activeDeck = deck;
    panelName = "";
    libraryOpen = gameLogOpen = shortcutsOpen = false;
    renderPanels();
    storageKey = `${SAVE_PREFIX}${deckSignature(deck)}`;
    ui.title.textContent = `${title || deck.title || "デッキ"} — ひとり回し`;
    ui.message.textContent = "土地・クリーチャー等を判別するカード情報を取得しています…";
    ui.saveStatus.textContent = hasSavedSession() ? "保存済みゲームあり" : "未保存";
    ui.resume.disabled = !hasSavedSession();
    setLoading(true);
    if (!dialog.open) dialog.showModal();
    try {
      const enrichedDeck = await enrichDeck(deck);
      if (requestId !== openRequestId) return;
      activeDeck = enrichedDeck;
      setLoading(false);
      if (hasSavedSession()) resumeSession();
      else resetGame();
    } catch (error) {
      if (requestId !== openRequestId) return;
      activeDeck = deck;
      setLoading(false);
      if (hasSavedSession()) {
        resumeSession();
        ui.message.textContent = `保存ゲームを再開しました。カード情報の更新だけ失敗しています: ${error.message}`;
      } else {
        resetGame(`カード種別の取得に失敗しました。手動で各エリアへ置けます: ${error.message}`);
      }
    }
  }

  function close() {
    ++openRequestId;
    if (state) saveSession(false);
    libraryOpen = false;
    fetchSourceId = "";
    surveilSourceName = "";
    gameLogOpen = false;
    shortcutsOpen = false;
    panelName = "";
    if (dialog.open) dialog.close();
  }

  function resumeSession() {
    try {
      panelName = "";
      const saved = parseGoldfishSave(localStorage.getItem(storageKey));
      if (saved?.version !== 2 || saved.signature !== deckSignature(activeDeck)) throw new Error("このデッキの保存データがありません。");
      find("#goldfish-auto-tap").checked = saved.autoTap !== false;
      autoTriggers = saved.autoTriggers !== false;
      autoOrder = saved.autoOrder !== false;
      const metadata = [...(activeDeck.mainboard || []), ...(activeDeck.sideboard || [])];
      const restoredTimeline = (Array.isArray(saved.timeline) ? saved.timeline : []).slice(-MAX_TIMELINE).map((entry) => ({
        at: entry.at || saved.savedAt,
        message: String(entry.message || "保存盤面").slice(0, 240),
        state: restoreGoldfishGame(entry.state, { metadata }),
        selectedIds: Array.isArray(entry.selectedIds) ? entry.selectedIds.slice(0, 100) : [],
        primaryId: String(entry.primaryId || "")
      }));
      state = restoreGoldfishGame(saved.state, { metadata });
      timeline = restoredTimeline.length ? restoredTimeline : [timelineEntry("保存盤面")];
      timelineIndex = Math.max(0, Math.min(Number(saved.timelineIndex) || 0, timeline.length - 1));
      state = cloneGoldfishState(timeline[timelineIndex]?.state || state);
      selectedIds = new Set(saved.selectedIds || []);
      primaryId = saved.primaryId || "";
      mulliganBottomIds = new Set();
      libraryOpen = false;
      fetchSourceId = "";
      surveilSourceName = "";
      gameLogOpen = false;
      shortcutsOpen = false;
      render(`保存したゲームを再開しました（${new Date(saved.savedAt).toLocaleString("ja-JP")}）。`);
    } catch (error) {
      render(`再開できませんでした: ${error.message}`);
    }
  }

  function performCardAction(action, lane) {
    const ids = validSelectedIds();
    if (!ids.length) return;
    try {
      if (action === "play") {
        if (ids.length !== 1) throw new Error("プレイする手札を1枚選んでください。");
        playWithMana(ids[0]);
      }
      else if (action === "cost") openManaPanel("cost", ids[0]);
      else if (action === "wish-play") openManaPanel("cost", ids[0]);
      else if (action.startsWith("alternative:")) commit(castGoldfishAlternative(state, ids[0], action.slice(12)), "唱えるための選択をしてください。");
      else if (action.startsWith("cast-mode:")) finishPlay(ids[0], { [action.endsWith("kicker") ? "kicked" : action.slice(10)]: true, confirmLife: true });
      else if (action === "prepared") {
        let next = castPreparedGoldfishSpell(state, ids[0], { autoTap: find("#goldfish-auto-tap").checked });
        if (autoTriggers) next = advanceGoldfishGame(next, { autoOrder });
        panelName = ""; commit(next, "準備呪文を唱えました。", { select: [], primary: "" });
      }
      else if (action === "batch-bombardment") {
        const sourceId = ids[0], picked = new Set();
        showPanel("mana"); manaMode = "batch";
        const content = find("#goldfish-mana-content"); content.replaceChildren();
        find("#goldfish-mana-title").textContent = "相手へまとめて砲撃";
        const hint = document.createElement("p"); hint.textContent = "選んだ順に1体ずつ生け贄にし、相手へ1点ずつ。途中の誘発も解決し、必要な選択で止まります。"; content.append(hint);
        const button = document.createElement("button"); button.type = "button"; button.className = "primary-button";
        const update = () => { button.textContent = `選んだ${picked.size}体を相手へ順に生け贄`; button.disabled = !picked.size; };
        for (const c of state.battlefield.filter(c => /\bCreature\b/.test(c.faceDown ? "Creature" : cardFace(c)?.typeLine || c.typeLine))) {
          const label = document.createElement("label"); label.className = "goldfish-batch-option";
          const input = document.createElement("input"); input.type = "checkbox"; input.addEventListener("change", () => { input.checked ? picked.add(c.id) : picked.delete(c.id); update(); });
          label.append(input, document.createTextNode(`${cardDisplayName(c)} (${goldfishCharacteristics(state, c).power}/${goldfishCharacteristics(state, c).toughness})`)); content.append(label);
        }
        button.addEventListener("click", () => { try { const next = advanceGoldfishGame(beginGoldfishSacrificeSequence(state, sourceId, [...picked]), { autoOrder }); panelName = ""; commit(next, next.rules.lastAction, { select: [], primary: "" }); } catch (error) { ui.message.textContent = error.message; } });
        content.append(button); update();
      }
      else if (action.startsWith("combo:")) {
        showPanel("mana"); manaMode = "combo"; manaCardId = ids[0];
        const content = find("#goldfish-mana-content"); content.replaceChildren();
        find("#goldfish-mana-title").textContent = "コンボの反復";
        const label = document.createElement("label"); label.textContent = "反復回数（1〜100）";
        const input = document.createElement("input"); input.type = "number"; input.min = "1"; input.max = "100"; input.value = "20"; input.setAttribute("aria-label", "コンボの反復回数"); label.append(input); content.append(label);
        const button = document.createElement("button"); button.type = "button"; button.textContent = "指定回数をまとめて処理";
        button.addEventListener("click", () => { try { const next = repeatGoldfishCombo(state, action.slice(6), ids[0], Number(input.value)); panelName = ""; commit(next, next.rules.lastAction); } catch (error) { ui.message.textContent = error.message; } });
        content.append(button);
      }
      else if (action === "exile-play") {
        if (findCard(ids[0]).card.playPermission?.kind === "plot") finishPlay(ids[0], { fromExile: true });
        else openManaPanel(goldfishPlayDestination(findCard(ids[0]).card) === "battlefield" ? "land" : "cost", ids[0]);
      }
      else if (action.startsWith("ability:")) {
        let next = activateGoldfishAction(state, ids[0], action.slice(8), { autoTap: find("#goldfish-auto-tap").checked });
        const message = next.rules.lastAction;
        if (autoTriggers) next = advanceGoldfishGame(next, { autoOrder });
        panelName = "";
        commit(next, next.rules.lastAction === message ? message : `${message} ${next.rules.lastAction}`, { select: [ids[0]], primary: ids[0] });
      }
      else if (action === "flashback") playWithMana(ids[0]);
      else if (action === "bauble") commit(activateGoldfishBauble(state, ids[0]), "ガラクタで見る山札を選んでください。");
      else if (action === "effects") openManaPanel("effects", ids[0]);
      else if (action === "tap") toggleSelectedTapped();
      else if (action === "copy") commit(copyGoldfishCards(state, ids), `${ids.length}枚のコピーを戦場に作りました。`, { select: [] , primary: "" });
      else if (action === "face") commit(cycleGoldfishFace(state, ids), "カードの面を切り替えました。", { select: ids, primary: ids[0] });
      else if (action === "facedown") commit(toggleGoldfishFaceDown(state, ids), "表向き／裏向きを切り替えました。", { select: ids, primary: ids[0] });
      else if (action === "group") commit(groupGoldfishCards(state, ids), "選択カードのグループ状態を切り替えました。", { select: ids, primary: ids[0] });
      else if (action === "fetch") startFetch();
      else moveThroughUi(ids, action, { lane });
    } catch (error) {
      render(error.message);
    }
  }

  function applyCounter(name, delta) {
    const ids = selectedBattlefieldIds();
    try {
      commit(adjustGoldfishCounter(state, ids, name, delta), `${ids.length}枚の「${name}」カウンターを${delta > 0 ? "増やし" : "減らし"}ました。`, { select: ids, primary: ids[0] });
    } catch (error) {
      render(error.message);
    }
  }

  function showGameLog(openValue) {
    hideHoverPreview();
    panelName = "";
    fetchSourceId = "";
    surveilSourceName = "";
    gameLogOpen = Boolean(openValue);
    libraryOpen = false;
    shortcutsOpen = false;
    render(gameLogOpen ? "ゲームログの各行を押すと、その時点の盤面を再表示できます。" : "");
    find(gameLogOpen ? "#goldfish-close-game-log" : "#goldfish-tools-toggle").focus();
  }

  function showShortcuts(openValue) {
    hideHoverPreview();
    panelName = "";
    fetchSourceId = "";
    surveilSourceName = "";
    shortcutsOpen = Boolean(openValue);
    libraryOpen = false;
    gameLogOpen = false;
    render();
    find(shortcutsOpen ? "#goldfish-close-shortcuts" : "#goldfish-shortcuts").focus();
  }

  find("#goldfish-close").addEventListener("click", close);
  find("#goldfish-tools-toggle").addEventListener("click", () => showPanel(panelName === "tools" ? "" : "tools"));
  find("#goldfish-cast-count").addEventListener("click", () => showPanel("rules"));
  find("#goldfish-panel-shade").addEventListener("click", () => showPanel());
  for (const button of dialog.querySelectorAll("[data-goldfish-close-panel]")) button.addEventListener("click", () => showPanel());
  for (const button of dialog.querySelectorAll("[data-goldfish-open-zone]")) button.addEventListener("click", () => showPanel("zones", button.dataset.goldfishOpenZone));
  find("#goldfish-resolve").addEventListener("click", () => {
    try {
      const card = state.stack.at(-1);
      let next = resolveGoldfishSpell(state);
      if (autoTriggers) next = advanceGoldfishGame(next, { autoOrder });
      panelName = "";
      commit(next, next.rules.pendingChoice ? `${card.name}：選択を待っています。` : next.rules.lastAction, { select: [], primary: "" });
    } catch (error) { render(error.message); }
  });
  dialog.addEventListener("close", () => {
    openRequestId += 1;
    if (state) saveSession(false);
  });
  ui.preview.addEventListener("error", () => { ui.preview.hidden = true; });
  ui.playDraw.addEventListener("change", () => resetGame("先手・後手を変更して初手から始めます。", { preserveHistory: true }));
  find("#goldfish-sideboard-edit").addEventListener("click", () => {
    if (!state) return;
    if (state.rules.pendingChoice) { render("今の選択を終えてからサイドを入れ替えてください。"); return; }
    renderSideboardEditor(find("#goldfish-sideboard-editor"), state, counts => {
      const next = sideboardGoldfishGame(state, counts);
      panelName = "";
      commit(next, "入れ替えた構成で初手7枚を引きました。戻すで元の盤面に戻れます。", { select: [], primary: "", closeLibrary: true });
    });
    showPanel("sideboard");
  });
  find("#goldfish-new-game").addEventListener("click", () => {
    if (!state || dialog.classList.contains("is-loading-goldfish")) return;
    resetGame("最初から始めます。直前の盤面へ戻すには ↶ 戻す。", { preserveHistory: true });
  });
  find("#goldfish-mulligan").addEventListener("click", () => {
    try {
      state = mulliganGoldfish(state);
      selectedIds = new Set();
      primaryId = "";
      mulliganBottomIds = new Set();
      libraryOpen = false;
      pushTimeline(`マリガン${state.mulligans}回目。`);
      render();
    } catch (error) {
      render(error.message);
    }
  });
  find("#goldfish-keep").addEventListener("click", () => {
    try {
      commit(keepGoldfishHand(state, [...mulliganBottomIds]), "初手をキープしました。", { select: [], primary: "", closeLibrary: true });
    } catch (error) {
      render(error.message);
    }
  });
  find("#goldfish-draw").addEventListener("click", () => {
    try { const next = drawGoldfishCard(state); commit(next, next.rules.lastAction, { select: [], primary: "" }); }
    catch (error) { render(error.message); }
  });
  find("#goldfish-next-turn").addEventListener("click", () => {
    try {
      let next = nextGoldfishTurn(state);
      if (autoTriggers) next = advanceGoldfishGame(next, { autoOrder });
      commit(next, next.rules.lastAction, { select: [], primary: "" });
    } catch (error) { render(error.message); }
  });
  find("#goldfish-end-turn").addEventListener("click", () => {
    try {
      let next = endGoldfishTurn(state);
      if (autoTriggers) next = advanceGoldfishGame(next, { autoOrder });
      panelName = "";
      commit(next, next.rules.lastAction, { select: [], primary: "" });
    } catch (error) { render(error.message); }
  });
  find("#goldfish-attack").addEventListener("click", () => {
    try {
      let next = state.rules.combat ? resolveGoldfishCombat(state) : beginGoldfishCombat(state);
      if (autoTriggers) next = advanceGoldfishGame(next, { autoOrder });
      commit(next, next.rules.pendingChoice?.type === "attack" ? "攻撃クリーチャーを選んでください。" : next.rules.lastAction, { select: [], primary: "" });
    } catch (error) { render(error.message); }
  });
  find("#goldfish-untap-all").addEventListener("click", () => {
    commit(untapGoldfishAll(state), "戦場をすべてアンタップしました。", { select: validSelectedIds(), primary: primaryId });
  });
  find("#goldfish-tap-all").addEventListener("click", () => {
    const ids = state.battlefield.map((card) => card.id);
    try { commit(setGoldfishCardsTapped(state, ids, true), "戦場をすべてタップしました。", { select: ids, primary: ids[0] }); }
    catch (error) { render(error.message); }
  });
  ui.undo.addEventListener("click", undo);
  ui.redo.addEventListener("click", redo);
  find("#goldfish-save").addEventListener("click", () => { saveSession(true); render("現在の盤面と操作履歴を保存しました。"); });
  ui.resume.addEventListener("click", resumeSession);
  ui.openLibrary.addEventListener("click", () => setLibraryOpen(!libraryOpen));
  find("#goldfish-close-library").addEventListener("click", () => setLibraryOpen(false));
  find("#goldfish-fetch-fail").addEventListener("click", () => finishFetch(null));
  ui.libraryQuery.addEventListener("input", () => {
    librarySearch = ui.libraryQuery.value;
    renderLibrary();
  });
  for (const tab of dialog.querySelectorAll("[data-goldfish-library-mode]")) {
    tab.addEventListener("click", () => {
      libraryMode = tab.dataset.goldfishLibraryMode;
      if (libraryMode === "top" && !topCardIds.length) topCardIds = peekGoldfishLibrary(state, topCountValue()).map((card) => card.id);
      render();
    });
  }
  find("#goldfish-shuffle-library").addEventListener("click", () => {
    try { commit(shuffleGoldfishLibrary(state), "山札をシャッフルしました。", { closeLibrary: true, select: [], primary: "" }); }
    catch (error) { render(error.message); }
  });
  for (const button of dialog.querySelectorAll("[data-goldfish-top-action]")) {
    button.addEventListener("click", () => {
      const count = topCountValue();
      const action = button.dataset.goldfishTopAction;
      try {
        if (action === "peek") {
          topCardIds = peekGoldfishLibrary(state, count).map((card) => card.id);
          render(`山札の上から${topCardIds.length}枚を見ています。順番は変えていません。`);
        } else if (action === "hand") {
          const next = drawGoldfishCards(state, count);
          commit(next, next.rules.lastAction, { select: [], primary: "" });
          topCardIds = [];
        } else {
          const moved = Math.min(Math.max(1, Math.trunc(count) || 1), state.library.length);
          commit(moveGoldfishTopCards(state, count, action), `山札の上から${moved}枚を${ZONE_LABELS[action]}へ移しました。`, { select: [], primary: "" });
          topCardIds = [];
        }
      } catch (error) { render(error.message); }
    });
  }

  for (const target of dialog.querySelectorAll("[data-goldfish-drop]")) {
    const acceptDrop = (event) => {
      if (!canDropOn(target)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      target.classList.add("is-drop-over");
    };
    target.addEventListener("dragenter", acceptDrop);
    target.addEventListener("dragover", acceptDrop);
    target.addEventListener("dragleave", (event) => {
      if (!target.contains(event.relatedTarget)) target.classList.remove("is-drop-over");
    });
    target.addEventListener("drop", (event) => {
      event.preventDefault();
      if (!canDropOn(target)) { clearDropHighlights(); return; }
      const currentDrag = dragged;
      const cardTarget = event.target.closest(".goldfish-card-chip");
      const destination = target.dataset.goldfishDrop;
      const lane = target.dataset.battlefieldLane || "";
      let index;
      if (destination === "battlefield" && cardTarget) {
        const laneCards = state.battlefield.filter((card) => card.lane === lane);
        index = Number(cardTarget.dataset.cardPosition);
        const bounds = cardTarget.getBoundingClientRect();
        if (event.clientX > bounds.left + bounds.width / 2) index += 1;
        const selected = new Set(currentDrag?.cardIds || []);
        index -= laneCards.slice(0, index).filter((card) => selected.has(card.id)).length;
      }
      clearDropHighlights();
      if (!currentDrag) return;
      try {
        if (currentDrag.sourceZone === "exile" && ["stack", "battlefield"].includes(destination) && currentDrag.cardIds.length === 1 && state.exile.find((card) => card.id === currentDrag.cardIds[0])?.playPermission?.kind === "plot") {
          finishPlay(currentDrag.cardIds[0], { fromExile: true });
        } else if (currentDrag.sourceZone === "hand" && ["stack", "battlefield"].includes(destination)) {
          if (currentDrag.cardIds.length !== 1) throw new Error("唱えるカードは1枚ずつスタックへ置いてください。");
          const id = currentDrag.cardIds[0];
          if (destination === "stack" && goldfishPlayDestination(findCard(id).card) === "battlefield") throw new Error("土地はスタックを使わず、戦場へ出します。");
          playWithMana(id);
        } else {
          panelName = "";
          moveThroughUi(currentDrag.cardIds, destination, { lane, index, shuffleLibrary: currentDrag.shuffleLibrary, closeLibrary: currentDrag.sourceZone !== "library" || currentDrag.shuffleLibrary });
        }
      } catch (error) { render(error.message); }
    });
  }

  ui.cardActions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-goldfish-action]");
    if (button) performCardAction(button.dataset.goldfishAction, button.dataset.battlefieldLane);
  });
  for (const button of dialog.querySelectorAll(".goldfish-library-returns [data-goldfish-action]")) button.addEventListener("click", () => performCardAction(button.dataset.goldfishAction));
  find("#goldfish-clear-selection").addEventListener("click", () => {
    selectedIds = new Set();
    primaryId = "";
    showPanel();
  });
  for (const button of dialog.querySelectorAll("[data-goldfish-counter]")) {
    button.addEventListener("click", () => applyCounter(button.dataset.goldfishCounter, Number(button.dataset.goldfishDelta)));
  }
  find("#goldfish-counter-add").addEventListener("click", () => applyCounter(find("#goldfish-counter-name").value, 1));
  find("#goldfish-counter-remove").addEventListener("click", () => applyCounter(find("#goldfish-counter-name").value, -1));
  find("#goldfish-pt-apply").addEventListener("click", () => {
    const ids = selectedBattlefieldIds();
    try { commit(setGoldfishPowerToughness(state, ids, ui.power.value, ui.toughness.value), `${ids.length}枚のP/T表示を変更しました。`, { select: ids, primary: ids[0] }); }
    catch (error) { render(error.message); }
  });
  find("#goldfish-note-apply").addEventListener("click", () => {
    const ids = selectedBattlefieldIds();
    try { commit(setGoldfishCardNote(state, ids, ui.note.value), `${ids.length}枚のメモを更新しました。`, { select: ids, primary: ids[0] }); }
    catch (error) { render(error.message); }
  });

  for (const button of dialog.querySelectorAll("[data-goldfish-tracker-player]")) {
    button.addEventListener("click", () => {
      const player = button.dataset.goldfishTrackerPlayer;
      const tracker = button.dataset.goldfishTracker;
      const delta = Number(button.dataset.goldfishDelta);
      const value = state.players[player][tracker] + delta;
      commit(setGoldfishTracker(state, player, tracker, value), `${player === "self" ? "自分" : "相手"}の${tracker === "life" ? "ライフ" : tracker === "poison" ? "毒" : "エネルギー"}を${delta > 0 ? "+" : ""}${delta}しました。`);
    });
  }
  for (const input of dialog.querySelectorAll("[data-goldfish-tracker-input]")) {
    input.addEventListener("change", () => {
      const [player, tracker] = input.dataset.goldfishTrackerInput.split(":");
      commit(setGoldfishTracker(state, player, tracker, input.value), `${player === "self" ? "自分" : "相手"}の値を${input.value}にしました。`);
    });
  }

  find("#goldfish-token-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const name = find("#goldfish-token-name").value;
      const count = Number(find("#goldfish-token-count").value);
      const next = createGoldfishToken(state, {
        name,
        typeLine: find("#goldfish-token-type").value,
        power: find("#goldfish-token-power").value,
        toughness: find("#goldfish-token-toughness").value,
        count
      });
      panelName = "";
      commit(next, `${name || "トークン"}を${Math.max(1, Math.min(50, Math.trunc(count) || 1))}体作りました。`, { select: [], primary: "" });
    } catch (error) { render(error.message); }
  });
  for (const button of dialog.querySelectorAll("[data-goldfish-random]")) {
    button.addEventListener("click", () => {
      const kind = button.dataset.goldfishRandom;
      const result = kind === "coin" ? (Math.random() < 0.5 ? "表" : "裏") : String(1 + Math.floor(Math.random() * Number(kind)));
      ui.randomResult.textContent = result;
      pushTimeline(`${kind === "coin" ? "コイン" : `d${kind}`}の結果: ${result}`);
      render(`${kind === "coin" ? "コイン" : `d${kind}`}の結果は ${result} です。`);
    });
  }

  find("#goldfish-toggle-game-log").addEventListener("click", () => showGameLog(!gameLogOpen));
  find("#goldfish-close-game-log").addEventListener("click", () => showGameLog(false));
  find("#goldfish-shortcuts").addEventListener("click", () => showShortcuts(!shortcutsOpen));
  find("#goldfish-close-shortcuts").addEventListener("click", () => showShortcuts(false));

  document.addEventListener("keydown", (event) => {
    if (!dialog.open || !state || dialog.classList.contains("is-loading-goldfish")) return;
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    if (target === ui.libraryQuery && event.key === "ArrowDown" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing) {
      event.preventDefault();
      ui.libraryResults.querySelector(".goldfish-library-result-actions button")?.focus();
      return;
    }
    const nativeActivation = Boolean(target?.closest?.("button, a, summary")) && !target?.closest?.("[data-card-id]");
    const action = goldfishShortcut(event, { editing, nativeActivation });
    const focusedCard = target?.closest?.("[data-card-id]");
    if (action === "play" && focusedCard && focusedCard.dataset.cardZone !== "hand") return;
    if (!action || (action === "escape" && !libraryOpen && !gameLogOpen && !shortcutsOpen && !panelName && !selectedIds.size)) return;
    event.preventDefault();
    try {
      if ((state.rules.pendingChoice || !state.rules.castCountKnown) && !["undo", "redo"].includes(action)) {
        ui.message.textContent = "選択を終えてください。やり直すときは Ctrl+Z／↶ 戻す。";
        return;
      }
      if (action === "escape") {
        if (libraryOpen) setLibraryOpen(false);
        else if (gameLogOpen) showGameLog(false);
        else if (shortcutsOpen) showShortcuts(false);
        else if (panelName) showPanel();
        else { selectedIds.clear(); primaryId = ""; renderSelection(); }
      } else if (action === "undo") undo();
      else if (action === "redo") redo();
      else if (fetchSourceId || surveilSourceName) { ui.message.textContent = "土地／諜報を選ぶか、Escで閉じてください。"; }
      else if (action === "help") showShortcuts(!shortcutsOpen);
      else if (action === "library") setLibraryOpen(!libraryOpen);
      else if (action === "primary") {
        if (libraryOpen || gameLogOpen || shortcutsOpen || panelName) return;
        const button = find(state.phase === "opening" ? "#goldfish-keep" : state.stack.length ? "#goldfish-resolve" : "#goldfish-next-turn");
        if (!button.disabled) button.click();
      }
      else if (action === "play") {
        if (!libraryOpen && !gameLogOpen && !shortcutsOpen && !panelName) {
          if (focusedCard) { selectedIds = new Set([focusedCard.dataset.cardId]); primaryId = focusedCard.dataset.cardId; }
          performCardAction("play");
        }
      }
      else if (action.startsWith("hand:")) {
        const card = state.hand[Number(action.slice(5)) - 1];
        if (card) {
          selectCard(card, "hand");
          [...find("#goldfish-hand").querySelectorAll("[data-card-id]")].find((button) => button.dataset.cardId === card.id)?.focus();
        }
      } else if (action === "fetch") startFetch();
      else if (["battlefield", "graveyard", "exile", "hand", "tap"].includes(action)) performCardAction(action);
      else {
        const button = find(`#goldfish-${{ untap: "untap-all", draw: "draw", next: "next-turn", keep: "keep", mulligan: "mulligan" }[action]}`);
        if (!button.disabled) button.click();
      }
    } catch (error) { render(error.message); }
  });

  async function resumeLast() {
    const link = lastGoldfishSession(localStorage);
    if (!link) throw new Error("このブラウザーに再開できるゲームがありません。");
    const saved = parseGoldfishSave(localStorage.getItem(link.key));
    const deck = deckFromGoldfishSave(saved);
    if (saved.signature !== deckSignature(deck) || link.key !== `${SAVE_PREFIX}${saved.signature}`) throw new Error("保存したゲームとデッキが一致しません。元のリストから開いてください。");
    await open(deck, link.title);
  }

  return { open, close, resumeLast, lastSession: () => lastGoldfishSession(localStorage) };
}
