import test from "node:test";
import assert from "node:assert/strict";
import { selectTournaments, meleeSearchUrl } from "../public/tournament-library.js";

const events = [
  { url: "https://melee.gg/Tournament/View/1", name: "店舗の8人大会", targetDate: "2026-10-12", locationScope: "jp", location: "東京都", eventScale: "grassroots" },
  { url: "https://melee.gg/Tournament/View/2", name: "国内競技大会", targetDate: "2026-10-03", locationScope: "jp", eventScale: "competitive" },
  { url: "https://melee.gg/Tournament/View/3", name: "Japan Cup abroad", targetDate: "2026-10-15", locationScope: "other", eventScale: "grassroots" },
  { url: "https://melee.gg/Tournament/View/4", name: "日本語名でも所在地は未確認", targetDate: "2026-10-14" }
];

test("domestic selection uses declared location, accepts grassroots events and sorts recent first", () => {
  assert.deepEqual(selectTournaments(events).map(event => event.url), [events[0].url, events[1].url]);
  assert.deepEqual(selectTournaments(events, { scale: "grassroots", query: "東京" }).map(event => event.url), [events[0].url]);
  assert.deepEqual(selectTournaments(events, { region: "other" }).map(event => event.url), [events[2].url, events[3].url]);
});

test("official discovery links preserve UTF-8 search and never imply an authenticated connection", () => {
  const url = new URL(meleeSearchUrl({ query: "東京" }));
  assert.equal(url.origin, "https://melee.gg");
  const query = JSON.parse(Buffer.from(url.searchParams.get("q"), "base64").toString("utf8"));
  assert.deepEqual(query, { context: 2, game: "MagicTheGathering", search: "Japan 東京", filters: ["Past"] });
  assert.equal(JSON.parse(Buffer.from(new URL(meleeSearchUrl({ region: "other" })).searchParams.get("q"), "base64")).search, null);
});
