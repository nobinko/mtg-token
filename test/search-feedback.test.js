import assert from "node:assert/strict";
import test from "node:test";
import { searchIssues, searchCoverageMessage, searchCoverageBasis } from "../public/search-feedback.js";

test("reaching the requested sample still discloses an unavailable source without inventing a missing deck count", () => {
  const data = { requestedDeckCount: 299, searchedDeckCount: 299, unparsedDeckCount: 0,
    sourceIssues: [{ kind: "missing-deck-data", unit: "page", count: 1, url: "https://www.mtgo.com/decklist/example" }] };
  const feedback = searchCoverageMessage(data);
  assert.equal(feedback.hasIssues, true);
  assert.equal(feedback.title, "299件を集計済み（指定 299件）。");
  assert.match(feedback.detail, /デッキ内容がないページ 1件/);
  assert.doesNotMatch(feedback.detail, /リスト 1件|失敗したページ/);
  assert.match(feedback.detail, /準備表・割合に含まれません/);
});

test("requested sample shortfalls remain visible even when the crawl hits a safety limit", () => {
  const feedback = searchCoverageMessage({ requestedDeckCount: 299, searchedDeckCount: 18, sourceExhausted: false });
  assert.equal(feedback.hasIssues, true);
  assert.match(feedback.title, /299件.*18件/);
  assert.match(feedback.detail, /取得できたリストだけ/);
  assert.equal(searchCoverageMessage({ requestedDeckCount: 299, searchedDeckCount: 299 }).hasIssues, false);
  assert.equal(searchCoverageMessage({ searchedDeckCount: 18, tournament: {} }).hasIssues, false);
});

test("extraction counts and fetch failures stay separate without double counting detailed records", () => {
  const data = { searchedDeckCount: 25, unparsedDeckCount: 3,
    sourceIssues: [{ kind: "parse-failed", unit: "deck", count: 2, message: "Partial lists" }],
    errors: [{ url: "https://example.com/blocked", message: "bot-challenge" }, { url: "https://example.com/timeout", message: "timeout (25s)" }] };
  const issues = searchIssues(data);
  assert.equal(issues.filter(issue => issue.unit === "deck").reduce((sum, issue) => sum + issue.count, 0), 3);
  assert.match(issues[1].message, /自動取得を制限/);
  assert.match(searchCoverageMessage(data).detail, /失敗したページ 2件.*リスト 3件/);
});

test("visible coverage names the result format, period and sample independently of token types", () => {
  assert.equal(searchCoverageBasis({ format: "legacy", environmentStartDate: "2026-10-02", targetDate: "2026-10-19", requestedDeckCount: 300, searchedDeckCount: 300 }), "レガシー：2026-10-02〜2026-10-19の公開リスト 300件を集計（取得目標 300件）。上の数字は用意するトークン・補助カードの種類数です。");
  assert.match(searchCoverageBasis({ format: "standard", tournament: {}, searchedDeckCount: 6 }), /スタンダード：この大会の提出リスト 6件/);
  assert.doesNotMatch(searchCoverageBasis({ format: "pioneer", tournament: {}, searchedDeckCount: 32 }), /取得目標/);
});
