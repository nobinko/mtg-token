// Submitted lists belong to this browser, never to a server-wide URL cache.
export function createTournamentLibrary({ indexedDB = globalThis.indexedDB } = {}) {
  async function transact(mode, operation) {
    if (!indexedDB) throw new Error("このブラウザでは大会を保存できません。通常モードのブラウザで開いてください。");
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("mtg-token-personal-tournaments", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("tournaments", { keyPath: "url" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("大会の保存先を開けません。ブラウザの保存設定を確認してください。"));
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction("tournaments", mode);
        const request = operation(transaction.objectStore("tournaments"));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = transaction.onabort = () => reject(new Error("大会を保存・読み込みできませんでした。元のリストファイルを残し、ブラウザの空き容量を確認してください。"));
      });
    } finally { db.close(); }
  }
  return {
    all: () => transact("readonly", store => store.getAll()),
    read: url => transact("readonly", store => store.get(url)),
    save: tournament => transact("readwrite", store => store.put(tournament))
  };
}

export function selectTournaments(tournaments, { region = "jp", scale = "", query = "" } = {}) {
  const needle = query.normalize("NFKC").trim().toLocaleLowerCase();
  return tournaments.filter(event => event && typeof event.url === "string")
    .filter(event => region === "jp" ? event.locationScope === "jp" : event.locationScope !== "jp")
    .filter(event => !scale || event.eventScale === scale)
    .filter(event => !needle || `${event.name} ${event.location || ""} ${event.targetDate}`.normalize("NFKC").toLocaleLowerCase().includes(needle))
    .sort((a, b) => String(b.targetDate).localeCompare(String(a.targetDate)) || String(b.fetchedAt).localeCompare(String(a.fetchedAt)));
}

// Shareable parameters observed in Melee's official search UI. Japan is a
// keyword search, not proof that every result has a verified Japanese venue.
export function meleeSearchUrl({ region = "jp", query = "" } = {}) {
  const search = [region === "jp" ? "Japan" : "", query.normalize("NFKC").trim().slice(0, 120)].filter(Boolean).join(" ");
  const context = { context: 2, game: "MagicTheGathering", search: search || null, filters: ["Past"] };
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(context))));
  return `https://melee.gg/Search?q=${encodeURIComponent(encoded)}`;
}
