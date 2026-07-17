import { join, resolve } from "node:path";

export const port = Number(process.env.PORT || 5177);
export const userAgent = "mtg-token-finder/0.2 (+local broadcast prep tool)";
export const scryfallDelayMs = 125;
export const scryfallSearchDelayMs = 550;
// mtgo.com の個別デッキページは埋め込みJSONが大きく15秒では間に合わないことがある
export const fetchTimeoutMs = 25_000;
// シード（巡回元インデックス）ページのキャッシュ再利用上限。
// 新しいデッキはインデックスページに現れるため、ここが古いままだと検索結果が静かに古くなる。
// 個別デッキページは公開後に変化しないため無期限に再利用する。
export const seedPageMaxAgeMs = 6 * 60 * 60 * 1000;
export const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
export const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const root = resolve(".");
export const publicDir = join(root, "public");
export const cacheDir = join(root, ".cache", "pages");
export const maxMatchedCards = 600;
export const scryfallCacheTtlMs = 24 * 60 * 60 * 1000;
