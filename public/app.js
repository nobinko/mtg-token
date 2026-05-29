const form = document.querySelector("#search-form");
const formatSelect = document.querySelector("#format");
const maxPagesInput = document.querySelector("#max-pages");
const setSortSelect = document.querySelector("#set-sort");
const sourcesInput = document.querySelector("#sources");
const statusEl = document.querySelector("#status");
const summaryEl = document.querySelector("#summary");
const deckSummaryEl = document.querySelector("#deck-summary");
const resultsEl = document.querySelector("#results");
const searchButton = document.querySelector("#search-button");
const setTemplate = document.querySelector("#set-template");
const objectTemplate = document.querySelector("#object-template");

let defaultSources = {};
let lastGroups = [];

function setStatus(message) {
  statusEl.textContent = message;
}

function sourceLines() {
  return sourcesInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function updateSourcesForFormat() {
  const urls = defaultSources[formatSelect.value] || [];
  sourcesInput.value = urls.join("\n");
}

function renderSummary(data) {
  summaryEl.hidden = false;
  const failed = data.errors.length ? ` / 巡回失敗 ${data.errors.length}件` : "";
  summaryEl.textContent = `${data.scannedPages.length}ページを巡回、検索デッキ/リスト ${data.searchedDeckCount || 0}件、候補 ${data.candidateCount}枚から、採用カード ${data.cards.length}枚、バルクから探す現物 ${data.objects.length}種類を検出${failed}。`;
}

function renderDeckSummary(decks) {
  deckSummaryEl.hidden = false;
  deckSummaryEl.replaceChildren();

  const heading = document.createElement("div");
  heading.className = "deck-summary-heading";
  heading.textContent = `検索したデッキ/リスト: ${decks.length}件`;
  deckSummaryEl.append(heading);

  const list = document.createElement("div");
  list.className = "deck-chip-list";
  for (const deck of decks.slice(0, 36)) {
    const link = document.createElement("a");
    link.className = "deck-chip";
    link.href = deck.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = deck.title || deck.url;
    list.append(link);
  }
  deckSummaryEl.append(list);
}

function renderTags(container, labels) {
  container.replaceChildren();
  for (const label of labels) {
    const span = document.createElement("span");
    span.className = "hint";
    span.textContent = label;
    container.append(span);
  }
}

function sortGroups(groups) {
  const direction = setSortSelect.value === "asc" ? 1 : -1;
  return [...groups].sort((a, b) => {
    const dateA = a.releasedAt || "0000-00-00";
    const dateB = b.releasedAt || "0000-00-00";
    const dateOrder = dateA.localeCompare(dateB) * direction;
    if (dateOrder) return dateOrder;
    return a.setName.localeCompare(b.setName);
  });
}

function renderObject(object) {
  const node = objectTemplate.content.cloneNode(true);
  const imageLink = node.querySelector(".image-link");
  const img = node.querySelector("img");
  const title = node.querySelector("h3");
  const jp = node.querySelector(".jp");
  const kind = node.querySelector(".kind");
  const type = node.querySelector(".type");
  const note = node.querySelector(".note");
  const hints = node.querySelector(".hints");
  const sourceCardList = node.querySelector(".source-card-list");
  const sourceList = node.querySelector(".source-list");

  imageLink.href = object.scryfallUri;
  img.src = object.image;
  img.alt = object.name;
  title.textContent = object.name;
  jp.textContent = object.japaneseName || "日本語名未取得";
  kind.textContent = object.category || object.kind;
  type.textContent = object.typeLine;
  note.textContent = object.note || "";
  note.hidden = !object.note;

  renderTags(hints, [object.kind, object.category].filter(Boolean));

  for (const sourceCard of object.sourceCards || []) {
    const item = document.createElement("li");
    item.className = "source-card-item";
    if (sourceCard.image) {
      const thumb = document.createElement("img");
      thumb.src = sourceCard.image;
      thumb.alt = "";
      thumb.loading = "lazy";
      item.append(thumb);
    }
    const link = document.createElement("a");
    link.href = sourceCard.scryfallUri;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = sourceCard.japaneseName
      ? `${sourceCard.name} / ${sourceCard.japaneseName}`
      : sourceCard.name;
    item.append(link);
    sourceCardList.append(item);
  }

  for (const source of object.sources || []) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = source;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = source;
    item.append(link);
    sourceList.append(item);
  }

  return node;
}

function renderGroups(groups) {
  resultsEl.replaceChildren();
  const sortedGroups = sortGroups(groups);

  if (!sortedGroups.length) {
    resultsEl.textContent = "一致する現物は見つかりませんでした。巡回元URLやページ数を増やして再検索してください。";
    return;
  }

  for (const group of sortedGroups) {
    const groupNode = setTemplate.content.cloneNode(true);
    const section = groupNode.querySelector(".set-group");
    const code = groupNode.querySelector(".set-code");
    const title = groupNode.querySelector("h2");
    const count = groupNode.querySelector(".count");
    const grid = groupNode.querySelector(".object-grid");

    code.textContent = group.releasedAt ? `${group.set} / ${group.releasedAt}` : group.set;
    title.textContent = group.setName;
    count.textContent = `${group.count}種類`;

    for (const object of group.objects) {
      grid.append(renderObject(object));
    }

    resultsEl.append(section);
  }
}

async function runSearch(event) {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  summaryEl.hidden = true;
  deckSummaryEl.hidden = true;
  deckSummaryEl.replaceChildren();
  resultsEl.replaceChildren();
  setStatus("検索中。初回はScryfall照合、関連トークン取得、各サイト巡回で少し時間がかかります。");

  try {
    const response = await fetch("/api/token-cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        format: formatSelect.value,
        sources: sourceLines(),
        maxChildPages: Number(maxPagesInput.value)
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "検索に失敗しました。");

    lastGroups = data.groups || [];
    setStatus("検索完了。発売日の昇順/降順を切り替えながら、バルクのエキスパンション順に探せます。");
    renderSummary(data);
    renderDeckSummary(data.searchedDecks || []);
    renderGroups(lastGroups);
  } catch (error) {
    setStatus(`エラー: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function init() {
  const response = await fetch("/api/default-sources");
  defaultSources = await response.json();
  updateSourcesForFormat();
}

formatSelect.addEventListener("change", updateSourcesForFormat);
setSortSelect.addEventListener("change", () => renderGroups(lastGroups));
form.addEventListener("submit", runSearch);
searchButton.addEventListener("click", runSearch);
init().catch((error) => setStatus(`初期化エラー: ${error.message}`));
