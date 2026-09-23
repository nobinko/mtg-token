import {
  adjustGoldfishCounter,
  cloneGoldfishState,
  copyGoldfishCards,
  createGoldfishGame,
  createGoldfishToken,
  cycleGoldfishFace,
  drawGoldfishCard,
  drawGoldfishCards,
  groupGoldfishCards,
  keepGoldfishHand,
  moveGoldfishCards,
  moveGoldfishTopCards,
  mulliganGoldfish,
  nextGoldfishTurn,
  peekGoldfishLibrary,
  restoreGoldfishGame,
  setGoldfishCardNote,
  setGoldfishCardsTapped,
  setGoldfishPowerToughness,
  setGoldfishTracker,
  shuffleGoldfishLibrary,
  takeGoldfishCardsFromLibrary,
  toggleGoldfishFaceDown,
  untapGoldfishAll
} from "./goldfish.js";

const ZONES = ["library", "hand", "battlefield", "graveyard", "exile", "sideboard", "command"];
const ZONE_LABELS = {
  library: "山札",
  libraryTop: "山札の上",
  libraryBottom: "山札の下",
  hand: "手札",
  battlefield: "戦場",
  graveyard: "墓地",
  exile: "追放",
  sideboard: "サイドボード",
  command: "統率／相棒"
};
const LANE_LABELS = { other: "その他", creature: "クリーチャー", land: "土地" };
const MAX_TIMELINE = 60;
const SAVE_PREFIX = "mtg-token-finder.goldfish.v2.";

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
  let topCardIds = [];
  let gameLogOpen = false;
  let shortcutsOpen = false;
  let timeline = [];
  let timelineIndex = -1;
  let openRequestId = 0;

  function topCountValue() {
    const count = Math.max(1, Math.min(100, Math.trunc(Number(ui.topCount.value)) || 1));
    ui.topCount.value = String(count);
    return count;
  }

  function allLocations() {
    const result = new Map();
    if (!state) return result;
    for (const zone of ZONES) {
      for (const card of state[zone] || []) result.set(card.id, { card, zone });
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
      localStorage.setItem(storageKey, JSON.stringify(payload));
      ui.saveStatus.textContent = `${manual ? "保存" : "自動保存"} ${displayTime(payload.savedAt)}`;
      ui.resume.disabled = false;
      return true;
    } catch (error) {
      ui.saveStatus.textContent = `保存失敗: ${error.message}`;
      return false;
    }
  }

  function saveSession(manual = false) {
    if (!state || !storageKey) return;
    const savedAt = new Date().toISOString();
    const fullPayload = {
      version: 2,
      signature: deckSignature(activeDeck),
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
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
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
    state = nextState;
    selectedIds = new Set(select);
    primaryId = primary;
    mulliganBottomIds = new Set();
    if (closeLibrary) {
      libraryOpen = false;
      librarySearch = "";
      topCardIds = [];
    }
    pushTimeline(message);
    render(message);
  }

  function restoreTimeline(index, message) {
    if (!timeline[index]) return;
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
    if (!state || state.phase !== "playing") {
      event.preventDefault();
      return;
    }
    const cardIds = dragIdsFor(card);
    dragged = { cardIds, sourceZone: zone, shuffleLibrary };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cardIds.join(","));
    event.currentTarget.classList.add("is-dragging");
    for (const target of dialog.querySelectorAll("[data-goldfish-drop]")) target.classList.add("is-drop-ready");
  }

  function cardAriaLabel(card) {
    const parts = [card.name];
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
    const power = card.powerOverride || cardFace(card)?.power || card.power;
    const toughness = card.toughnessOverride || cardFace(card)?.toughness || card.toughness;
    if (power || toughness) {
      const badge = document.createElement("span");
      badge.className = "pt-badge";
      badge.textContent = `${power || "?"}/${toughness || "?"}`;
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
    button.draggable = state?.phase === "playing";
    if (button.draggable) button.classList.add("is-draggable");
    if (visual) button.classList.add("goldfish-card-visual");
    if (card.tapped) button.classList.add("is-tapped");
    if (card.faceDown) button.classList.add("is-face-down");
    if (selectedIds.has(card.id)) button.classList.add("is-selected");
    if (mulliganBottomIds.has(card.id)) button.classList.add("is-bottom-choice");
    if (card.groupId) button.dataset.groupId = card.groupId;
    button.setAttribute("aria-label", cardAriaLabel(card));
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
      } else {
        const image = document.createElement("img");
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
      caption.textContent = card.name;
      surface.append(caption);
      appendCardBadges(surface, card);
      button.append(surface);
    } else {
      button.textContent = card.name;
    }

    button.title = button.draggable
      ? `${cardAriaLabel(card)} — ドラッグして移動／ダブルクリックでタップ`
      : cardAriaLabel(card);
    button.addEventListener("click", (event) => selectCard(card, zone, event));
    button.addEventListener("dblclick", (event) => {
      event.preventDefault();
      if (zone !== "battlefield" || state.phase !== "playing") return;
      if (!selectedIds.has(card.id)) {
        selectedIds = new Set([card.id]);
        primaryId = card.id;
      }
      toggleSelectedTapped();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!selectedIds.has(card.id)) {
        selectedIds = new Set([card.id]);
        primaryId = card.id;
      }
      render("右側でこのカードの操作を選べます。");
    });
    button.addEventListener("dragstart", (event) => beginDrag(event, card, zone, { shuffleLibrary }));
    button.addEventListener("dragend", clearDropHighlights);
    return button;
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
    render();
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
    const destinations = shuffleLibrary
      ? [["battlefield", "戦場"], ["hand", "手札"], ["graveyard", "墓地"], ["exile", "追放"]]
      : [["hand", "手札"], ["battlefield", "戦場"], ["libraryTop", "上"], ["libraryBottom", "下"]];
    for (const [destination, label] of destinations) {
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
    for (const tab of dialog.querySelectorAll("[data-goldfish-library-mode]")) {
      tab.setAttribute("aria-selected", String(tab.dataset.goldfishLibraryMode === libraryMode));
    }
    ui.librarySearchPanel.hidden = libraryMode !== "search";
    ui.libraryTopPanel.hidden = libraryMode !== "top";
    if (!libraryOpen) return;

    if (libraryMode === "search") {
      if (ui.libraryQuery.value !== librarySearch) ui.libraryQuery.value = librarySearch;
      const groups = groupedLibrary(state.library);
      const query = librarySearch.trim().toLocaleLowerCase();
      const visible = query ? groups.filter((group) => group.name.toLocaleLowerCase().includes(query)) : groups;
      ui.librarySummary.textContent = `山札 ${state.library.length}枚 / ${groups.length}種類` + (query ? ` — ${visible.length}種類に絞り込み` : "");
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
      empty.textContent = "「見る」で山札の上を表示します。";
      ui.topResults.append(empty);
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
    ui.library.hidden = !libraryOpen;
    ui.gameLog.hidden = !gameLogOpen;
    ui.shortcutHelp.hidden = !shortcutsOpen;
    ui.inspector.hidden = libraryOpen || gameLogOpen || shortcutsOpen;
    ui.layout.classList.toggle("is-side-panel-open", libraryOpen || gameLogOpen || shortcutsOpen);
    find("#goldfish-toggle-game-log").setAttribute("aria-expanded", String(gameLogOpen));
    find("#goldfish-shortcuts").setAttribute("aria-expanded", String(shortcutsOpen));
    renderLibrary();
    if (gameLogOpen) renderGameLog();
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

    ui.selectedName.textContent = selected.length > 1 ? `${selected.length}枚を選択中` : primary.card.name;
    const counters = Object.entries(primary.card.counters || {}).map(([name, value]) => `${name}:${value}`).join(" / ");
    ui.selectedDetail.textContent = [
      ZONE_LABELS[primary.zone] || primary.zone,
      primary.card.lane ? LANE_LABELS[primary.card.lane] : "",
      primary.card.typeLine,
      counters,
      primary.card.note
    ].filter(Boolean).join(" ／ ");
    ui.preview.src = cardImageUrl(primary.card);
    ui.preview.hidden = primary.card.faceDown;
    ui.cardActions.hidden = opening;

    const battlefieldOnly = selected.every(({ zone }) => zone === "battlefield");
    const battlefieldAny = selected.some(({ zone }) => zone === "battlefield");
    const zoneSet = new Set(selected.map(({ zone }) => zone));
    for (const button of ui.cardActions.querySelectorAll("button[data-goldfish-action]")) {
      const action = button.dataset.goldfishAction;
      button.disabled = false;
      if (action === "tap") button.disabled = !battlefieldAny;
      if (action === "group") button.disabled = !battlefieldOnly || selected.length < 2;
      if (action === "fetch") button.disabled = selected.length !== 1 || primary.zone !== "battlefield";
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
    find("#goldfish-turn").textContent = state.turn || "—";
    find("#goldfish-library-count").textContent = String(state.library.length);
    renderTrackerInputs();
    renderZone("goldfish-hand", "goldfish-hand-count", state.hand, "hand", { visual: true });
    renderBattlefield();
    renderZone("goldfish-graveyard", "goldfish-graveyard-count", state.graveyard, "graveyard", { visual: true });
    renderZone("goldfish-exile", "goldfish-exile-count", state.exile, "exile", { visual: true });
    renderZone("goldfish-sideboard", "goldfish-sideboard-count", state.sideboard, "sideboard");
    renderZone("goldfish-command", "goldfish-command-count", state.command, "command");

    const opening = state.phase === "opening";
    find("#goldfish-mulligan").disabled = !opening || state.mulligans >= 7;
    find("#goldfish-keep").disabled = !opening || mulliganBottomIds.size !== state.bottomRequired;
    find("#goldfish-draw").disabled = opening;
    find("#goldfish-next-turn").disabled = opening;
    find("#goldfish-untap-all").disabled = opening || !state.battlefield.length;
    find("#goldfish-tap-all").disabled = opening || !state.battlefield.length;
    ui.playDraw.disabled = !opening;
    ui.undo.disabled = timelineIndex <= 0;
    ui.redo.disabled = timelineIndex >= timeline.length - 1;
    ui.openLibrary.disabled = opening;
    if (opening) libraryOpen = false;
    ui.resume.disabled = !hasSavedSession();
    renderPanels();
    renderInspector(opening);

    if (message) ui.message.textContent = message;
    else if (opening && state.bottomRequired) {
      ui.message.textContent = `マリガン${state.mulligans}回。手札から戻す${state.bottomRequired}枚を選択してください（${mulliganBottomIds.size}/${state.bottomRequired}）。`;
    } else if (opening) {
      ui.message.textContent = "初手7枚です。マリガンするか、そのままキープしてください。";
    } else {
      ui.message.textContent = `${state.onThePlay ? "先手" : "後手"}、ターン${state.turn}。ドラッグで移動、ダブルクリックまたはTでタップできます。`;
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
    let next;
    if (fromLibrary && shuffleLibrary && !destination.startsWith("library")) {
      next = takeGoldfishCardsFromLibrary(state, cardIds, destination, Math.random, { lane, index });
    } else {
      next = moveGoldfishCards(state, cardIds, destination, { lane, index });
    }
    const names = locations.map(({ card }) => card.name);
    const subject = names.length === 1 ? `「${names[0]}」` : `${names.length}枚`;
    const laneText = destination === "battlefield" && lane ? `の${LANE_LABELS[lane]}` : "";
    const suffix = fromLibrary && shuffleLibrary ? "。山札をシャッフルしました。" : "。";
    commit(next, `${subject}を${ZONE_LABELS[destination] || destination}${laneText}へ移しました${suffix}`, {
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
    commit(setGoldfishCardsTapped(state, ids), `${ids.length}枚のタップ状態を切り替えました。`, { select: ids, primary: ids[0] });
  }

  function setLibraryOpen(open, mode = libraryMode) {
    if (open && state?.phase !== "playing") {
      render("初手をキープしてから山札を操作してください。");
      return;
    }
    libraryOpen = Boolean(open);
    libraryMode = mode;
    gameLogOpen = false;
    shortcutsOpen = false;
    if (libraryOpen && libraryMode === "search") librarySearch = "";
    render(libraryOpen ? (libraryMode === "search" ? "サーチ後は自動でシャッフルします。" : "山札の上を確認できます。") : "");
    if (libraryOpen && libraryMode === "search") requestAnimationFrame(() => ui.libraryQuery.focus());
  }

  function resetGame(message = "") {
    if (!activeDeck) return;
    state = createGoldfishGame(activeDeck.mainboard, {
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
    topCardIds = [];
    gameLogOpen = false;
    shortcutsOpen = false;
    timeline = [];
    timelineIndex = -1;
    pushTimeline("新しい初手を引きました。");
    render(message || "シャッフルして初手7枚を引きました。");
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
    const metadata = new Map((data.cards || []).filter((card) => !card.unavailable).map((card) => [normalizeName(card.name), card]));
    const merge = (rows) => (rows || []).map((row) => ({ ...row, ...(metadata.get(normalizeName(row.name)) || {}) }));
    return { ...deck, mainboard: merge(deck.mainboard), sideboard: merge(deck.sideboard) };
  }

  async function open(deck, title) {
    const requestId = ++openRequestId;
    activeDeck = deck;
    storageKey = `${SAVE_PREFIX}${deckSignature(deck)}`;
    ui.title.textContent = `${title || deck.title || "デッキ"} — ひとり回し`;
    ui.message.textContent = "土地・クリーチャー等を判別するカード情報を取得しています…";
    ui.saveStatus.textContent = hasSavedSession() ? "保存済みゲームあり" : "未保存";
    ui.resume.disabled = !hasSavedSession();
    if (!dialog.open) dialog.showModal();
    dialog.classList.add("is-loading-goldfish");
    try {
      activeDeck = await enrichDeck(deck);
      if (requestId !== openRequestId) return;
      dialog.classList.remove("is-loading-goldfish");
      if (hasSavedSession()) resumeSession();
      else resetGame();
    } catch (error) {
      if (requestId !== openRequestId) return;
      activeDeck = deck;
      dialog.classList.remove("is-loading-goldfish");
      if (hasSavedSession()) {
        resumeSession();
        ui.message.textContent = `保存ゲームを再開しました。カード情報の更新だけ失敗しています: ${error.message}`;
      } else {
        resetGame(`カード種別の取得に失敗しました。手動で各エリアへ置けます: ${error.message}`);
      }
    }
  }

  function close() {
    if (state) saveSession(false);
    libraryOpen = false;
    gameLogOpen = false;
    shortcutsOpen = false;
    if (dialog.open) dialog.close();
  }

  function resumeSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved?.version !== 2 || saved.signature !== deckSignature(activeDeck)) throw new Error("このデッキの保存データがありません。");
      const restoredTimeline = (Array.isArray(saved.timeline) ? saved.timeline : []).slice(-MAX_TIMELINE).map((entry) => ({
        at: entry.at || saved.savedAt,
        message: String(entry.message || "保存盤面").slice(0, 240),
        state: restoreGoldfishGame(entry.state),
        selectedIds: Array.isArray(entry.selectedIds) ? entry.selectedIds.slice(0, 100) : [],
        primaryId: String(entry.primaryId || "")
      }));
      state = restoreGoldfishGame(saved.state);
      timeline = restoredTimeline.length ? restoredTimeline : [timelineEntry("保存盤面")];
      timelineIndex = Math.max(0, Math.min(Number(saved.timelineIndex) || 0, timeline.length - 1));
      state = cloneGoldfishState(timeline[timelineIndex]?.state || state);
      selectedIds = new Set(saved.selectedIds || []);
      primaryId = saved.primaryId || "";
      mulliganBottomIds = new Set();
      libraryOpen = false;
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
      if (action === "tap") toggleSelectedTapped();
      else if (action === "copy") commit(copyGoldfishCards(state, ids), `${ids.length}枚のコピーを戦場に作りました。`, { select: [] , primary: "" });
      else if (action === "face") commit(cycleGoldfishFace(state, ids), "カードの面を切り替えました。", { select: ids, primary: ids[0] });
      else if (action === "facedown") commit(toggleGoldfishFaceDown(state, ids), "表向き／裏向きを切り替えました。", { select: ids, primary: ids[0] });
      else if (action === "group") commit(groupGoldfishCards(state, ids), "選択カードのグループ状態を切り替えました。", { select: ids, primary: ids[0] });
      else if (action === "fetch") {
        const target = findCard(primaryId);
        let next = moveGoldfishCards(state, [primaryId], "graveyard");
        next = setGoldfishTracker(next, "self", "life", next.players.self.life - 1);
        commit(next, `「${target.card.name}」を墓地へ置き、ライフを1支払いました。`, { select: [], primary: "" });
        setLibraryOpen(true, "search");
      } else moveThroughUi(ids, action, { lane });
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
    gameLogOpen = Boolean(openValue);
    libraryOpen = false;
    shortcutsOpen = false;
    render(gameLogOpen ? "ゲームログの各行を押すと、その時点の盤面を再表示できます。" : "");
  }

  function showShortcuts(openValue) {
    shortcutsOpen = Boolean(openValue);
    libraryOpen = false;
    gameLogOpen = false;
    render();
  }

  find("#goldfish-close").addEventListener("click", close);
  dialog.addEventListener("close", () => {
    openRequestId += 1;
    if (state) saveSession(false);
  });
  ui.preview.addEventListener("error", () => { ui.preview.hidden = true; });
  ui.playDraw.addEventListener("change", () => resetGame());
  find("#goldfish-new-game").addEventListener("click", () => resetGame());
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
    try { commit(drawGoldfishCard(state), "1枚引きました。", { select: [], primary: "" }); }
    catch (error) { render(error.message); }
  });
  find("#goldfish-next-turn").addEventListener("click", () => {
    try {
      const next = nextGoldfishTurn(state);
      commit(next, `ターン${next.turn}。全アンタップして1枚引きました。`, { select: [], primary: "" });
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
          commit(drawGoldfishCards(state, count), `${Math.min(count, state.library.length)}枚引きました。`, { select: [], primary: "" });
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
    target.addEventListener("dragover", (event) => {
      if (!dragged || state?.phase !== "playing") return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      target.classList.add("is-drop-over");
    });
    target.addEventListener("dragleave", (event) => {
      if (!target.contains(event.relatedTarget)) target.classList.remove("is-drop-over");
    });
    target.addEventListener("drop", (event) => {
      event.preventDefault();
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
        moveThroughUi(currentDrag.cardIds, destination, { lane, index, shuffleLibrary: currentDrag.shuffleLibrary });
      } catch (error) { render(error.message); }
    });
  }

  ui.cardActions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-goldfish-action]");
    if (button) performCardAction(button.dataset.goldfishAction, button.dataset.battlefieldLane);
  });
  find("#goldfish-clear-selection").addEventListener("click", () => {
    selectedIds = new Set();
    primaryId = "";
    render();
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
    if (!dialog.open || !state) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
    const key = event.key.toLocaleLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    } else if ((event.ctrlKey || event.metaKey) && key === "y") {
      event.preventDefault();
      redo();
    } else if (key === "t") {
      event.preventDefault();
      toggleSelectedTapped();
    } else if (key === "u") {
      event.preventDefault();
      if (state.phase === "playing") commit(untapGoldfishAll(state), "戦場をすべてアンタップしました。");
    } else if (key === "d") {
      event.preventDefault();
      if (state.phase === "playing") commit(drawGoldfishCard(state), "1枚引きました。", { select: [], primary: "" });
    } else if (key === "n") {
      event.preventDefault();
      if (state.phase === "playing") {
        const next = nextGoldfishTurn(state);
        commit(next, `ターン${next.turn}。全アンタップして1枚引きました。`, { select: [], primary: "" });
      }
    } else if (key === "l") {
      event.preventDefault();
      setLibraryOpen(!libraryOpen);
    } else if (event.key === "?") {
      event.preventDefault();
      showShortcuts(!shortcutsOpen);
    }
  });

  return { open, close };
}
