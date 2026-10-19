import { importTournament, meleeTournamentUrl, tournamentSummary } from "./tournament.js";

const origin = "https://melee.gg";
const formats = ["standard", "pioneer", "modern", "legacy"];
const retryStatuses = new Set([408, 500, 502, 503, 504]);
const retryCodes = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET"]);
const retryDelays = [750, 2000];

function connectionFailure(cause) {
  const code = cause?.cause?.code || cause?.code;
  const timeout = cause?.name === "TimeoutError" || cause?.name === "AbortError" || /TIMEOUT|TIMEDOUT/.test(code || "");
  const retryable = timeout || retryCodes.has(code) || (!cause?.cause && cause instanceof TypeError && /fetch failed|failed to fetch|network/i.test(cause.message));
  // Never include fetch errors, request headers or upstream bodies in a response:
  // the same transport is used for each user's authenticated API requests.
  const error = new Error(timeout
    ? "Meleeの応答が時間内に届きませんでした。同じ大会をもう一度選ぶと取得し直せます。"
    : "Meleeとの接続を完了できませんでした。同じ大会をもう一度選んでください。繰り返す場合はネット接続とMeleeの公式画面を確認してください。");
  error.status = timeout ? 504 : 502;
  error.retryable = retryable;
  return error;
}
const guid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const clean = value => String(value ?? "").normalize("NFKC").trim().slice(0, 180);
const japanStates = /^(?:北海道|東京都|大阪府|京都府|(?:青森|岩手|宮城|秋田|山形|福島|茨城|栃木|群馬|埼玉|千葉|神奈川|新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知|三重|滋賀|兵庫|奈良|和歌山|鳥取|島根|岡山|広島|山口|徳島|香川|愛媛|高知|福岡|佐賀|長崎|熊本|大分|宮崎|鹿児島|沖縄)県|Hokkaido|Tokyo|Osaka|Kyoto|Aomori|Iwate|Miyagi|Akita|Yamagata|Fukushima|Ibaraki|Tochigi|Gunma|Saitama|Chiba|Kanagawa|Niigata|Toyama|Ishikawa|Fukui|Yamanashi|Nagano|Gifu|Shizuoka|Aichi|Mie|Shiga|Hyogo|Nara|Wakayama|Tottori|Shimane|Okayama|Hiroshima|Yamaguchi|Tokushima|Kagawa|Ehime|Kochi|Fukuoka|Saga|Nagasaki|Kumamoto|Oita|Miyazaki|Kagoshima|Okinawa)(?: Prefecture|[- ](?:ken|fu|to|do))?$/i;

// For venues absent from Melee, match an exact organizer factsheet link AND
// event date. This is venue evidence, never a saved-tournament catalog.
// Checked 2026-10-16: the organizer's article lists Tokyo's Toyo community hall.
const verifiedFactsheets = [{ url: "https://note.com/massan_gabagaba/n/n24918c646d37", date: "2026-08-08", location: "東京都江東区 / 東陽区民館" }];

export function factsheetRegion(html) {
  const start = html.match(/id="tournament-headline-start-date-field"[\s\S]*?data-value="([^"]+)"/)?.[1];
  if (!Number.isFinite(Date.parse(start))) return null;
  const eventDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(start));
  const links = [...html.matchAll(/href="(https:\/\/[^"<>]+)"/g)].map(match => { try { const url = new URL(match[1]); url.search = ""; url.hash = ""; return url.href; } catch { return ""; } });
  const source = verifiedFactsheets.find(source => source.date === eventDate && links.includes(source.url));
  return source ? { locationScope: "jp", location: source.location, locationNote: "Meleeからリンクされた主催者の開催案内で国内会場を確認", locationSourceUrl: source.url } : null;
}

export function venueRegion(venue) {
  const country = clean(venue?.AddressCountry).toUpperCase();
  // Some actual Melee venues (including Pacifico Yokohama) have a wrong US code.
  // Require a prefecture AND a Japanese postcode to resolve that conflict.
  const japaneseAddress = japanStates.test(clean(venue?.AddressState)) && /^\d{3}[-ー]?\d{4}$/.test(clean(venue?.AddressPostalCode));
  const jp = ["JP", "JPN", "JAPAN", "日本"].includes(country) || japaneseAddress;
  return {
    locationScope: jp ? "jp" : country ? "other" : "unknown",
    location: [venue?.AddressState, venue?.AddressCity, venue?.Name].map(clean).filter(Boolean).join(" / ").slice(0, 180),
    locationNote: japaneseAddress && country && !["JP", "JPN", "JAPAN", "日本"].includes(country) ? "会場の都道府県と郵便番号から国内と判定（Meleeの国コードに不一致）" : ""
  };
}

async function mapLimit(items, limit, operation) {
  const results = new Array(items.length); let index = 0, stopped = false;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!stopped && index < items.length) {
      const current = index++;
      try { results[current] = await operation(items[current], current); }
      catch (error) { stopped = true; throw error; }
    }
  }));
  return results;
}

export function createMeleeClient({ fetchImpl = (...args) => fetch(...args), now = () => new Date(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const cache = new Map();
  async function request(path, { form, credentials, html = false } = {}) {
    const headers = { accept: html ? "text/html" : "application/json", "user-agent": "Mozilla/5.0 (compatible; MTGTokenFinder/0.2; local tournament preparation)" };
    if (form) headers["content-type"] = "application/x-www-form-urlencoded";
    if (credentials) {
      const { id, secret } = credentials;
      if (typeof id !== "string" || typeof secret !== "string" || !id || !secret || id.length > 200 || secret.length > 1000 || /[:\r\n]/.test(id) || /[\r\n]/.test(secret)) throw new Error("自分のMelee API用IDとシークレットを入力してください。");
      headers.authorization = `Basic ${Buffer.from(`${id}:${secret}`, "utf8").toString("base64")}`;
    }
    let source;
    // Every endpoint here is read-only, including the public search/standings
    // POSTs. Retry only a failed request, never the complete 500+ deck acquisition.
    for (let attempt = 0; ; attempt++) {
      let response, failure;
      try { response = await fetchImpl(`${origin}${path}`, { method: form ? "POST" : "GET", headers, body: form?.toString(), redirect: "error", signal: AbortSignal.timeout(25000) }); }
      catch (cause) { failure = connectionFailure(cause); }
      if (response && !response.ok) {
        // Release failed responses before retrying; do not retain bodies or leak
        // connections while four parallel deck workers are active.
        try { await response.body?.cancel(); } catch {}
        const message = response.status === 401 ? "MeleeのAPI認証に失敗しました。本人のAPI用IDとシークレットを確認してください。" : response.status === 403 ? "Meleeから取得を許可されませんでした。非公開リストは本人のAPI認証と大会のスタッフ権限が必要です。" : response.status === 429 ? "Meleeの取得回数制限に達しました。時間をおいて再取得してください。" : "Meleeから取得できませんでした。同じ大会をもう一度選ぶと取得し直せます。";
        failure = new Error(`${message}（HTTP ${response.status}）`);
        failure.status = response.status; failure.retryable = retryStatuses.has(response.status);
      }
      if (!failure) {
        try { source = await response.text(); break; }
        catch (cause) { failure = connectionFailure(cause); }
      }
      if (!failure.retryable || attempt >= retryDelays.length) throw failure;
      await sleep(retryDelays[attempt]);
    }
    if (source.length > 4 * 1024 * 1024) throw new Error("Meleeの応答が大きすぎます。対象を絞ってください。");
    if (html) return source;
    try { return JSON.parse(source); } catch { throw new Error("Meleeの応答形式が変わったため取得できません。公式画面を確認してください。"); }
  }
  async function cached(key, operation) {
    const existing = cache.get(key);
    if (existing && now().getTime() - existing.time < 15 * 60000) return existing.value;
    if (cache.size >= 700) cache.delete(cache.keys().next().value);
    const pending = operation(); cache.set(key, { time: now().getTime(), value: pending });
    try { const value = await pending; cache.set(key, { time: now().getTime(), value }); return value; }
    catch (error) { if (cache.get(key)?.value === pending) cache.delete(key); throw error; }
  }
  async function eventPage(id) {
    return cached(`event:${id}`, async () => {
      const html = await request(`/Tournament/View/${id}`, { html: true });
      if (!new RegExp(`name="tournament-id"[^>]*value="${id}"`).test(html)) throw new Error("Meleeの大会ページを確認できません。");
      const venueId = html.match(/<a\b(?=[^>]*data-type="venue")(?=[^>]*data-id="(\d+)")[^>]*>/i)?.[1];
      let region = { locationScope: "unknown", location: "会場所在地未確認", locationNote: "" };
      if (venueId) {
        try { region = await cached(`venue:${venueId}`, async () => venueRegion(await request(`/Venue/GetDetails?id=${venueId}`))); }
        catch (error) { if (error.status === 429) throw error; region.locationNote = "会場情報を取得できませんでした。"; }
      }
      const online = /id="tournament-headline-platform"[^>]*>[^<]*(?:MTG Online|MTG Arena)/i.test(html);
      if (online) region = { locationScope: "other", location: "オンライン大会", locationNote: "" };
      else if (region.locationScope === "unknown") region = factsheetRegion(html) || region;
      const rounds = [...html.matchAll(/<button\b(?=[^>]*data-id="(\d+)")(?=[^>]*class="[^"]*round-selector)[^>]*>/gi)].map(match => match[1]);
      return { ...region, rounds: [...new Set(rounds)] };
    });
  }
  function tableForm(start, length = 100) {
    return new URLSearchParams({ draw: "1", start: String(start), length: String(length), "order[0][column]": "0", "order[0][dir]": "asc", "columns[0][data]": "Rank" });
  }
  async function catalog({ format = "modern", days = 90, offset = 0, refresh = false } = {}) {
    if (!formats.includes(format) || ![30, 90, 180, 365].includes(days) || !Number.isInteger(offset) || offset < 0 || offset > 1900 || offset % 100) throw new Error("フォーマットと大会を探す期間を選んでください。");
    const key = `catalog:${format}:${days}:${offset}:${now().toISOString().slice(0, 10)}`;
    if (refresh) cache.delete(key);
    return cached(key, async () => {
      const until = now(), since = new Date(until.getTime() - days * 86400000), rows = []; let total = 0, scanned = 0, finished = false;
      for (let start = offset; start < Math.min(offset + 200, 2000) && !finished; start += 100) {
        const form = new URLSearchParams({ ordering: "StartDate", mode: "Table", "variables[draw]": "1", "variables[start]": String(start), "variables[length]": "100", "variables[order][0][column]": "0", "variables[order][0][dir]": "desc", "variables[columns][0][data]": "startDate" });
        for (const filter of ["MagicTheGathering", "Ended", format[0].toUpperCase() + format.slice(1)]) form.append("filters[]", filter);
        const page = await request("/Tournament/TournamentSearch", { form });
        if (!Array.isArray(page.data) || !Number.isInteger(page.recordsTotal)) throw new Error("Meleeの大会一覧の形式が変わりました。公式画面を確認してください。");
        total = page.recordsTotal; scanned += page.data.length;
        for (const row of page.data) {
          const date = new Date(row.startDate);
          if (date < since) finished = true;
          if (!Number.isFinite(date.getTime()) || date < since || date > until || row.gameDescription !== "Magic: The Gathering" || clean(row.formatString).toLowerCase() !== format || !Number.isSafeInteger(row.id) || row.id < 1) continue;
          rows.push({ id: row.id, name: clean(row.name), url: `${origin}/Tournament/View/${row.id}`, format, startDate: date.toISOString(), targetDate: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(date), organizer: clean(row.organizationName), registeredCount: Number.isInteger(row.enrolledPlayerCount) ? row.enrolledPlayerCount : null,
            eventScale: row.enrolledPlayerCount > 64 ? "competitive" : "grassroots" });
        }
        if (!page.data.length || start + page.data.length >= total) finished = true;
      }
      const unique = [...new Map(rows.map(row => [row.id, row])).values()];
      const events = await mapLimit(unique, 4, async event => {
        try { const { rounds, ...location } = await eventPage(event.id); return { ...event, ...location }; }
        catch (error) { if (error.status === 429) throw error; return { ...event, locationScope: "unknown", location: "会場所在地未確認", locationNote: "大会の会場情報を取得できませんでした。" }; }
      });
      events.sort((a, b) => b.startDate.localeCompare(a.startDate));
      return { events, source: "melee-public", fetchedAt: now().toISOString(), fromDate: since.toISOString().slice(0, 10), throughDate: until.toISOString().slice(0, 10), scannedCount: offset + scanned, limited: !finished, nextOffset: !finished && offset + 200 < 2000 ? offset + 200 : null };
    });
  }
  async function acquire(url) {
    url = meleeTournamentUrl(url); if (!url) throw new Error("Meleeの大会URLが不正です。");
    const id = Number(url.split("/").at(-1));
    const [details, page] = await Promise.all([request(`/Tournament/GetTournamentDetails?id=${id}`), eventPage(id)]);
    const format = clean(details.Format).toLowerCase();
    if (details.ID !== id || !formats.includes(format)) throw new Error("この大会は対応する構築フォーマットではありません。");
    if (!page.rounds.length) throw new Error("公開順位表がまだありません。非公開の提出リストは本人のAPI認証で取得してください。");
    const references = new Map(), teams = new Set(); let standingsCount = 0;
    // Start with the first round to include players who later dropped. If it
    // covers the field, later elimination rounds cannot reduce that field.
    for (const roundId of page.rounds) {
      let total = 0;
      for (let start = 0; start < 2000; start += 100) {
        const form = tableForm(start); form.set("roundId", roundId);
        const result = await request("/Standing/GetRoundStandings", { form });
        if (!Array.isArray(result.data) || !Number.isInteger(result.recordsTotal) || result.recordsTotal > 2000) throw new Error("公開順位表の全件を確認できません。1大会2000人まで対応しています。");
        total = result.recordsTotal; standingsCount = Math.max(standingsCount, total);
        for (const row of result.data) {
          if (row.TournamentId !== id) throw new Error("Meleeから別大会の順位表が返されました。");
          teams.add(row.TeamId);
          for (const deck of row.Decklists || []) if (guid.test(deck.DecklistId) && clean(deck.Format).toLowerCase() === format && !references.has(deck.DecklistId)) {
            const player = row.Team?.Players?.find(player => player.ID === deck.PlayerId);
            references.set(deck.DecklistId, { player: clean(player?.DisplayName), title: clean(deck.DecklistName) });
          }
        }
        if (start + result.data.length >= total) break;
        if (result.data.length !== 100) throw new Error("公開順位表のページが欠けています。取得し直してください。");
      }
      if (teams.size >= Number(details.ParticipatorCount)) break;
    }
    if (!references.size) throw new Error("この大会のデッキリストは公開されていません。本人のAPI認証と主催者からの取得許可が必要です。");
    const failures = [];
    const decks = (await mapLimit([...references], 4, async ([deckId, info]) => {
      try {
        const deck = await request(`/Decklist/GetDecklistDetails?id=${deckId}`);
        if (deck.Guid?.toLowerCase() !== deckId.toLowerCase() || deck.Game !== "MagicTheGathering" || clean(deck.FormatName).toLowerCase() !== format) throw new Error("デッキの大会・ゲーム・フォーマットを照合できません。");
        return { Guid: deck.Guid, Game: deck.Game, FormatName: deck.FormatName, DecklistName: clean(deck.DecklistName), Records: deck.Records?.map(row => ({ n: row.n, q: row.q, c: row.c })), TournamentId: id, OwnerDisplayName: info.player };
      } catch (error) { if (error.status === 429) throw error; failures.push({ name: info.player || info.title, message: error.message }); return null; }
    })).filter(Boolean);
    const participants = Math.max(Number(details.ParticipatorCount) || 0, standingsCount, teams.size);
    if (decks.length > participants) throw new Error("同じ参加者の複数リストがあり、大会全体の人数を確認できませんでした。対象フェーズを確認してください。");
    const tournament = importTournament({ url, name: clean(details.Name), format, targetDate: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(details.StartDate)), participants,
      locationScope: page.locationScope, location: page.location, eventScale: participants > 64 ? "competitive" : "grassroots", files: [{ name: "Melee公開リスト", content: JSON.stringify(decks) }] });
    tournament.method = "melee-public"; tournament.locationNote = page.locationNote;
    tournament.locationSourceUrl = page.locationSourceUrl || "";
    tournament.currentRegisteredCount = details.ParticipatorCount; tournament.standingsCount = standingsCount;
    tournament.failures.push(...failures); tournament.coverageComplete &&= !failures.length;
    return { ...tournamentSummary(tournament), decks: tournament.decks };
  }
  async function apiPages(path, credentials) {
    const entries = [];
    for (let page = 1; page <= 8; page++) {
      const separator = path.includes("?") ? "&" : "?";
      const result = await request(`${path}${separator}variables.page=${page}&variables.pageSize=250`, { credentials });
      if (!Array.isArray(result.content) || typeof result.hasMore !== "boolean") throw new Error("Melee APIの応答形式を確認できませんでした。認証情報とAPI利用許可を確認してください。");
      entries.push(...result.content);
      if (!result.hasMore) return entries;
    }
    throw new Error("Melee APIの取得上限2000件を超えています。対象を絞ってください。");
  }
  async function acquireApi(url, credentials) {
    url = meleeTournamentUrl(url); if (!url) throw new Error("Meleeの大会URLが不正です。");
    if (!credentials || typeof credentials !== "object") throw new Error("自分のMelee API用IDとシークレットを入力してください。");
    const id = Number(url.split("/").at(-1));
    const detailResult = await request(`/api/tournament/${id}`, { credentials });
    const details = detailResult.content;
    const name = clean(details?.Name ?? details?.name), format = clean(details?.FormatName ?? details?.Format ?? details?.format).toLowerCase();
    const startDate = details?.StartDate ?? details?.startDate;
    if (Number(details?.ID ?? details?.Id ?? details?.id) !== id || !formats.includes(format) || !Number.isFinite(Date.parse(startDate))) throw new Error("Melee APIの大会情報の形式を確認できませんでした。公式APIの応答を確認してください。");
    const decks = await apiPages(`/api/decklist/list/${id}`, credentials);
    // A private API response is never cached, logged or saved on the server.
    const tournament = importTournament({ url, name, format, targetDate: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(startDate)), participants: details.ParticipatorCount ?? details.EnrolledPlayerCount ?? "",
      files: [{ name: "Melee API", content: JSON.stringify(decks) }] });
    tournament.method = "melee-api";
    return { ...tournamentSummary(tournament), decks: tournament.decks };
  }
  return { catalog, acquire, acquireApi };
}

export const meleeClient = createMeleeClient();
