const normalizeName = (name) => String(name || "").trim().toLowerCase();

export function createDeckGallery(dialog, preview) {
  const lists = [dialog.querySelector("#deck-mainboard-list"), dialog.querySelector("#deck-sideboard-list")];
  const status = dialog.querySelector("#deck-image-status");
  const retry = dialog.querySelector("#deck-image-retry");
  const buttons = [...dialog.querySelectorAll("[data-deck-language]")];
  let language = "en";
  let generation = 0;
  let deck = null;
  let english = new Map();
  let japanese = new Map();
  let loadingEnglish = false;
  let loadingJapanese = false;
  let error = "";

  function names() {
    return [...new Set([...(deck?.mainboard || []), ...(deck?.sideboard || [])].map((row) => row.name))];
  }

  function addMetadata(target, cards) {
    for (const card of cards) {
      for (const name of [card.requestedName, card.name, ...(card.faces || []).map((face) => face.name)].filter(Boolean)) {
        target.set(normalizeName(name), card);
      }
    }
  }

  function metadata(name) {
    const key = normalizeName(name);
    return (language === "ja" && japanese.get(key)) || english.get(key);
  }

  function label(row, card) {
    return language === "ja" ? card?.printedName || row.name : row.name;
  }

  function openPreview(row) {
    const card = metadata(row.name);
    if (!card?.imageUrl) return;
    const faces = card.faces?.filter((face) => face.imageUrl) || [];
    const views = faces.length > 1 ? faces : [{ name: row.name, printedName: card.printedName, imageUrl: card.imageUrl }];
    const title = preview.querySelector("#deck-preview-title");
    const image = preview.querySelector("#deck-preview-image");
    const controls = preview.querySelector("#deck-preview-faces");
    const note = preview.querySelector("#deck-preview-note");
    const fallback = language === "ja" && card.language !== "ja";
    controls.replaceChildren();
    const showFace = (index) => {
      const face = views[index];
      title.textContent = language === "ja" ? face.printedName || face.name : face.name;
      image.alt = title.textContent;
      image.src = face.imageUrl;
      note.textContent = fallback ? "日本語画像を取得できないため英語版を表示しています。" : "";
      for (const [i, button] of [...controls.children].entries()) button.setAttribute("aria-pressed", String(i === index));
    };
    image.onerror = () => { note.textContent = "画像を表示できませんでした。閉じてからもう一度お試しください。"; };
    if (views.length > 1) {
      views.forEach((face, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = index === 0 ? "表面" : "裏面";
        button.addEventListener("click", () => showFace(index));
        controls.append(button);
      });
    }
    showFace(0);
    preview.showModal();
  }

  function renderRows(container, rows) {
    container.replaceChildren();
    for (const row of rows || []) {
      const card = metadata(row.name);
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "deck-card-button";
      button.disabled = !card?.imageUrl;
      button.setAttribute("aria-label", `${label(row, card)}、${row.count}枚を拡大`);
      const surface = document.createElement("span");
      surface.className = "deck-card-surface";
      const placeholder = document.createElement("span");
      placeholder.className = "deck-card-placeholder";
      placeholder.textContent = label(row, card);
      surface.append(placeholder);
      if (card?.imageUrl) {
        const image = document.createElement("img");
        image.src = card.imageUrl;
        image.alt = label(row, card);
        image.loading = "lazy";
        image.draggable = false;
        image.addEventListener("error", () => {
          image.hidden = true;
          placeholder.textContent = `${label(row, card)} — 画像を表示できません`;
          button.disabled = true;
        });
        surface.append(image);
      }
      const count = document.createElement("strong");
      count.className = "deck-card-count";
      count.textContent = `${row.count}枚`;
      surface.append(count);
      const caption = document.createElement("span");
      caption.className = "deck-card-caption";
      caption.textContent = label(row, card);
      const note = document.createElement("span");
      note.className = "deck-card-note";
      if (card?.unavailable) note.textContent = "画像を取得できません";
      else if (language === "ja" && japanese.has(normalizeName(row.name)) && card?.language !== "ja") note.textContent = "日本語画像なし・英語表示";
      else if (language === "ja" && !japanese.has(normalizeName(row.name))) note.textContent = "日本語画像を取得中…";
      button.append(surface, caption, note);
      button.addEventListener("click", () => openPreview(row));
      item.append(button);
      container.append(item);
    }
  }

  function render() {
    for (const button of buttons) {
      button.disabled = !deck;
      button.setAttribute("aria-pressed", String(button.dataset.deckLanguage === language));
    }
    renderRows(lists[0], deck?.mainboard);
    renderRows(lists[1], deck?.sideboard);
    const all = names();
    const done = all.filter((name) => japanese.has(normalizeName(name))).length;
    retry.hidden = !error;
    retry.disabled = loadingEnglish || loadingJapanese;
    status.textContent = !deck ? "" : error || (loadingEnglish ? "カード画像を取得しています…" : language === "ja" && done < all.length ? `日本語画像を取得しています… ${done}/${all.length}` : "カードをクリックすると拡大できます。");
  }

  async function requestMetadata(requested, requestedLanguage) {
    const response = await fetch("/api/card-metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ names: requested, language: requestedLanguage })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "カード画像を取得できませんでした。");
    return data.cards || [];
  }

  async function loadJapanese(token) {
    if (loadingJapanese || loadingEnglish || !deck) return;
    loadingJapanese = true;
    error = "";
    render();
    try {
      const missing = names().filter((name) => !japanese.has(normalizeName(name)));
      for (let offset = 0; offset < missing.length; offset += 6) {
        if (token !== generation || language !== "ja") break;
        const cards = await requestMetadata(missing.slice(offset, offset + 6), "ja");
        if (token !== generation) return;
        addMetadata(japanese, cards);
        render();
      }
    } catch (cause) {
      if (token === generation) error = `日本語画像の取得失敗: ${cause.message} 英語版で操作できます。`;
    } finally {
      if (token === generation) { loadingJapanese = false; render(); }
    }
  }

  async function loadEnglish(token) {
    if (loadingEnglish || !deck) return;
    loadingEnglish = true;
    error = "";
    render();
    try {
      const cards = await requestMetadata(names(), "en");
      if (token !== generation) return;
      addMetadata(english, cards);
    } catch (cause) {
      if (token === generation) error = `カード画像の取得失敗: ${cause.message} 枚数・カード名はそのまま確認できます。`;
    } finally {
      if (token === generation) {
        loadingEnglish = false;
        render();
        if (!error && language === "ja") void loadJapanese(token);
      }
    }
  }

  function clear() {
    generation += 1;
    deck = null;
    english = new Map();
    japanese = new Map();
    loadingEnglish = false;
    loadingJapanese = false;
    error = "";
    if (preview.open) preview.close();
    render();
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      language = button.dataset.deckLanguage;
      error = "";
      render();
      if (!english.size) void loadEnglish(generation);
      else if (language === "ja") void loadJapanese(generation);
    });
  }
  retry.addEventListener("click", () => {
    if (!english.size) void loadEnglish(generation);
    else if (language === "ja") void loadJapanese(generation);
  });
  preview.querySelector("#deck-preview-close").addEventListener("click", () => preview.close());
  preview.addEventListener("click", (event) => { if (event.target === preview) preview.close(); });

  return {
    clear,
    setDeck(value) {
      clear();
      deck = value;
      void loadEnglish(generation);
    }
  };
}
