import test from "node:test";
import assert from "node:assert/strict";
import { createMeleeClient, venueRegion, factsheetRegion } from "../lib/melee.js";

const date = new Date("2026-10-16T01:00:00Z");
const eventUrl = "https://melee.gg/Tournament/View/123";
const deckId = index => `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`;
const deck = index => ({ Guid: deckId(index), Game: "MagicTheGathering", FormatName: "Modern", DecklistName: "Public deck", Records: [{ n: "Ocelot Pride", q: 4, c: 0 }, { n: "Plains", q: 56, c: 0 }, { n: "Dispel", q: 14, c: 99 }, { n: "Kaheera, the Orphanguard", q: 1, c: 4 }], PrivateAccount: "discard-this-private-field" });
const row = index => ({ TournamentId: 123, TeamId: index, Team: { Players: [{ ID: index, DisplayName: `Player ${index}`, Username: "private-username" }] }, Decklists: [{ DecklistId: deckId(index), PlayerId: index, Format: "Modern" }] });
const response = (body, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const pageHtml = id => `<input name="tournament-id" value="${id}"><a data-id="${id}" data-type="venue">Venue</a><button class="round-selector" data-id="987">Round 1</button><button class="round-selector" data-id="988">Final</button>`;

test("domestic classification uses venue evidence, including the actual Yokohama country-code conflict", () => {
  assert.equal(venueRegion({ AddressCountry: "JP" }).locationScope, "jp");
  const yokohama = venueRegion({ AddressCountry: "US", AddressState: "Kanagawa", AddressPostalCode: "220-0012", AddressCity: "Yokohama" });
  assert.equal(yokohama.locationScope, "jp"); assert.match(yokohama.locationNote, /不一致/);
  assert.equal(venueRegion({ AddressCountry: "US", AddressState: "California", Name: "Japan Cup" }).locationScope, "other");
  assert.equal(venueRegion({ AddressState: "Tokyo", AddressPostalCode: "90210" }).locationScope, "unknown");
  assert.equal(venueRegion({ Name: "日本語の大会" }).locationScope, "unknown");
});

test("catalog is live public data, keeps tiny events and excludes future, old and other-format rows", async () => {
  const calls = [];
  const base = { gameDescription: "Magic: The Gathering", startDate: "2026-10-03T01:00:00Z", formatString: "Modern", enrolledPlayerCount: 3, organizationName: "Store" };
  const client = createMeleeClient({ now: () => date, fetchImpl: async (url, init) => {
    calls.push({ url, init }); assert.equal(init.headers.authorization, undefined);
    if (url.endsWith("/Tournament/TournamentSearch")) {
      const form = new URLSearchParams(init.body); assert.equal(form.get("variables[order][0][dir]"), "desc"); assert.deepEqual(form.getAll("filters[]"), ["MagicTheGathering", "Ended", "Modern"]);
      return response({ recordsTotal: 5, data: [{ ...base, id: 123, name: "English named local event" }, { ...base, id: 124, name: "日本語の海外大会" }, { ...base, id: 125, name: "Future", startDate: "2026-10-17" }, { ...base, id: 126, name: "Old", startDate: "2025-01-01" }, { ...base, id: 127, name: "Legacy", formatString: "Legacy" }] });
    }
    if (url.includes("/Tournament/View/")) return response(pageHtml(url.split("/").at(-1)));
    if (url.endsWith("id=123")) return response({ AddressCountry: "JP", Name: "Local store" });
    return response({ AddressCountry: "US", Name: "Overseas store" });
  } });
  const result = await client.catalog();
  assert.equal(result.events.length, 2); assert.equal(result.events[0].locationScope, "jp"); assert.equal(result.events[0].eventScale, "grassroots"); assert.equal(result.events[0].registeredCount, 3);
  assert.equal(result.events[1].locationScope, "other"); assert.equal(result.nextOffset, null);
  await client.catalog(); assert.equal(calls.filter(call => call.url.endsWith("TournamentSearch")).length, 1, "Only public catalog metadata is cached");
});

test("an unregistered venue needs an exact verified organizer source and matching date", () => {
  const factsheet = '<p id="tournament-headline-start-date-field"><span data-value="2026-08-08T02:00:00Z"></span></p><a href="https://note.com/massan_gabagaba/n/n24918c646d37?sub_rt=share_pw">Event details</a>';
  assert.equal(factsheetRegion(factsheet).locationScope, "jp");
  assert.equal(factsheetRegion(factsheet.replace("2026-08-08", "2026-08-09")), null);
  assert.equal(factsheetRegion(factsheet.replace("massan_gabagaba", "someone-else")), null);
});

function publicFixture({ count = 101, missing = false, pageHole = false, forbiddenDeck = false, beforeFetch, sleep } = {}) {
  const calls = [];
  return { calls, client: createMeleeClient({ now: () => date, sleep, fetchImpl: async (url, init) => {
    calls.push({ url, init }); assert.equal(init.headers.authorization, undefined);
    const intercepted = await beforeFetch?.(url, init);
    if (intercepted) return intercepted;
    if (url.includes("GetTournamentDetails")) return response({ ID: 123, Name: "Recent domestic event", Format: "Modern", StartDate: "2026-10-03T01:00:00Z", ParticipatorCount: count - 1 });
    if (url.includes("/Tournament/View/")) return response(pageHtml(123));
    if (url.includes("/Venue/GetDetails")) return response({ AddressCountry: "JP", Name: "Store" });
    if (url.endsWith("GetRoundStandings")) {
      const form = new URLSearchParams(init.body); assert.equal(form.get("roundId"), "987", "Later top-cut rounds must not replace the full first-round field");
      const start = Number(form.get("start")); const rows = Array.from({ length: Math.min(100, count - start) }, (_, index) => row(start + index + 1));
      if (missing) rows.at(-1).Decklists = [];
      return response({ recordsTotal: count, data: pageHole ? rows.slice(0, 25) : rows });
    }
    if (forbiddenDeck) return response("Forbidden", 403);
    return response(deck(Number(new URL(url).searchParams.get("id").slice(-12))));
  } }) };
}

test("direct acquisition pages through the entire field, preserves companion and strips account fields", async () => {
  const fixture = publicFixture(); const result = await fixture.client.acquire(eventUrl);
  assert.equal(result.deckCount, 101); assert.equal(result.registeredCount, 101); assert.equal(result.currentRegisteredCount, 100);
  assert.equal(result.coverageComplete, true); assert.equal(result.method, "melee-public");
  assert.equal(result.decks[0].mainboardCount, 60); assert.equal(result.decks[0].sideboardCount, 15);
  assert.equal(fixture.calls.filter(call => call.url.endsWith("GetRoundStandings")).length, 2);
  assert.equal(/private-username|PrivateAccount|discard-this-private-field/.test(JSON.stringify(result)), false);
});

test("missing public lists remain incomplete and a truncated standings page fails closed", async () => {
  const incomplete = await publicFixture({ count: 3, missing: true }).client.acquire(eventUrl);
  assert.equal(incomplete.deckCount, 2); assert.equal(incomplete.missingCount, 1); assert.equal(incomplete.coverageComplete, false);
  await assert.rejects(publicFixture({ pageHole: true }).client.acquire(eventUrl), /ページが欠け/);
  await assert.rejects(publicFixture({ count: 1, forbiddenDeck: true }).client.acquire(eventUrl), /完全リストがありません/);
});

test("invalid tournament URLs never become arbitrary network targets", async () => {
  const client = createMeleeClient({ fetchImpl: async () => { throw new Error("Must not fetch"); } });
  for (const url of ["https://evil.test/Tournament/View/123", "http://melee.gg/Tournament/View/123", "https://melee.gg@evil.test/Tournament/View/123"]) await assert.rejects(client.acquire(url), /大会URLが不正/);
});

test("official API authentication is per request, paginated and never reused for another user", async () => {
  const authorizations = [];
  const client = createMeleeClient({ fetchImpl: async (url, init) => {
    authorizations.push(init.headers.authorization);
    if (url.endsWith("/api/tournament/123")) return response({ content: { ID: 123, Name: "Private event", FormatName: "Modern", StartDate: "2026-10-03T01:00:00Z", ParticipatorCount: 2 } });
    const page = Number(new URL(url).searchParams.get("variables.page"));
    return response({ content: [{ ...deck(page), TournamentId: 123 }], hasMore: page === 1 });
  } });
  for (const id of ["user-a", "user-b"]) {
    const result = await client.acquireApi(eventUrl, { id, secret: `secret-${id}` });
    assert.equal(result.deckCount, 2); assert.equal(result.method, "melee-api"); assert.equal(JSON.stringify(result).includes("secret-"), false);
  }
  assert.deepEqual(authorizations, ["user-a", "user-b"].flatMap(id => Array(3).fill(`Basic ${Buffer.from(`${id}:secret-${id}`).toString("base64")}`)));
  await assert.rejects(client.acquireApi(eventUrl), /自分のMelee API/);
});

test("authentication failure and unknown official response schemas stay explicit", async () => {
  const credentials = { id: "person", secret: "never-echo-this" };
  const unauthorized = createMeleeClient({ fetchImpl: async () => response("Server body contains never-echo-this", 401) });
  await assert.rejects(unauthorized.acquireApi(eventUrl, credentials), error => /API認証に失敗/.test(error.message) && !error.message.includes(credentials.secret));
  const changed = createMeleeClient({ fetchImpl: async () => response({ content: { unexpected: true } }) });
  await assert.rejects(changed.acquireApi(eventUrl, credentials), /大会情報の形式を確認できません/);
});

test("transient header, standings and body failures recover without dropping public decks", async () => {
  const attempts = new Map(), waits = [], released = [];
  const fixture = publicFixture({ count: 3, sleep: async delay => waits.push(delay), beforeFetch: async (url, init) => {
    const key = new URL(url).pathname;
    const attempt = (attempts.get(key) || 0) + 1; attempts.set(key, attempt);
    if (key.endsWith("GetTournamentDetails") && attempt === 1) throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
    if (key.endsWith("GetRoundStandings") && attempt === 1) {
      assert.equal(init.method, "POST");
      return { ok: false, status: 503, body: { cancel: async () => released.push(key) } };
    }
    if (key.endsWith("GetDecklistDetails") && attempt === 1) return { ok: true, text: async () => { throw new TypeError("terminated", { cause: { code: "UND_ERR_SOCKET" } }); } };
  } });
  const result = await fixture.client.acquire(eventUrl);
  assert.equal(result.deckCount, 3); assert.equal(result.coverageComplete, true); assert.deepEqual(result.failures, []);
  assert.equal(attempts.get("/Decklist/GetDecklistDetails"), 4, "Only the interrupted deck is fetched again");
  assert.equal(attempts.get("/Standing/GetRoundStandings"), 2);
  assert.deepEqual(waits, [750, 750, 750]); assert.deepEqual(released, ["/Standing/GetRoundStandings"]);
});

test("timeouts stop after bounded retries and do not poison the public catalog cache", async () => {
  const waits = [], signals = []; let calls = 0;
  const client = createMeleeClient({ sleep: async delay => waits.push(delay), fetchImpl: async (url, init) => {
    signals.push(init.signal);
    if (++calls <= 3) throw new DOMException("request contains secret", "TimeoutError");
    return response({ recordsTotal: 0, data: [] });
  } });
  await assert.rejects(client.catalog(), error => error.status === 504 && /時間内/.test(error.message) && !/secret/.test(error.message));
  assert.equal(calls, 3); assert.deepEqual(waits, [750, 2000]); assert.equal(new Set(signals).size, 3, "Each retry gets its own timeout");
  const result = await client.catalog(); assert.deepEqual(result.events, []); assert.equal(calls, 4);
});

test("authentication, access denial, rate limits, redirect and TLS errors are never retried", async () => {
  const credentials = { id: "person", secret: "never-echo-this" };
  for (const status of [401, 403, 404, 429]) {
    let calls = 0;
    const client = createMeleeClient({ sleep: async () => assert.fail("Must not retry"), fetchImpl: async () => { calls++; return response(credentials.secret, status); } });
    await assert.rejects(client.acquireApi(eventUrl, credentials), error => error.status === status && !error.message.includes(credentials.secret));
    assert.equal(calls, 1);
  }
  for (const cause of [new Error("unexpected redirect"), { code: "CERT_HAS_EXPIRED" }]) {
    let calls = 0;
    const client = createMeleeClient({ sleep: async () => assert.fail("Must not retry"), fetchImpl: async () => { calls++; throw new TypeError(credentials.secret, { cause }); } });
    await assert.rejects(client.acquireApi(eventUrl, credentials), error => /接続/.test(error.message) && !error.message.includes(credentials.secret));
    assert.equal(calls, 1);
  }
});

test("an interrupted deck after the retry limit remains missing rather than complete", async () => {
  let attempts = 0;
  const fixture = publicFixture({ count: 2, sleep: async () => {}, beforeFetch: async url => {
    if (url.includes("GetDecklistDetails") && url.endsWith(deckId(1))) { attempts++; throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }); }
  } });
  const result = await fixture.client.acquire(eventUrl);
  assert.equal(attempts, 3); assert.equal(result.deckCount, 1); assert.equal(result.missingCount, 1);
  assert.equal(result.coverageComplete, false); assert.equal(result.failures.length, 1); assert.match(result.failures[0].message, /接続/);
});
