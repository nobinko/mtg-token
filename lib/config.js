import { join, resolve } from "node:path";

export const port = Number(process.env.PORT || 5177);
export const userAgent = "mtg-token-finder/0.2 (+local broadcast prep tool)";
export const scryfallDelayMs = 125;
export const fetchTimeoutMs = 15_000;
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
export const maxMatchedCards = 100;
export const scryfallCacheTtlMs = 4 * 60 * 60 * 1000;
