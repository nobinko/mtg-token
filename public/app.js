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
const archetypeSummaryEl = document.querySelector("#archetype-summary");
const tokenSummaryEl = document.querySelector("#token-summary");
const deckSummaryEl = document.querySelector("#deck-summary");
const resultsEl = document.querySelector("#results");
const searchButton = document.querySelector("#search-button");
const printButton = document.querySelector("#print-button");
const clearCacheButton = document.querySelector("#clear-cache-button");
const setTemplate = document.querySelector("#set-template");
const objectTemplate = document.querySelector("#object-template");

const langBtns = document.querySelectorAll(".lang-btn");

const checkedStorageKey = "mtg-token-finder.checked";
const initialDeckSummaryCount = 10;

let defaultSources = {};
let formatOptions = [];
let lastGroups = [];
let lastObjects = [];
let showAllDecks = false;
let lastSearchedDeckCount = 0;
let checkedObjects = readCheckedObjects();
let cardLang = "en"; // "en" | "ja"
let searchRunId = 0;
const logSessionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let activeLogRunId = "";

// ---- ホバーズーム用グローバルプレビュー ----
const hoverPreview = document.createElement("img");
hoverPreview.className = "hover-preview";
hoverPreview.hidden = true;
hoverPreview.alt = "";
document.body.append(hoverPreview);

document.addEventListener("mousemove", (e) => {
  if (hoverPreview.hidden) return;
  const gap = 20;
  const pw = 280;
  const ph = 390; // 488/680 ratio approx
  let x = e.clientX + gap;
  let y = e.clientY - ph / 2;
  if (x + pw > window.innerWidth) x = e.clientX - pw - gap;
  if (y < 0) y = 0;
  if (y + ph > window.innerHeight) y = window.innerHeight - ph;
  hoverPreview.style.left = `${x}px`;
  hoverPreview.style.top = `${y}px`;
});

function showHoverPreview(src) {
  if (!src) return;
  hoverPreview.src = src;
  hoverPreview.hidden = false;
}

function hideHoverPreview() {
  hoverPreview.hidden = true;
  hoverPreview.removeAttribute("src");
}

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
  explanation.textContent = `${profile?.label || "手動設定"}。この数を見ると、使用率${usageThresholdInput.value}%以上のトークン発生源を${confidenceInput.value}%以上の確率で見つけられる想定です。上限600は、0.5%以上のかなり薄い採用まで95%で拾う目安に合わせています。`;
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

function populateFormatSelect(formats) {
  if (!Array.isArray(formats) || !formats.length) return;
  const current = formatSelect.value || formats[0].key;
  formatSelect.replaceChildren();
  for (const format of formats) {
    const option = document.createElement("option");
    option.value = format.key;
    option.textContent = format.label || format.key;
    formatSelect.append(option);
  }
  formatSelect.value = formats.some((format) => format.key === current) ? current : formats[0].key;
}

function renderSummary(data) {
  summaryEl.hidden = false;
  summaryEl.replaceChildren();

  const cache = data.cacheStats || { hits: 0, network: 0, staleHits: 0 };
  const checkedCount = lastObjects.filter((object) => checkedObjects.has(objectKey(object))).length;
  const botBlocked = (data.errors || []).filter((e) => e.message === "bot-challenge").length;
  const realErrors = (data.errors || []).filter((e) => e.message !== "bot-challenge").length;
  const failedText = realErrors ? ` / 巡回失敗 ${realErrors}件` : "";
  const blockedText = botBlocked ? ` / JSブロック ${botBlocked}件` : "";
  const unparsedText = data.unparsedDeckCount ? ` / 抽出失敗デッキ ${data.unparsedDeckCount}件` : "";

  const mainLine = document.createElement("div");
  mainLine.textContent = `${data.scannedPages.length}ページを巡回、検索デッキ/リスト ${data.searchedDeckCount || 0}件、ヒットした生成カード ${data.cards.length}枚、現物 ${data.objects.length}種類を検出。チェック済み ${checkedCount}/${data.objects.length}。Scryfall照合母集団 ${data.candidateCount}枚。キャッシュ ${cache.hits}件 / 新規取得 ${cache.network}件${cache.staleHits ? ` / 代替使用 ${cache.staleHits}件` : ""}${failedText}${blockedText}${unparsedText}。`;
  summaryEl.append(mainLine);

  if (data.sourceExhausted && data.requestedDeckCount && data.searchedDeckCount < data.requestedDeckCount) {
    const exhaustedLine = document.createElement("div");
    exhaustedLine.className = "sampling-warn";
    exhaustedLine.textContent = `要求 ${data.requestedDeckCount}デッキに対して、現在の環境期間内で取得できたデッキは ${data.searchedDeckCount}件です。古いデッキで水増しせず、この件数で集計しています。`;
    summaryEl.append(exhaustedLine);
  }

  // サイト別統計
  const siteStats = data.siteStats || {};
  const sites = Object.entries(siteStats).sort((a, b) => b[1].decks - a[1].decks || b[1].pages - a[1].pages);
  if (sites.length > 0) {
    const siteTable = document.createElement("div");
    siteTable.className = "site-stats";
    const header = document.createElement("span");
    header.className = "site-stats-label";
    header.textContent = "サイト別: ";
    siteTable.append(header);
    for (const [domain, stat] of sites) {
      const chip = document.createElement("span");
      chip.className = "site-stat-chip";
      chip.textContent = `${domain} ${stat.pages}p / ${stat.decks}d`;
      chip.title = `${domain}: ${stat.pages}ページ巡回、${stat.decks}デッキ取得`;
      siteTable.append(chip);
    }
    summaryEl.append(siteTable);
  }
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
    link.textContent = `${event.date}: ${event.title}${event.affectsFormat ? "" : "（このフォーマットは変更なし）"}`;
    list.append(link);
  }
  environmentSummaryEl.append(list);
}

function renderDeckSummary(decks) {
  deckSummaryEl.hidden = false;
  deckSummaryEl.replaceChildren();
  const visibleDecks = showAllDecks ? decks : decks.slice(0, initialDeckSummaryCount);

  const details = document.createElement("details");
  details.className = "summary-disclosure";

  const heading = document.createElement("summary");
  heading.className = "deck-summary-heading";
  heading.textContent = `検索したデッキ/リスト: ${decks.length}件（表示 ${visibleDecks.length}件）`;
  details.append(heading);

  const list = document.createElement("div");
  list.className = "deck-chip-list";
  for (const deck of visibleDecks) {
    const link = document.createElement("a");
    link.className = "deck-chip";
    link.href = deck.pageUrl || deck.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = deck.title || deck.url;
    list.append(link);
  }
  details.append(list);

  if (decks.length > initialDeckSummaryCount) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "deck-toggle";
    toggle.textContent = showAllDecks ? `先頭${initialDeckSummaryCount}件だけ表示` : `全${decks.length}件を表示`;
    toggle.addEventListener("click", () => {
      showAllDecks = !showAllDecks;
      renderDeckSummary(decks);
    });
    details.append(toggle);
  }

  deckSummaryEl.append(details);
}

function renderArchetypeSummary(archetypes) {
  archetypeSummaryEl.hidden = false;
  archetypeSummaryEl.replaceChildren();
  const sortedArchetypes = [...(archetypes || [])].sort((a, b) => (b.count || 0) - (a.count || 0) || String(a.name).localeCompare(String(b.name)));

  const details = document.createElement("details");
  details.className = "summary-disclosure";

  const heading = document.createElement("summary");
  heading.className = "deck-summary-heading";
  heading.textContent = `メタ傾向: ${sortedArchetypes.length}タイプ`;
  details.append(heading);

  const chartWrap = document.createElement("div");
  chartWrap.className = "meta-chart-wrap";
  chartWrap.append(renderMetaChart(sortedArchetypes));

  const list = document.createElement("div");
  list.className = "archetype-list";
  for (const item of sortedArchetypes.slice(0, 10)) {
    const row = document.createElement("div");
    row.className = "archetype-row";
    const color = archetypeColor(item.name);

    const dot = document.createElement("i");
    dot.style.background = color;

    const main = document.createElement("div");
    main.className = "archetype-main";
    const name = document.createElement("span");
    name.className = "archetype-name";
    name.textContent = item.identity?.displayName || item.name;
    main.append(name);

    const details = archetypeIdentityLine(item.identity);
    if (details) {
      const sub = document.createElement("small");
      sub.textContent = details;
      main.append(sub);
    }

    const percent = document.createElement("strong");
    percent.textContent = `${item.percent}%`;

    const count = document.createElement("em");
    count.textContent = `${item.count} decks`;

    row.append(dot, main, percent, count);
    list.append(row);

    const tags = archetypeIdentityTags(item.identity);
    if (tags.length) {
      const tagRow = document.createElement("div");
      tagRow.className = "archetype-tag-row";
      for (const tag of tags.slice(0, 8)) {
        const chip = document.createElement("span");
        chip.textContent = tag;
        tagRow.append(chip);
      }
      list.append(tagRow);
    }
  }
  chartWrap.append(list);
  details.append(chartWrap);
  archetypeSummaryEl.append(details);
}

function macroPlanLabel(value) {
  const labels = {
    aggro: "アグロ",
    midrange: "ミッドレンジ",
    control: "コントロール",
    combo: "コンボ",
    ramp: "ランプ",
    tempo: "テンポ",
    unknown: "不明"
  };
  return labels[String(value || "").toLowerCase()] || value || "";
}

function archetypeIdentityLine(identity) {
  if (!identity) return "";
  const parts = [];
  if (identity.colors?.length) parts.push(identity.colors.join(""));
  if (identity.macroPlan) parts.push(macroPlanLabel(identity.macroPlan));
  if (identity.canonicalName && identity.canonicalName !== identity.displayName) parts.push(identity.canonicalName);
  return parts.join(" / ");
}

function archetypeIdentityTags(identity) {
  if (!identity) return [];
  return [
    ...(identity.engineTags || []).map(engineTagLabel),
    ...(identity.tokenRiskTags || []).map((tag) => `準備:${tokenRiskTagLabel(tag)}`)
  ];
}

function engineTagLabel(tag) {
  const labels = {
    prowess: "果敢",
    spells: "呪文連打",
    tempo: "テンポ",
    lessons: "講義",
    "graveyard-threshold": "墓地条件",
    control: "コントロール",
    elemental: "エレメンタル",
    graveyard: "墓地利用",
    "signature-creature": "キーカード型",
    landfall: "上陸",
    counters: "カウンター",
    creatures: "クリーチャー",
    fliers: "飛行",
    lifelink: "絆魂",
    interaction: "妨害",
    sweepers: "全体除去",
    "card-draw": "ドロー",
    midrange: "ミッドレンジ",
    value: "継続的アドバンテージ",
    removal: "除去",
    reanimator: "リアニメイト",
    combo: "コンボ",
    "big-spell": "大型呪文",
    rhythm: "律動",
    mobilize: "動員",
    tokens: "トークン",
    "go-wide": "横並び",
    aggro: "アグロ",
    burn: "火力",
    discard: "手札破壊"
  };
  return labels[tag] || tag;
}

function tokenRiskTagLabel(tag) {
  const labels = {
    "prowess-token-check": "果敢系トークン確認",
    "plot-check": "計画カード確認",
    "lesson-engine-check": "講義エンジン確認",
    "spells-engine-check": "呪文系補助確認",
    "signature-engine-check": "キーカード由来を確認",
    "counter-dice-ok": "カウンターはダイス管理",
    "signature-token-check": "専用トークン確認",
    "low-token-risk": "現物リスク低",
    "emblem-check": "紋章確認",
    "value-engine-check": "継続効果確認",
    "graveyard-engine-check": "墓地系補助確認",
    "combo-piece-check": "コンボ部品確認",
    "creature-token-check": "クリーチャー・トークン確認",
    "warrior-token-high": "戦士トークン優先"
  };
  return labels[tag] || tag;
}

function renderTokenSummary(objects) {
  tokenSummaryEl.hidden = false;
  tokenSummaryEl.replaceChildren();

  const heading = document.createElement("div");
  heading.className = "deck-summary-heading";
  heading.textContent = "トークン頻度";
  tokenSummaryEl.append(heading);

  const list = document.createElement("div");
  list.className = "token-rank-list";
  for (const object of sortObjects(objects).slice(0, 12)) {
    const priority = tokenPriority(object);
    const row = document.createElement("div");
    row.className = `token-rank-row ${priority.className}`;
    row.innerHTML = `<span>${object.name}</span><strong>${priority.percent.toFixed(1)}%</strong><em>${object.deckCount || 0}/${lastSearchedDeckCount || 0} decks</em><b>${priority.label}</b>`;
    list.append(row);
  }
  tokenSummaryEl.append(list);
}

function archetypeColor(name) {
  const palette = ["#176a63", "#b7791f", "#6d5bd0", "#c2410c", "#2563eb", "#7f1d1d", "#4d7c0f", "#be185d", "#0f766e", "#64748b", "#9a3412"];
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function polarToCartesian(cx, cy, r, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) };
}

function donutSegment(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function renderMetaChart(archetypes) {
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("class", "meta-chart");
  svg.setAttribute("viewBox", "0 0 220 220");
  svg.setAttribute("role", "img");

  const top = archetypes.slice(0, 10);
  const total = top.reduce((sum, item) => sum + item.count, 0) || 1;
  let angle = 0;
  for (const item of top) {
    const span = item.count / total * 360;
    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("d", donutSegment(110, 110, 82, angle, angle + span));
    path.setAttribute("stroke", archetypeColor(item.name));
    path.setAttribute("stroke-width", "36");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "butt");
    const title = document.createElementNS(svgNs, "title");
    title.textContent = `${item.name}: ${item.percent}%`;
    path.append(title);
    svg.append(path);
    angle += span;
  }

  const center = document.createElementNS(svgNs, "text");
  center.setAttribute("x", "110");
  center.setAttribute("y", "105");
  center.setAttribute("text-anchor", "middle");
  center.setAttribute("class", "meta-chart-main");
  center.textContent = `${archetypes.length}`;
  svg.append(center);

  const sub = document.createElementNS(svgNs, "text");
  sub.setAttribute("x", "110");
  sub.setAttribute("y", "128");
  sub.setAttribute("text-anchor", "middle");
  sub.setAttribute("class", "meta-chart-sub");
  sub.textContent = "types";
  svg.append(sub);

  return svg;
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

function tokenPriority(object) {
  const percent = lastSearchedDeckCount ? (object.deckCount || 0) / lastSearchedDeckCount * 100 : 0;
  if (percent >= 10) return { label: "よく出る", className: "priority-high", percent };
  if (percent >= 3) return { label: "注意", className: "priority-mid", percent };
  return { label: "念のため", className: "priority-low", percent };
}

function activeImageSource(item) {
  if (cardLang === "ja" && item.imageJa) {
    return {
      label: item.imageJaSourceLabel || "日本語画像",
      source: item.imageJaSource || "",
      url: item.imageJaSourceUrl || ""
    };
  }
  return {
    label: item.imageSourceLabel || "画像",
    source: item.imageSource || "",
    url: item.imageSourceUrl || ""
  };
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

function groupsBySetClient(objects) {
  const groups = [];
  const bySet = new Map();

  for (const object of objects) {
    const key = `${object.set}|${object.setName}`;
    if (!bySet.has(key)) {
      const group = { set: object.set, setName: object.setName, releasedAt: object.releasedAt || "", count: 0, objects: [] };
      bySet.set(key, group);
      groups.push(group);
    }
    const group = bySet.get(key);
    group.objects.push(object);
    group.count += 1;
    if (!group.releasedAt || (object.releasedAt && object.releasedAt < group.releasedAt)) {
      group.releasedAt = object.releasedAt;
    }
  }

  return groups;
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
      const miniSrc = (cardLang === "ja" && card.imageJa) ? card.imageJa : card.image;
      const imageSource = activeImageSource(card);
      link.dataset.imageEn = card.image;
      link.dataset.imageJa = card.imageJa || "";
      link.dataset.imageSourceLabel = card.imageSourceLabel || "";
      link.dataset.imageJaSourceLabel = card.imageJaSourceLabel || "";
      const img = document.createElement("img");
      img.src = miniSrc;
      img.alt = "";
      img.title = `画像:${imageSource.label}`;
      img.loading = "lazy";
      link.append(img);
      const preview = document.createElement("img");
      preview.className = "source-mini-preview";
      preview.src = miniSrc;
      preview.alt = "";
      preview.title = `画像:${imageSource.label}`;
      preview.loading = "lazy";
      link.append(preview);
    }
    const span = document.createElement("span");
    const archetypeText = (card.archetypes || []).slice(0, 2).map((item) => item.name).join(", ");
    span.textContent = archetypeText ? `${card.name} / ${archetypeText}` : card.name;
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
  article.dataset.imageEn = object.image || "";
  article.dataset.imageJa = object.imageJa || "";
  article.dataset.imageSourceLabel = object.imageSourceLabel || "";
  article.dataset.imageSourceUrl = object.imageSourceUrl || "";
  article.dataset.imageJaSourceLabel = object.imageJaSourceLabel || "";
  article.dataset.imageJaSourceUrl = object.imageJaSourceUrl || "";
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
  const activeSrc = (cardLang === "ja" && object.imageJa) ? object.imageJa : object.image;
  const imageSource = activeImageSource(object);
  img.src = activeSrc;
  img.alt = object.name;
  img.title = imageSource.label;
  imageLink.addEventListener("mouseenter", () => showHoverPreview(img.src));
  imageLink.addEventListener("mouseleave", hideHoverPreview);
  title.textContent = object.name;
  jp.textContent = object.japaneseName || `名称確認: ${object.category || "トークン"}`;
  kind.textContent = object.category || object.kind;
  type.textContent = object.typeLine;
  const priority = tokenPriority(object);
  deckCount.textContent = `${priority.label}: ${object.deckCount || 0}/${lastSearchedDeckCount || 0} decks (${priority.percent.toFixed(1)}%)`;
  deckCount.classList.add(priority.className);
  setPill.textContent = `${object.set}${object.releasedAt ? ` / ${object.releasedAt}` : ""}`;
  note.textContent = object.note || "";
  note.hidden = !object.note;

  renderTags(hints, [object.kind, object.category, `画像:${imageSource.label}`].filter(Boolean));
  const bar = document.createElement("div");
  bar.className = "token-frequency";
  const fill = document.createElement("span");
  fill.style.width = `${Math.min(priority.percent, 100)}%`;
  bar.append(fill);
  hints.append(bar);
  renderSourcePreview(sourcePreview, object.sourceCards);

  for (const sourceCard of object.sourceCards || []) {
    const item = document.createElement("li");
    item.className = "source-card-item";
    item.dataset.imageEn = sourceCard.image || "";
    item.dataset.imageJa = sourceCard.imageJa || "";
    item.dataset.imageSourceLabel = sourceCard.imageSourceLabel || "";
    item.dataset.imageSourceUrl = sourceCard.imageSourceUrl || "";
    item.dataset.imageJaSourceLabel = sourceCard.imageJaSourceLabel || "";
    item.dataset.imageJaSourceUrl = sourceCard.imageJaSourceUrl || "";
    if (sourceCard.image) {
      const sourceCardImageSource = activeImageSource(sourceCard);
      const thumb = document.createElement("img");
      thumb.src = (cardLang === "ja" && sourceCard.imageJa) ? sourceCard.imageJa : sourceCard.image;
      thumb.alt = "";
      thumb.title = `画像:${sourceCardImageSource.label}`;
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
  const groups = viewModeSelect.value === "kind" ? groupsByKind(lastObjects) : groupsBySetClient(lastObjects);
  renderGroups(groups);
}

function uniqueSourceCards(objects) {
  const byName = new Map();
  for (const object of objects) {
    for (const card of object.sourceCards || []) {
      if (card.name && !byName.has(card.name)) byName.set(card.name, { name: card.name, set: card.set });
    }
  }
  return [...byName.values()];
}

function objectAssetRequests(objects) {
  return objects.map((object) => ({
    key: objectKey(object),
    name: object.name,
    kind: object.kind,
    typeLine: object.typeLine,
    sourceNames: (object.sourceCards || []).map((card) => card.name).filter(Boolean)
  }));
}

function mergeEnrichedAssets(enrichment) {
  const sourceByName = new Map((enrichment.sourceCards || []).map((card) => [card.name, card]));
  const objectByKey = new Map((enrichment.objects || []).map((object) => [object.key, object]));

  lastObjects = lastObjects.map((object) => {
    const enrichedObject = objectByKey.get(objectKey(object));
    const nextObject = enrichedObject ? { ...object, ...enrichedObject } : { ...object };
    nextObject.sourceCards = (nextObject.sourceCards || []).map((card) => {
      const enrichedCard = sourceByName.get(card.name);
      return enrichedCard ? { ...card, ...enrichedCard } : card;
    });
    return nextObject;
  });
}

async function enrichCurrentAssets(runId) {
  if (!lastObjects.length) return;
  const logRunId = activeLogRunId;
  try {
    setStatus("検索結果を表示しました。日本語画像とカード名を裏で補完しています。");
    const response = await fetch("/api/enrich-card-assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        logRunId,
        sourceCards: uniqueSourceCards(lastObjects),
        objects: objectAssetRequests(lastObjects)
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "画像補完に失敗しました。");
    if (runId !== searchRunId) return;
    mergeEnrichedAssets(data);
    renderTokenSummary(lastObjects);
    renderCurrentResults();
    setStatus("検索完了。日本語画像とカード名の補完も反映しました。");
  } catch (error) {
    if (runId !== searchRunId) return;
    setStatus(`検索結果を表示しました。画像/日本語名の補完は未完了です: ${error.message}`);
  }
}

async function runSearch(event) {
  event.preventDefault();
  const runId = searchRunId + 1;
  searchRunId = runId;
  activeLogRunId = `${logSessionId}-${runId}`;
  const button = searchButton;
  button.disabled = true;
  environmentSummaryEl.hidden = true;
  environmentSummaryEl.replaceChildren();
  summaryEl.hidden = true;
  archetypeSummaryEl.hidden = true;
  archetypeSummaryEl.replaceChildren();
  tokenSummaryEl.hidden = true;
  tokenSummaryEl.replaceChildren();
  deckSummaryEl.hidden = true;
  deckSummaryEl.replaceChildren();
  resultsEl.replaceChildren();
  logContent.replaceChildren();
  appendLog({ line: "この検索のログだけを表示します。", runId: activeLogRunId }, { force: true });
  setStatus("検索中。数百件規模だとScryfall照合、関連トークン取得、各サイト巡回でしばらく時間がかかります。");

  try {
    const response = await fetch("/api/token-cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        logRunId: activeLogRunId,
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
    lastSearchedDeckCount = data.searchedDeckCount || 0;
    showAllDecks = false;
    setStatus("検索完了。チェックしながら、バルクのエキスパンション順または種類別で探せます。");
    renderEnvironmentSummary(data.environment || {});
    renderSummary(data);
    renderArchetypeSummary(data.archetypes || []);
    renderTokenSummary(lastObjects);
    renderDeckSummary(data.searchedDecks || []);
    renderCurrentResults();
    if (data.assetsDeferred) {
      enrichCurrentAssets(runId);
    }
  } catch (error) {
    setStatus(`エラー: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

// ---- ログパネル ----
const logPanel = document.querySelector("#log-panel");
const logContent = document.querySelector("#log-content");
const logDot = document.querySelector("#log-dot");
const logClearBtn = document.querySelector("#log-clear-btn");
const logToggleBtn = document.querySelector("#log-toggle-btn");
const logPanelHeader = document.querySelector("#log-panel-header");

let logCollapsed = true;

const appEl = document.querySelector(".app");

function setLogCollapsed(collapsed) {
  logCollapsed = collapsed;
  logPanel.classList.toggle("log-panel-collapsed", collapsed);
  logToggleBtn.textContent = collapsed ? "▲" : "▼";
  appEl.style.paddingBottom = collapsed ? "72px" : "290px";
  if (!collapsed) logContent.scrollTop = logContent.scrollHeight;
}

logPanelHeader.addEventListener("click", (e) => {
  if (e.target === logClearBtn) return;
  setLogCollapsed(!logCollapsed);
});

logClearBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  logContent.replaceChildren();
});

function classifyLog(line) {
  if (line.startsWith("[ERROR]")) return "log-error";
  if (line.includes("✗")) return "log-warn";
  if (line.includes("cache=miss") || line.includes("network=")) return "log-network";
  if (line.includes("[crawl] batch")) return "log-batch";
  if (line.includes("[crawl]")) return "log-crawl";
  if (line.includes("[scryfall]") || line.includes("scryfall")) return "log-scryfall";
  return "log-default";
}

function parseLogEntry(data) {
  if (typeof data !== "string") return data;
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed.line === "string") return parsed;
  } catch {
    // Older servers and local client messages can still be plain strings.
  }
  return { line: data, runId: "" };
}

function appendLog(data, { force = false } = {}) {
  const entry = parseLogEntry(data);
  const line = String(entry?.line || "");
  if (!line || line === "") return;
  if (!force && (!activeLogRunId || entry.runId !== activeLogRunId)) return;
  const MAX_LINES = 400;
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const row = document.createElement("div");
  row.className = `log-row ${classifyLog(line)}`;
  const timeEl = document.createElement("span");
  timeEl.className = "log-ts";
  timeEl.textContent = ts;
  const textEl = document.createElement("span");
  textEl.className = "log-text";
  textEl.textContent = line;
  row.append(timeEl, textEl);
  logContent.append(row);
  // 行数上限
  while (logContent.children.length > MAX_LINES) {
    logContent.firstElementChild.remove();
  }
  if (!logCollapsed) {
    logContent.scrollTop = logContent.scrollHeight;
  }
  // 活動インジケーター点滅
  logDot.classList.add("log-dot-active");
  clearTimeout(logDot._timer);
  logDot._timer = setTimeout(() => logDot.classList.remove("log-dot-active"), 800);
}

function initLogStream() {
  const es = new EventSource("/api/logs");
  es.onmessage = (e) => appendLog(e.data);
  es.onerror = () => {
    appendLog({ line: "[接続エラー。5秒後に再接続します]", runId: activeLogRunId }, { force: true });
    es.close();
    setTimeout(initLogStream, 5000);
  };
}

async function init() {
  const [formatsResponse, sourcesResponse] = await Promise.all([
    fetch("/api/formats"),
    fetch("/api/default-sources")
  ]);
  formatOptions = await formatsResponse.json();
  defaultSources = await sourcesResponse.json();
  populateFormatSelect(formatOptions);
  updateSourcesForFormat();
  applyCardLang(cardLang);
  applyEventScaleProfile();
  initLogStream();
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

function applyCardLang(lang) {
  cardLang = lang;
  for (const btn of langBtns) {
    btn.classList.toggle("lang-btn-active", btn.dataset.lang === lang);
    btn.setAttribute("aria-pressed", btn.dataset.lang === lang ? "true" : "false");
  }

  if (lastObjects.length) {
    renderCurrentResults();
    return;
  }

  // 表示中のカード画像を切り替え
  for (const article of resultsEl.querySelectorAll(".card")) {
    const img = article.querySelector(".image-link img");
    const src = (lang === "ja" && article.dataset.imageJa) ? article.dataset.imageJa : article.dataset.imageEn;
    if (img && src) img.src = src;
    if (img) {
      const label = (lang === "ja" && article.dataset.imageJa)
        ? article.dataset.imageJaSourceLabel
        : article.dataset.imageSourceLabel;
      img.title = label || "";
    }
  }
  // source-mini 画像も切り替え
  for (const link of resultsEl.querySelectorAll(".source-mini")) {
    const enSrc = link.dataset.imageEn;
    const jaSrc = link.dataset.imageJa;
    const src = (lang === "ja" && jaSrc) ? jaSrc : enSrc;
    const thumb = link.querySelector("img:not(.source-mini-preview)");
    const preview = link.querySelector(".source-mini-preview");
    const label = (lang === "ja" && jaSrc) ? link.dataset.imageJaSourceLabel : link.dataset.imageSourceLabel;
    if (thumb) thumb.src = src;
    if (preview) preview.src = src;
    if (thumb) thumb.title = label ? `画像:${label}` : "";
    if (preview) preview.title = label ? `画像:${label}` : "";
  }
  // 詳細欄の発生源サムネイルも切り替え
  for (const item of resultsEl.querySelectorAll(".source-card-item")) {
    const enSrc = item.dataset.imageEn;
    const jaSrc = item.dataset.imageJa;
    const img = item.querySelector("img");
    const src = (lang === "ja" && jaSrc) ? jaSrc : enSrc;
    const label = (lang === "ja" && jaSrc) ? item.dataset.imageJaSourceLabel : item.dataset.imageSourceLabel;
    if (img) img.src = src;
    if (img) img.title = label ? `画像:${label}` : "";
  }
}

for (const btn of langBtns) {
  btn.addEventListener("click", () => applyCardLang(btn.dataset.lang));
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
printButton.addEventListener("click", () => window.print());
clearCacheButton.addEventListener("click", clearCache);
init().catch((error) => setStatus(`初期化エラー: ${error.message}`));
