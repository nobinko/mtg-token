export function createTournamentController({ form, formatSelect, targetDateInput, onChange, onConditionsLoaded }) {
  const el = id => document.querySelector(`#tournament-${id}`);
  const modeButtons = [...document.querySelectorAll('input[name="source-mode"]')];
  const status = el("status"), preview = el("preview"), urlInput = el("url");
  let snapshot = null, requestId = 0, busy = false, searching = false;
  const isActive = () => modeButtons.find(input => input.checked)?.value === "tournament";
  const canonicalUrl = () => {
    try { const u = new URL(urlInput.value.trim()); return u.protocol === "https:" && u.hostname === "melee.gg" && !u.port && !u.username && !u.password && /^\/Tournament\/View\/[1-9]\d{0,8}\/?$/i.test(u.pathname) ? `https://melee.gg${u.pathname.replace(/\/$/, "")}` : ""; } catch { return ""; }
  };
  const ready = () => !busy && !searching && snapshot && snapshot.url === canonicalUrl() && snapshot.format === formatSelect.value && snapshot.targetDate === targetDateInput.value;
  function invalidate() {
    requestId++; snapshot = null; preview.hidden = true; el("search").hidden = true;
    if (busy) status.textContent = "読み込み中に条件が変更されました。完了後に読み込み直してください。";
    document.querySelector("#search-button").disabled = searching || isActive();
    const url = canonicalUrl(); el("open").hidden = !url; if (url) el("open").href = url;
    onChange();
  }
  function applyMode() {
    const active = isActive(); el("panel").hidden = !active;
    document.querySelector(".sources").hidden = active;
    for (const id of ["event-scale", "usage-threshold", "confidence", "max-pages", "use-cache", "refresh-cache"]) document.querySelector(`#${id}`).closest("label").hidden = active;
    for (const id of ["sampling-summary", "clear-cache-button", "update-environment-button", "update-status"]) document.querySelector(`#${id}`).hidden = active;
    document.querySelector("#search-advanced").hidden = active;
    document.querySelector("#search-button").hidden = active;
    document.querySelector("#search-button").textContent = "必要なトークンを探す";
    document.querySelector("#search-button").disabled = searching || active && !ready();
    onChange();
  }
  function render(info) {
    snapshot = info; preview.hidden = false; preview.replaceChildren();
    const title = document.createElement("h3"); title.textContent = info.name;
    const count = document.createElement("p"); count.className = info.coverageComplete ? "tournament-complete" : "sampling-warn";
    count.textContent = info.coverageComplete ? `${info.deckCount} / ${info.registeredCount}人分のリストを読み込み済み` : info.registeredCount == null ? `${info.deckCount}リストを読み込み済み・参加総数は未入力（全員分か未確認）` : `${info.deckCount} / ${info.registeredCount}人分を読み込み済み・未取得 ${info.missingCount}人分`;
    const meta = document.createElement("p"); meta.className = "tournament-note"; meta.textContent = `${info.format.toUpperCase()} / ${info.targetDate} / 取り込み ${new Date(info.fetchedAt).toLocaleString("ja-JP")}。採用率は読み込めた${info.deckCount}リストを母数にします。`;
    preview.append(title, count, meta);
    if (info.duplicateDeckCount) { const p = document.createElement("p"); p.textContent = `同じデッキURLの重複 ${info.duplicateDeckCount}件を除外`; preview.append(p); }
    for (const failure of (info.failures || []).slice(0, 8)) { const p = document.createElement("p"); p.className = "sampling-warn"; p.textContent = `未取得: ${failure.name} — ${failure.message}`; preview.append(p); }
    const list = document.createElement("ul");
    for (const deck of info.preview || []) { const li = document.createElement("li"); li.textContent = `${deck.player ? `${deck.player} / ` : ""}${deck.title}（メイン${deck.mainboardCount}・サイド${deck.sideboardCount}）`; list.append(li); }
    preview.append(list); el("search").hidden = false; el("import").open = false;
    status.textContent = "読み込み完了。画像付きの全リストは、トークン検索後に確認できます。";
  }
  async function request(action) {
    if (busy || searching) return;
    const url = canonicalUrl(); if (!url) { status.textContent = "Meleeの大会URLを入力してください。"; urlInput.focus(); return; }
    const id = ++requestId; busy = true; snapshot = null; preview.hidden = true; el("search").hidden = true; onChange();
    for (const key of ["load", "import-button"]) el(key).disabled = true;
    document.querySelector("#search-button").disabled = true;
    status.textContent = action === "import" ? "大会のリストを読み込んでいます…" : "登録済みの大会リストを確認しています…";
    try {
      const body = { action, url, name: el("name").value, participants: el("participants").value, format: formatSelect.value, targetDate: targetDateInput.value };
      if (action === "import") {
        const files = [...el("files").files];
        if (files.reduce((sum, file) => sum + file.size, 0) + new Blob([el("text").value]).size > 3 * 1024 * 1024) throw new Error("リストは合計3MBまでです。");
        body.files = await Promise.all(files.map(async file => ({ name: file.name, content: await file.text() })));
        if (el("text").value.trim()) body.files.push({ name: "貼り付け", content: el("text").value });
      }
      const response = await fetch("/api/tournament", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (id !== requestId) return;
      if (!response.ok) throw new Error(data.error || "大会リストを読み込めませんでした。");
      const conditionsChanged = formatSelect.value !== data.format || targetDateInput.value !== data.targetDate;
      formatSelect.value = data.format; targetDateInput.value = data.targetDate;
      if (conditionsChanged) onConditionsLoaded?.();
      el("name").value = data.name; el("participants").value = data.registeredCount ?? "";
      render(data);
    } catch (error) { if (id === requestId) { status.textContent = error.message; el("import").open = true; } }
    finally {
      busy = false; for (const key of ["load", "import-button"]) el(key).disabled = false;
      document.querySelector("#search-button").disabled = isActive() && !ready();
    }
  }
  for (const input of modeButtons) input.addEventListener("change", applyMode);
  urlInput.addEventListener("input", invalidate);
  formatSelect.addEventListener("change", invalidate); targetDateInput.addEventListener("change", invalidate);
  for (const key of ["name", "participants", "text", "files"]) el(key).addEventListener(key === "files" ? "change" : "input", () => { if (snapshot) { status.textContent = "編集内容はまだ反映していません。もう一度取り込んでください。"; invalidate(); } });
  el("load").addEventListener("click", () => request("load"));
  el("import-button").addEventListener("click", () => request("import"));
  el("search").addEventListener("click", () => form.requestSubmit());
  el("yokohama").addEventListener("click", () => {
    const conditionsChanged = formatSelect.value !== "modern" || targetDateInput.value !== "2026-10-03";
    urlInput.value = "https://melee.gg/Tournament/View/411350"; formatSelect.value = "modern"; targetDateInput.value = "2026-10-03";
    if (conditionsChanged) onConditionsLoaded?.();
    el("name").value = "Champions Cup Final Season 5 Round 1"; el("participants").value = "537";
    invalidate(); status.textContent = "横浜大会を入力しました。参加人数は公開時の537人です。現在の人数とリストを確認して取り込んでください。";
  });
  return { isActive, ready, isSearching: () => searching, setSearching: value => {
    searching = value;
    for (const key of ["load", "import-button", "search"]) el(key).disabled = searching || busy;
    document.querySelector("#search-button").disabled = searching || isActive() && !ready();
  }, payload: () => {
    if (!ready()) throw new Error("大会リストを先に読み込んでください。条件を変更した場合は読み込み直してください。");
    return { sourceMode: "tournament", tournamentUrl: snapshot.url, tournamentRevision: snapshot.fetchedAt };
  } };
}
