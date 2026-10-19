// Keep a missing source page distinct from a known number of unreadable decks.
export function searchIssues(data) {
  const issues = [...(data.sourceIssues || [])];
  for (const error of data.errors || []) {
    issues.push({ url: error.url, kind: "fetch-failed", unit: "page", count: 1,
      message: error.message === "bot-challenge" ? "掲載元が自動取得を制限しています。" : `ページを取得できませんでした: ${error.message}` });
  }
  const detailedCount = issues.filter(issue => issue.unit === "deck").reduce((sum, issue) => sum + (issue.count || 0), 0);
  if ((data.unparsedDeckCount || 0) > detailedCount) issues.push({ kind: "parse-failed", unit: "deck",
    count: data.unparsedDeckCount - detailedCount, message: "カード内容を読み取れないリストを除外しました。" });
  return issues;
}

export function searchCoverageMessage(data) {
  const count = data.searchedDeckCount || 0;
  const requested = data.requestedDeckCount || 0;
  const issues = searchIssues(data);
  const shortfall = requested > count;
  const missingPages = issues.filter(issue => issue.kind === "missing-deck-data").length;
  const failedPages = issues.filter(issue => issue.unit === "page" && issue.kind !== "missing-deck-data").length;
  const failedDecks = issues.filter(issue => issue.unit === "deck").reduce((sum, issue) => sum + issue.count, 0);
  const parts = [];
  if (missingPages) parts.push(`掲載元にデッキ内容がないページ ${missingPages}件`);
  if (failedPages) parts.push(`取得・読み取りに失敗したページ ${failedPages}件`);
  if (failedDecks) parts.push(`カード内容を読み取れないリスト ${failedDecks}件`);
  const collected = `${count}件を集計済み${requested ? `（指定 ${requested}件）` : ""}`;
  return { hasIssues: issues.length > 0 || shortfall,
    title: shortfall ? `${requested}件を指定しましたが、集計できたのは${count}件です。` : `${collected}。`,
    detail: parts.length ? `${parts.join("、")}を除外しました。除外分は準備表・割合に含まれません。`
      : shortfall ? "取得できたリストだけで準備表と割合を計算しています。" : "" };
}

export function searchCoverageBasis(data) {
  const format = { modern: "モダン", legacy: "レガシー", standard: "スタンダード", pioneer: "パイオニア" }[data.format] || data.format || "";
  const count = data.searchedDeckCount || 0;
  if (data.tournament) return `${format}：この大会の提出リスト ${count}件から作成。上の数字は用意するトークン・補助カードの種類数です。`;
  const period = data.environmentStartDate && data.targetDate ? `${data.environmentStartDate}〜${data.targetDate}の` : "";
  const limit = data.requestedDeckCount ? `（取得目標 ${data.requestedDeckCount}件）` : "";
  return `${format}：${period}公開リスト ${count}件を集計${limit}。上の数字は用意するトークン・補助カードの種類数です。`;
}
