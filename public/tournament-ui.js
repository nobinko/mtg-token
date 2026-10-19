import { createTournamentLibrary, selectTournaments } from "./tournament-library.js?v=20261016-melee";

export function createTournamentController({ form, formatSelect, targetDateInput, onChange, onConditionsLoaded, onOpenDeck }) {
  const el = id => document.querySelector(`#tournament-${id}`);
  const modeButtons = [...document.querySelectorAll('input[name="source-mode"]')];
  const status = el("status"), preview = el("preview"), urlInput = el("url");
  const library = createTournamentLibrary();
  let snapshot = null, requestId = 0, busy = false, searching = false, region = "jp", events = [], saved = [];
  let catalogId = 0, catalogBusy = false, nextOffset = null, catalogInfo = null, catalogError = "";
  let visibleCount = 6, choosing = true;
  const isActive = () => modeButtons.find(input => input.checked)?.value === "tournament";
  const canonicalUrl = () => {
    try { const u = new URL(urlInput.value.trim()); return u.protocol === "https:" && u.hostname === "melee.gg" && !u.port && !u.username && !u.password && /^\/Tournament\/View\/[1-9]\d{0,8}\/?$/i.test(u.pathname) ? `https://melee.gg${u.pathname.replace(/\/$/, "")}` : ""; } catch { return ""; }
  };
  const ready = () => !busy && !searching && snapshot && snapshot.url === canonicalUrl() && snapshot.format === formatSelect.value && snapshot.targetDate === targetDateInput.value;
  const matches = () => selectTournaments(events, { region, scale: el("scale-filter").value, query: el("library-query").value });
  function updateAction() {
    el("search").disabled = !ready();
    el("search").textContent = searching ? "準備表を作っています…" : busy ? "リストを取得しています…" : "準備表を作る";
  }
  function showPicker(value) {
    choosing = value;
    el("library").closest(".tournament-library").hidden = !value;
    el("domestic").closest(".tournament-regions").hidden = !value;
    el("help").hidden = !value;
    el("title").textContent = value ? region === "jp" ? "最近の国内大会" : "海外・オンライン・所在地未確認の大会" : "選んだ大会";
  }
  function renderCatalog() {
    const filtered = matches(), current = canonicalUrl();
    el("library").replaceChildren();
    el("library").setAttribute("aria-busy", String(catalogBusy));
    for (const event of filtered.slice(0, visibleCount)) {
      const button = document.createElement("button"); button.type = "button"; button.className = "tournament-card";
      button.setAttribute("aria-pressed", String(event.url === current));
      button.disabled = catalogBusy || busy || searching;
      const heading = document.createElement("span"); heading.className = "tournament-card-meta";
      const date = document.createElement("time"); date.dateTime = event.targetDate; date.textContent = event.targetDate.replaceAll("-", ".");
      const count = document.createElement("span"); count.textContent = event.registeredCount == null ? "人数未確認" : `${event.registeredCount}人`;
      heading.append(date, count);
      const name = document.createElement("strong"); name.textContent = event.name;
      const location = document.createElement("span"); location.className = "tournament-card-location"; location.textContent = event.location || "所在地未確認";
      const action = document.createElement("span"); action.className = "tournament-card-action";
      action.textContent = event.url === current && busy ? "取得中…" : snapshot?.url === event.url ? "✓ 選択中" : "この大会を使う →";
      button.append(heading, name, location, action);
      button.addEventListener("click", () => {
        if (ready() && snapshot.url === event.url) { showPicker(false); el("search").focus(); return; }
        urlInput.value = event.url; invalidate(); request("fetch");
      });
      el("library").append(button);
    }
    if (!filtered.length) {
      const empty = document.createElement("p"); empty.className = "tournament-empty";
      const narrowed = Boolean(el("scale-filter").value || el("library-query").value.trim());
      const searchedPeriod = catalogInfo?.limited ? "ここまでの検索" : `最近${el("period").value}日`;
      empty.textContent = catalogBusy ? "Meleeから最近の大会を探しています…" : catalogError ? "一覧を取得できませんでした。下の「一覧を更新」から再試行できます。" : narrowed ? "条件に合う大会がありません。「大会を絞る」から検索語や参加人数を見直してください。" : region === "jp" ? `${searchedPeriod}では、国内会場を確認できた大会がありません。オンライン・所在地未確認の大会は「その他」に表示します。` : "この期間の大会が見つかりません。期間を広げるか、大会URLから取得できます。";
      el("library").append(empty);
      if (!catalogBusy && !catalogError && !narrowed) {
        const actions = document.createElement("div"); actions.className = "tournament-empty-actions";
        if (nextOffset === null && Number(el("period").value) < 365) {
          const days = Number(el("period").value) < 180 ? 180 : 365;
          const wider = document.createElement("button"); wider.type = "button"; wider.className = "secondary-button";
          wider.textContent = `最近${days === 365 ? "1年" : `${days}日`}まで広げる`; wider.disabled = busy || searching;
          wider.addEventListener("click", () => { el("period").value = String(days); refreshCatalog(); }); actions.append(wider);
        }
        const otherCount = events.filter(event => event.locationScope !== "jp").length;
        if (region === "jp" && otherCount) {
          const other = document.createElement("button"); other.type = "button"; other.className = "secondary-button";
          other.textContent = `その他の大会を見る（${otherCount}大会）`; other.disabled = busy || searching;
          other.addEventListener("click", () => el("other").click()); actions.append(other);
        }
        if (actions.childElementCount) el("library").append(actions);
      }
    }
    showPicker(choosing);
    el("catalog-more").hidden = filtered.length <= visibleCount && nextOffset === null;
    el("catalog-more").textContent = filtered.length > visibleCount ? "もっと大会を見る" : "さらに前の大会を探す";
    el("catalog-more").disabled = catalogBusy || busy || searching;
    el("catalog-refresh").disabled = catalogBusy;
    el("library-status").textContent = catalogBusy ? "会場を確認中です。初回は少し時間がかかります。" : catalogError || (catalogInfo ? `Melee掲載・${region === "jp" ? "国内会場" : "その他"} · 最近${el("period").value}日 · ${filtered.length}大会${filtered.length > visibleCount ? `（${visibleCount}大会を表示）` : ""}` : "");
    el("catalog-details").textContent = catalogInfo ? `直近${catalogInfo.scannedCount}大会から${catalogInfo.fromDate}以降を確認。取得 ${new Date(catalogInfo.fetchedAt).toLocaleString("ja-JP")}。${catalogInfo.limited ? nextOffset !== null ? "続きがあります。「さらに前の大会を探す」で検索を続けられます。" : "取得上限2000大会に達しました。見つからない大会はURLから取得できます。" : ""}` : "";
    if (catalogError) el("catalog-refresh").closest("details").open = true;
  }
  async function refreshCatalog(more = false, refresh = false) {
    const id = ++catalogId; catalogBusy = true; catalogError = "";
    const offset = more ? nextOffset : 0;
    if (!more) { events = []; nextOffset = null; catalogInfo = null; visibleCount = 6; }
    renderCatalog();
    try {
      const response = await fetch(`/api/melee/tournaments?format=${encodeURIComponent(formatSelect.value)}&days=${el("period").value}&offset=${offset || 0}${refresh ? "&refresh=1" : ""}`);
      const data = await response.json(); if (id !== catalogId) return;
      if (!response.ok || !Array.isArray(data.events)) throw new Error(data.error || "Meleeの大会一覧を取得できませんでした。");
      events = [...new Map([...events, ...data.events].map(event => [event.url, event])).values()];
      nextOffset = data.nextOffset; catalogInfo = data;
    } catch (error) { if (id === catalogId) catalogError = error.message; }
    finally { if (id === catalogId) { catalogBusy = false; renderCatalog(); } }
  }
  async function refreshSaved() {
    saved = await library.all(); saved.sort((a, b) => b.targetDate.localeCompare(a.targetDate));
    el("saved").replaceChildren(new Option("保存した大会を選ぶ", ""));
    for (const event of saved) el("saved").add(new Option(`${event.targetDate} · ${event.name} · ${event.deckCount}リスト`, event.url));
  }
  function invalidate() {
    requestId++; snapshot = null; preview.hidden = true; showPicker(true); updateAction();
    if (busy) status.textContent = "読み込み中に条件が変更されました。完了後に読み込み直してください。";
    document.querySelector("#search-button").disabled = searching || isActive();
    const url = canonicalUrl(); el("open").hidden = !url; if (url) el("open").href = url;
    el("staff").hidden = !url; if (url) el("staff").href = url.replace(/\/View\//i, "/Control/");
    onChange();
  }
  function applyMode() {
    const active = isActive(); el("panel").hidden = !active;
    document.querySelector(".setup-panel").classList.toggle("is-tournament", active);
    targetDateInput.closest("label").hidden = active;
    document.querySelector("#environment-intro").hidden = active;
    document.querySelector(".sources").hidden = active;
    for (const id of ["event-scale", "usage-threshold", "confidence", "max-pages", "use-cache", "refresh-cache"]) document.querySelector(`#${id}`).closest("label").hidden = active;
    for (const id of ["sampling-summary", "clear-cache-button", "update-environment-button", "update-status"]) document.querySelector(`#${id}`).hidden = active;
    document.querySelector("#search-advanced").hidden = active;
    document.querySelector("#search-button").hidden = active;
    document.querySelector("#search-button").textContent = "準備表を作る";
    document.querySelector("#search-button").disabled = searching || active && !ready();
    if (active && !catalogInfo && !catalogBusy) refreshCatalog();
    updateAction();
    onChange();
  }
  function render(info) {
    snapshot = info; preview.hidden = false; preview.replaceChildren();
    const title = document.createElement("h3"); title.textContent = info.name;
    const heading = document.createElement("div"); heading.className = "tournament-selection-heading";
    const change = document.createElement("button"); change.type = "button"; change.className = "ghost-button"; change.textContent = "選び直す";
    change.addEventListener("click", () => { showPicker(true); el("library").querySelector("button")?.focus(); });
    heading.append(title, change);
    const count = document.createElement("p"); count.className = info.coverageComplete ? "tournament-complete" : "sampling-warn";
    count.textContent = info.coverageComplete ? `${info.deckCount} / ${info.registeredCount}人分のリストを読み込み済み` : info.registeredCount == null ? `${info.deckCount}リストを読み込み済み・参加総数は未入力（全員分か未確認）` : `${info.deckCount} / ${info.registeredCount}人分を読み込み済み・未取得 ${info.missingCount}人分`;
    const details = document.createElement("details"); details.className = "tournament-preview-details";
    const summary = document.createElement("summary"); summary.textContent = "取得したリスト・詳細を見る"; details.append(summary);
    const meta = document.createElement("p"); meta.className = "tournament-note"; meta.textContent = `${info.format.toUpperCase()} / ${info.targetDate} / ${info.method === "melee-public" ? "Melee公開リスト" : info.method === "melee-api" ? "本人のMelee API" : "ファイル取り込み"} / 取得 ${new Date(info.fetchedAt).toLocaleString("ja-JP")}。採用率は取得できた${info.deckCount}リストを母数にします。`;
    preview.append(heading, count); details.append(meta);
    if (info.currentRegisteredCount != null && info.standingsCount !== info.currentRegisteredCount) { const p = document.createElement("p"); p.className = "tournament-note"; p.textContent = `現在の登録数${info.currentRegisteredCount}人と公開順位表${info.standingsCount}人に差があります。上の確認人数には大きい方を使っています。`; preview.append(p); }
    if (info.locationNote) { const p = document.createElement("p"); p.className = "tournament-note"; p.textContent = info.locationNote; details.append(p); }
    if (/^https:\/\/note\.com\//.test(info.locationSourceUrl || "")) { const a = document.createElement("a"); a.href = info.locationSourceUrl; a.textContent = "主催者の開催案内 ↗"; a.target = "_blank"; a.rel = "noopener noreferrer"; details.append(a); }
    if (info.duplicateDeckCount) { const p = document.createElement("p"); p.textContent = `同じデッキURLの重複 ${info.duplicateDeckCount}件を除外`; preview.append(p); }
    for (const failure of (info.failures || []).slice(0, 8)) { const p = document.createElement("p"); p.className = "sampling-warn"; p.textContent = `未取得: ${failure.name} — ${failure.message}`; preview.append(p); }
    const list = document.createElement("ul");
    for (const deck of info.preview || []) { const li = document.createElement("li"); li.textContent = `${deck.player ? `${deck.player} / ` : ""}${deck.title}（メイン${deck.mainboardCount}・サイド${deck.sideboardCount}）`; list.append(li); }
    details.append(list); preview.append(details);
    if (onOpenDeck && info.decks?.length) {
      const picker = document.createElement("details"); picker.className = "tournament-deck-picker";
      const summary = document.createElement("summary"); summary.textContent = "デッキを選んでひとり回し";
      const hint = document.createElement("p"); hint.className = "tournament-note"; hint.textContent = "この大会の実リストを使えます。準備表の集計を待つ必要はありません。";
      const input = document.createElement("input"); input.type = "search"; input.placeholder = "選手名・デッキ名・カード名"; input.setAttribute("aria-label", "ひとり回しのデッキを探す");
      const count = document.createElement("p"); count.className = "tournament-note";
      const results = document.createElement("div"); results.className = "tournament-deck-results";
      const more = document.createElement("button"); more.type = "button"; more.textContent = "続きを表示";
      let limit = 20;
      const draw = () => {
        const needle = input.value.normalize("NFKC").trim().toLocaleLowerCase();
        const matches = info.decks.filter((deck) => !needle || `${deck.player || ""} ${deck.title || ""} ${(deck.mainboard || []).map((card) => card.name).join(" ")}`.normalize("NFKC").toLocaleLowerCase().includes(needle));
        results.replaceChildren(); count.textContent = `${matches.length}件${matches.length > limit ? ` / ${limit}件を表示` : ""}`;
        for (const deck of matches.slice(0, limit)) {
          const button = document.createElement("button"); button.type = "button";
          button.textContent = `${deck.player || "選手名なし"} — ${deck.title || "デッキ"}`;
          button.setAttribute("aria-label", `${deck.player || "選手名なし"} — ${deck.title || "デッキ"} のデッキを開く`);
          const sizes = document.createElement("small"); sizes.textContent = `メイン${deck.mainboardCount ?? deck.mainboard?.reduce((total, card) => total + card.count, 0)}・サイド${deck.sideboardCount ?? 0} ／ 画像を見てひとり回し`;
          button.append(sizes); button.addEventListener("click", () => onOpenDeck(deck)); results.append(button);
        }
        more.hidden = matches.length <= limit;
      };
      input.addEventListener("input", () => { limit = 20; draw(); });
      more.addEventListener("click", () => { limit += 20; draw(); });
      picker.addEventListener("toggle", () => { if (picker.open && !results.childElementCount) draw(); });
      picker.append(summary, hint, input, count, results, more); more.hidden = true; preview.append(picker);
    }
    el("import").open = false; el("alternatives").open = false; showPicker(false);
    el("search").before(status);
    status.textContent = "取得完了。下のボタンで準備表を作れます。";
  }
  async function request(action) {
    if (busy || searching) return;
    if (el("alternatives").open) el(action === "fetch-api" ? "api-fetch" : action === "import" ? "import-button" : action === "load" ? "saved" : "load").after(status);
    else el("search").before(status);
    const url = canonicalUrl(); if (!url) { status.textContent = "Meleeの大会URLを入力してください。"; urlInput.focus(); return; }
    const id = ++requestId; busy = true; snapshot = null; preview.hidden = true; updateAction(); renderCatalog(); onChange();
    for (const key of ["load", "api-fetch", "import-button", "saved"]) el(key).disabled = true;
    document.querySelector("#search-button").disabled = true;
    status.textContent = action === "import" ? "大会のリストを読み込んでいます…" : action === "load" ? "このブラウザに保存した大会リストを確認しています…" : "Meleeから大会全体のリストを取得しています。大きな大会では数分かかることがあります…";
    try {
      const body = { action, url, name: el("name").value, participants: el("participants").value, format: formatSelect.value, targetDate: targetDateInput.value,
        locationScope: el("region").value, location: el("location").value, eventScale: el("scale").value };
      if (action === "fetch-api") {
        body.credentials = { id: el("api-id").value.trim(), secret: el("api-secret").value };
        if (!body.credentials.id || !body.credentials.secret) throw new Error("自分のMelee API用IDとシークレットを入力してください。");
      }
      if (action === "import") {
        const files = [...el("files").files];
        if (files.reduce((sum, file) => sum + file.size, 0) + new Blob([el("text").value]).size > 3 * 1024 * 1024) throw new Error("リストは合計3MBまでです。");
        body.files = await Promise.all(files.map(async file => ({ name: file.name, content: await file.text() })));
        if (el("text").value.trim()) body.files.push({ name: "貼り付け", content: el("text").value });
      }
      let data;
      if (action === "load") {
        data = await library.read(url);
        if (!data) throw new Error("このブラウザにはまだ保存していません。自分のアカウントで受け取ったリストを下から取り込んでください。");
      } else {
        const response = await fetch("/api/tournament", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        data = await response.json(); if (id !== requestId) return;
        if (!response.ok) throw new Error(data.error || "大会リストを読み込めませんでした。");
        try { await library.save(data); await refreshSaved(); }
        catch { data.saveWarning = "取得は完了しましたが、このブラウザに保存できませんでした。"; }
      }
      if (id !== requestId) return;
      const formatChanged = formatSelect.value !== data.format;
      const conditionsChanged = formatChanged || targetDateInput.value !== data.targetDate;
      formatSelect.value = data.format; targetDateInput.value = data.targetDate;
      if (conditionsChanged) onConditionsLoaded?.();
      el("name").value = data.name; el("participants").value = data.registeredCount ?? "";
      el("region").value = data.locationScope || "unknown"; el("location").value = data.location || ""; el("scale").value = data.eventScale || "unknown";
      render(data);
      if (formatChanged) refreshCatalog();
      if (data.saveWarning) status.textContent += ` ${data.saveWarning}`;
    } catch (error) { if (id === requestId) status.textContent = error.message; }
    finally {
      busy = false; for (const key of ["load", "api-fetch", "import-button", "saved"]) el(key).disabled = false;
      if (action === "fetch-api") { el("api-secret").value = ""; el("api-id").value = ""; }
      renderCatalog(); updateAction();
      if (ready() && isActive()) { el("search").scrollIntoView({ behavior: "smooth", block: "nearest" }); el("search").focus({ preventScroll: true }); }
      document.querySelector("#search-button").disabled = isActive() && !ready();
    }
  }
  for (const input of modeButtons) input.addEventListener("change", applyMode);
  urlInput.addEventListener("input", invalidate);
  formatSelect.addEventListener("change", () => { invalidate(); if (isActive()) refreshCatalog(); }); targetDateInput.addEventListener("change", invalidate);
  for (const key of ["name", "participants", "text", "files", "region", "location", "scale"]) el(key).addEventListener(["files", "region", "scale"].includes(key) ? "change" : "input", () => { if (snapshot) { status.textContent = "編集内容はまだ反映していません。もう一度取り込んでください。"; invalidate(); } });
  el("load").addEventListener("click", () => request("fetch"));
  el("api-fetch").addEventListener("click", () => request("fetch-api"));
  el("import-button").addEventListener("click", () => request("import"));
  el("search").addEventListener("click", () => form.requestSubmit());
  for (const key of ["domestic", "other"]) el(key).addEventListener("click", () => {
    region = key === "domestic" ? "jp" : "other";
    for (const button of ["domestic", "other"]) el(button).setAttribute("aria-pressed", String(button === key));
    visibleCount = 6; renderCatalog();
  });
  for (const key of ["library-query", "scale-filter"]) el(key).addEventListener(key === "library-query" ? "input" : "change", () => { visibleCount = 6; renderCatalog(); });
  el("catalog-refresh").addEventListener("click", () => refreshCatalog(false, true));
  el("catalog-more").addEventListener("click", () => { if (matches().length > visibleCount) { visibleCount += 6; renderCatalog(); } else refreshCatalog(true); });
  el("period").addEventListener("change", () => refreshCatalog());
  el("saved").addEventListener("change", () => {
    if (!el("saved").value || busy || searching) return;
    urlInput.value = el("saved").value; invalidate(); request("load");
  });
  renderCatalog(); refreshSaved().catch(() => {});
  return { initialize: applyMode, isActive, ready, isSearching: () => searching, setSearching: value => {
    searching = value;
    for (const key of ["load", "api-fetch", "import-button", "search", "saved"]) el(key).disabled = searching || busy;
    renderCatalog(); updateAction();
    document.querySelector("#search-button").disabled = searching || isActive() && !ready();
  }, payload: () => {
    if (!ready()) throw new Error("大会リストを先に読み込んでください。条件を変更した場合は読み込み直してください。");
    return { sourceMode: "tournament", tournamentUrl: snapshot.url, tournamentRevision: snapshot.fetchedAt, tournamentSnapshot: snapshot };
  } };
}
