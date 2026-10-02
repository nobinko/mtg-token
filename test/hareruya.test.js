import test from "node:test";
import assert from "node:assert/strict";
import { canonicalHareruyaUrl, hareruyaApiUrl, hareruyaArticleLinks, hareruyaHtmlEntries, hareruyaJsonEntry, hareruyaArticleContext, hareruyaArticleDate } from "../lib/hareruya.js";

const oldUrl = "https://www.hareruyamtg.com/en/deck/123/show/";

test("Hareruya publication dates use the Japanese day at a UTC midnight boundary", () => {
  assert.equal(hareruyaArticleDate('<meta property="article:published_time" content="2026-09-30T15:01:00+00:00">'), "2026-10-01");
});
const info = (key, value) => `<ul class="deckSearch-deckList__information__flex__list"><li class="deckSearch-deckList__information__list__header">${key}</li><li class="deckSearch-deckList__information__list__body">${value}</li></ul>`;
const row = (count, name) => `<div><span>${count}</span><a class="popup_product" data-card_id="1">${name}</a></div>`;
const oldHtml = `${info("Format", "Modern")}${info("Tournament", "Modern Championship")}${info("Player", "Test Player")}${info("Date", "2026/9/26")}
 <div class="deckSearch-deckList__deckList__container"><div class="deckSearch-deckList__deckList__container__text--land">${row(56, "Island")}${row(4, "Castle Ardenvale")}</div>
 <div class="deckSearch-deckList__deckList__container__text--sideboard">${row(15, "Dispel")}</div></div><div class="deckSearch-deckList__buyAllButtonWrapper"></div>
 <aside>${row(4, "Sidebar Card")}</aside>`;

test("old Hareruya English card table preserves zones, event date and player without sidebar hits", () => {
  const [deck] = hareruyaHtmlEntries(oldHtml, oldUrl, "Test", "modern");
  assert.equal(deck.mainboardCount, 60);
  assert.equal(deck.sideboardCount, 15);
  assert.deepEqual(deck.cards, ["Island", "Castle Ardenvale", "Dispel"]);
  assert.equal(deck.eventDate, "2026-09-26");
  assert.equal(deck.player, "Test Player");
  assert.equal(hareruyaHtmlEntries(oldHtml, oldUrl, "Test", "legacy").length, 0);
  assert.equal(canonicalHareruyaUrl(oldUrl.replace("/en/", "/ja/")), oldUrl);
});

const data = { code: 200, deck_private_flag: false, format_name_en: "Modern", event_date: "2026/09/26", event_name_en: "Modern Championship", player_name: "Test Player",
  cards: [{ name_en: "Island", count: 56, board_id: 1 }, { name_en: "Castle Ardenvale", count: 4, board_id: 1 }, { name_en: "Dispel", count: 15, board_id: 2 }, { name_en: "Maybe Card", count: 4, board_id: 3 }] };

test("public embed API keeps English names and ignores maybeboards and other formats", () => {
  const url = "https://www.hareruyamtg.com/decks/123?display_token=public-token";
  assert.equal(hareruyaApiUrl(url), "https://api.deck.hareruyamtg.com/api/deck/123?display_token=public-token");
  const deck = hareruyaJsonEntry(data, url, "modern");
  assert.equal(deck.mainboardCount, 60);
  assert.equal(deck.sideboardCount, 15);
  assert.equal(deck.cards.includes("Maybe Card"), false);
  assert.equal(hareruyaJsonEntry(data, url, "legacy"), null);
  assert.equal(hareruyaJsonEntry({ ...data, deck_private_flag: true }, url, "modern"), null);
  assert.equal(hareruyaJsonEntry({ ...data, code: 404 }, url, "modern"), null);
  const undated = hareruyaJsonEntry({ ...data, event_date: null }, url, "modern");
  assert.equal(undated.eventDate, "");
  const coverage = hareruyaJsonEntry({ ...data, event_date: null }, url, "modern", { articleUrl: "https://article.hareruyamtg.com/article/321/", publishedDate: "2026-09-27", allowPublicationDate: true });
  assert.equal(coverage.eventDate, "2026-09-27");
  assert.equal(coverage.dateBasis, "coverage-publication");
});

test("format article index discovers only relevant dated coverage and stops at old pages", () => {
  const article = (id, title, date) => `<article><a href="/article/${id}/"><p class="info__title">${title}</p><p class="info__date">${date}</p></a></article>`;
  const base = "https://article.hareruyamtg.com/article/tag/modern/";
  const html = article(1, "トップ8デッキリスト", "2026/09/26") + article(2, "トップ8デッキリスト", "2026/09/01")
    + article(3, "デッキリスト", "2026/10/05") + article(4, "注目カードトップ3！", "2026/09/26") + '<a href="/article/tag/modern/page/2/">次へ</a>';
  assert.deepEqual(hareruyaArticleLinks(html, base, { environmentStartDate: "2026-09-25", targetDate: "2026-10-02" }), ["https://article.hareruyamtg.com/article/1/", "https://article.hareruyamtg.com/article/tag/modern/page/2/"]);
  assert.deepEqual(hareruyaArticleLinks(article(2, "トップ8デッキリスト", "2026/09/01"), base, { environmentStartDate: "2026-09-25" }), []);
});

test("article deck embeds cross domains; general commentary cannot inherit a tournament date", () => {
  const base = "https://article.hareruyamtg.com/article/321/";
  const html = '<deck-embedder deckid="123" token="public-token"></deck-embedder><a href="https://www.hareruyamtg.com/decks/123?display_token=public-token">デッキリスト</a><a href="/article/111/">古い記事</a>';
  assert.deepEqual(hareruyaArticleLinks(html, base), ["https://www.hareruyamtg.com/decks/123?display_token=public-token"]);
  assert.equal(hareruyaArticleContext({ url: base, title: "カード紹介", html: `${html}モダン神決定戦 トップ8デッキリスト` }).allowPublicationDate, false);
  assert.equal(hareruyaArticleContext({ url: base, title: "トップ8デッキリスト", html: "モダン神決定戦" }).allowPublicationDate, true);
});
