const form = document.querySelector("#search-form");
const formatSelect = document.querySelector("#format");
const targetDateInput = document.querySelector("#target-date");
const eventScaleSelect = document.querySelector("#event-scale");
const usageThresholdInput = document.querySelector("#usage-threshold");
const confidenceInput = document.querySelector("#confidence");
const maxPagesInput = document.querySelector("#max-pages");
const viewModeSelect = document.querySelector("#view-mode");
const setSortSelect = document.querySelector("#set-sort");
const hideCheckedInput = document.querySelector("#hide-checked");
const useCacheInput = document.querySelector("#use-cache");
const refreshCacheInput = document.querySelector("#refresh-cache");
const sourcesInput = document.querySelector("#sources");
const statusEl = document.querySelector("#status");
const samplingSummaryEl = document.querySelector("#sampling-summary");
const environmentSummaryEl = document.querySelector("#environment-summary");
const summaryEl = document.querySelector("#summary");
const deckSummaryEl = document.querySelector("#deck-summary");
const resultsEl = document.querySelector("#results");
const searchButton = document.querySelector("#search-button");
const printButton = document.querySelector("#print-button");
const clearCacheButton = document.querySelector("#clear-cache-button");
const setTemplate = document.querySelector("#set-template");
const objectTemplate = document.querySelector("#object-template");

const checkedStorageKey = "mtg-token-finder.checked";

let defaultSources = {};
let lastGroups = [];
let lastObjects = [];
let checkedObjects = readCheckedObjects();

const eventScaleProfiles = {
  spotlight: {
    threshold: 1,
    confidence: 95,
    label: "大型オープンで、一般的に構築で使われる1%以上の発生源を拾う想定"
  },
  premier: {
    threshold: 0.5,
    confidence: 95,
    label: "PT/RC級で、かなり薄い0.5%以上の発生源まで拾う想定"
  },
  medium: {
    threshold: 2,
    confidence: 95,
    label: "中規模競技で、2%以上の発生源を拾う想定"
  },
  local: {
    threshold: 5,
    confidence: 95,
    label: "店舗/小規模で、5%以上の発生源を拾う想定"
  }
};

function readCheckedObjects() {
  try {
    return new Set(JSON.parse(localStorage.getItem(checkedStorageKey) || "[]"));
  } catch {
    return new Set();
  }
}

function saveCheckedObjects() {
  localStorage.setItem(checkedStorageKey, JSON.stringify([...checkedObjects]));
}

function objectKey(object) {
  return `${object.set}|${object.name}|${object.typeLine}`;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function recommendedDeckCount(usagePercent, confidencePercent) {
  const p = Number(usagePercent) / 100;
  const confidence = Number(confidencePercent) / 100;
  if (!Number.isFinite(p) || !Number.isFinite(confidence) || p <= 0 || p >= 1 || confidence <= 0 || confidence >= 1) {
    return 0;
  }
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - p));
}

function updateSamplingRecommendation({ applyDeckCount = false } = {}) {
  const recommended = recommendedDeckCount(usageThresholdInput.value, confidenceInput.value);
  const maxAllowed = Number(maxPagesInput.max || recommended);
  const current = Number(maxPagesInput.value || 0);
  const profile = eventScaleProfiles[eventScaleSelect.value];

  if (applyDeckCount && recommended) {
    maxPagesInput.value = String(Math.min(recommended, maxAllowed));
  }

  const actualCurrent = Number(maxPagesInput.value || 0);
  const capped = recommended > maxAllowed;
  const status = actualCurrent >= recommended ? "足りています" : "不足しています";
  const cappedText = capped ? `。ただし現在の上限は${maxAllowed}件です` : "";
  samplingSummaryEl.replaceChildren();

  const headline = document.createElement("div");
  headline.className = "sampling-headline";
  headline.textContent = `おすすめ検索数: ${recommended}デッキ`;
  samplingSummaryEl.append(headline);

  const currentLine = document.createElement("div");
  currentLine.className = actualCurrent >= recommended ? "sampling-ok" : "sampling-warn";
  currentLine.textContent = `現在の設定: ${actualCurrent}デッキ（${status}）${cappedText}`;
  samplingSummaryEl.append(currentLine);

  const explanation = document.createElement("div");
  explanation.className = "sampling-explanation";
  explanation.textContent = `${profile?.label || "手動設定"}。この数を見ると、使用率${usageThresholdInput.value}%以上のトークン発生源を${confidenceInput.value}%以上の確率で見つけられる想定です。`;
  samplingSummaryEl.append(explanation);
}

function applyEventScaleProfile() {
  const profile = eventScaleProfiles[eventScaleSelect.value];
  if (!profile) {
    updateSamplingRecommendation();
    return;
  }
  usageThresholdInput.value = String(profile.threshold);
  confidenceInput.value = String(profile.confidence);
  updateSamplingRecommendation({ applyDeckCount: true });
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
  const cache = data.cacheStats || { hits: 0, network: 0, staleHits: 0 };
  const checkedCount = lastObjects.filter((object) => checkedObjects.has(objectKey(object))).length;
  summaryEl.textContent = `${data.scannedPages.length}ページを巡回、検索デッキ/リスト ${data.searchedDeckCount || 0}件、ヒットした生成カード ${data.cards.length}枚、現物 ${data.objects.length}種類を検出。チェック済み ${checkedCount}/${data.objects.length}。Scryfall照合母集団 ${data.candidateCount}枚。キャッシュ ${cache.hits}件 / 新規取得 ${cache.network}件${cache.staleHits ? ` / 代替使用 ${cache.staleHits}件` : ""}${failed}。`;
}

function renderEnvironmentSummary(environment) {
  environmentSummaryEl.hidden = false;
  environmentSummaryEl.replaceChildren();

  const title = document.createElement("div");
  title.className = "environment-title";
  title.textContent = `環境判定: ${environment.startDate || "不明"} から ${environment.targetDate} までのデッキを対象`;
  environmentSummaryEl.append(title);

  const reason = document.createElement("p");
  reason.textContent = environment.reason || "";
  environmentSummaryEl.append(reason);

  const list = document.createElement("div");
  list.className = "environment-events";
  const events = [environment.resetEvent, ...(environment.contextEvents || [])].filter(Boolean);
  for (const event of events) {
    const link = document.createElement("a");
    link.href = event.sourceUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `${event.date}: ${event.title}${event.affectsFormat ? "" : "（Standard変更なし）"}`;
    list.append(link);
  }
  environmentSummaryEl.append(list);
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
  for (const deck of decks.slice(0, 48)) {
    const link = document.createElement("a");
    link.className = "deck-chip";
    link.href = deck.pageUrl || deck.url;
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

function sortObjects(objects) {
  return [...objects].sort((a, b) => {
    const countOrder = (b.deckCount || 0) - (a.deckCount || 0);
    if (countOrder) return countOrder;
    const categoryOrder = String(a.category || "").localeCompare(String(b.category || ""), "ja");
    if (categoryOrder) return categoryOrder;
    return a.name.localeCompare(b.name);
  });
}

function visibleObjects(objects) {
  if (!hideCheckedInput.checked) return objects;
  return objects.filter((object) => !checkedObjects.has(objectKey(object)));
}

function groupsByKind(objects) {
  const byKind = new Map();
  for (const object of sortObjects(objects)) {
    const key = object.category || object.kind || "その他";
    if (!byKind.has(key)) {
      byKind.set(key, {
        set: key,
        setName: key,
        releasedAt: "",
        count: 0,
        objects: []
      });
    }
    const group = byKind.get(key);
    group.objects.push(object);
    group.count += 1;
  }
  return [...byKind.values()];
}

function renderSourcePreview(container, sourceCards) {
  container.replaceChildren();
  const cards = sortObjects(sourceCards || []).slice(0, 4);
  if (!cards.length) return;

  const label = document.createElement("span");
  label.className = "source-preview-label";
  label.textContent = "出すカード";
  container.append(label);

  for (const card of cards) {
    const link = document.createElement("a");
    link.className = "source-mini";
    link.href = card.scryfallUri;
    link.target = "_blank";
    link.rel = "noreferrer";
    if (card.image) {
      const img = document.createElement("img");
      img.src = card.image;
      img.alt = "";
      img.loading = "lazy";
      link.append(img);
    }
    const span = document.createElement("span");
    span.textContent = card.name;
    link.append(span);
    container.append(link);
  }
}

function renderObject(object) {
  const node = objectTemplate.content.cloneNode(true);
  const article = node.querySelector(".card");
  const picked = node.querySelector(".picked-checkbox");
  const imageLink = node.querySelector(".image-link");
  const img = node.querySelector("img");
  const title = node.querySelector("h3");
  const jp = node.querySelector(".jp");
  const kind = node.querySelector(".kind");
  const type = node.querySelector(".type");
  const deckCount = node.querySelector(".deck-count");
  const setPill = node.querySelector(".set-pill");
  const note = node.querySelector(".note");
  const hints = node.querySelector(".hints");
  const sourcePreview = node.querySelector(".source-preview");
  const sourceCardList = node.querySelector(".source-card-list");
  const sourceList = node.querySelector(".source-list");
  const key = objectKey(object);

  article.dataset.objectKey = key;
  article.classList.toggle("is-checked", checkedObjects.has(key));
  picked.checked = checkedObjects.has(key);
  picked.addEventListener("change", () => {
    if (picked.checked) checkedObjects.add(key);
    else checkedObjects.delete(key);
    saveCheckedObjects();
    article.classList.toggle("is-checked", picked.checked);
    if (hideCheckedInput.checked && picked.checked) {
      article.hidden = true;
      updateVisibleGroupCounts();
    }
  });

  imageLink.href = object.scryfallUri;
  img.src = object.image;
  img.alt = object.name;
  title.textContent = object.name;
  jp.textContent = object.japaneseName || "日本語名未取得";
  kind.textContent = object.category || object.kind;
  type.textContent = object.typeLine;
  deckCount.textContent = `${object.deckCount || 0} decks`;
  setPill.textContent = `${object.set}${object.releasedAt ? ` / ${object.releasedAt}` : ""}`;
  note.textContent = object.note || "";
  note.hidden = !object.note;

  renderTags(hints, [object.kind, object.category].filter(Boolean));
  renderSourcePreview(sourcePreview, object.sourceCards);

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
      ? `${sourceCard.name} / ${sourceCard.japaneseName} (${sourceCard.deckCount || 0})`
      : `${sourceCard.name} (${sourceCard.deckCount || 0})`;
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

function updateVisibleGroupCounts() {
  for (const group of resultsEl.querySelectorAll(".set-group")) {
    const cards = [...group.querySelectorAll(".card")].filter((card) => !card.hidden);
    const count = group.querySelector(".count");
    if (count) count.textContent = `${cards.length}種類`;
    group.hidden = cards.length === 0;
  }
}

function renderGroups(groups) {
  resultsEl.replaceChildren();
  const sortedGroups = viewModeSelect.value === "kind" ? groups : sortGroups(groups);
  const visibleGroupData = sortedGroups
    .map((group) => ({ ...group, objects: visibleObjects(group.objects), count: visibleObjects(group.objects).length }))
    .filter((group) => group.objects.length);

  if (!visibleGroupData.length) {
    resultsEl.textContent = hideCheckedInput.checked
      ? "未チェックの現物はありません。"
      : "一致する現物は見つかりませんでした。巡回元URLや検索デッキ/リスト数を増やして再検索してください。";
    return;
  }

  for (const group of visibleGroupData) {
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

function renderCurrentResults() {
  const groups = viewModeSelect.value === "kind" ? groupsByKind(lastObjects) : lastGroups;
  renderGroups(groups);
}

async function runSearch(event) {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  environmentSummaryEl.hidden = true;
  environmentSummaryEl.replaceChildren();
  summaryEl.hidden = true;
  deckSummaryEl.hidden = true;
  deckSummaryEl.replaceChildren();
  resultsEl.replaceChildren();
  setStatus("検索中。200件規模だとScryfall照合、関連トークン取得、各サイト巡回でしばらく時間がかかります。");

  try {
    const response = await fetch("/api/token-cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        format: formatSelect.value,
        targetDate: targetDateInput.value,
        sources: sourceLines(),
        maxChildPages: Number(maxPagesInput.value),
        useCache: useCacheInput.checked,
        refreshCache: refreshCacheInput.checked
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "検索に失敗しました。");

    lastGroups = data.groups || [];
    lastObjects = data.objects || [];
    setStatus("検索完了。チェックしながら、バルクのエキスパンション順または種類別で探せます。");
    renderEnvironmentSummary(data.environment || {});
    renderSummary(data);
    renderDeckSummary(data.searchedDecks || []);
    renderCurrentResults();
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
  applyEventScaleProfile();
}

async function clearCache() {
  clearCacheButton.disabled = true;
  setStatus("巡回キャッシュを削除しています。");
  try {
    const response = await fetch("/api/cache/clear", { method: "POST" });
    if (!response.ok) throw new Error("キャッシュ削除に失敗しました。");
    setStatus("巡回キャッシュを削除しました。次の検索は新規取得になります。");
  } catch (error) {
    setStatus(`エラー: ${error.message}`);
  } finally {
    clearCacheButton.disabled = false;
  }
}

formatSelect.addEventListener("change", updateSourcesForFormat);
eventScaleSelect.addEventListener("change", applyEventScaleProfile);
usageThresholdInput.addEventListener("input", () => {
  eventScaleSelect.value = "custom";
  updateSamplingRecommendation();
});
confidenceInput.addEventListener("input", () => {
  eventScaleSelect.value = "custom";
  updateSamplingRecommendation();
});
maxPagesInput.addEventListener("input", () => updateSamplingRecommendation());
setSortSelect.addEventListener("change", renderCurrentResults);
viewModeSelect.addEventListener("change", renderCurrentResults);
hideCheckedInput.addEventListener("change", renderCurrentResults);
form.addEventListener("submit", runSearch);
searchButton.addEventListener("click", runSearch);
printButton.addEventListener("click", () => window.print());
clearCacheButton.addEventListener("click", clearCache);
init().catch((error) => setStatus(`初期化エラー: ${error.message}`));
