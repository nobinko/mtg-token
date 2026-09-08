import { resolveEnvironmentFromEvents } from "./environment.js";
import { imageRefFor, officialExpansionCode, officialExpansionName } from "./util.js";
import { tokenHints } from "./tokens.js";

export function dateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function preparationWindow(events, format, targetDate, input, today = new Date().toISOString().slice(0, 10)) {
  if (!input) return null;
  const setCode = String(input.setCode || "").trim().toLowerCase();
  const startsAt = input.startsAt;
  if (!/^[a-z0-9]{2,8}$/.test(setCode) || !dateOnly(startsAt) || !dateOnly(targetDate) || startsAt > targetDate) throw new Error("対象セットコードと大会日以前の構築適用日を指定してください。");
  const before = new Date(Date.parse(`${startsAt}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const endDate = [before, today].sort()[0];
  const previous = resolveEnvironmentFromEvents(events, format, endDate);
  if (!previous.resolved) throw new Error("直前環境の開始日を確定できません。");
  return { setCode, startsAt, startDate: previous.startDate, endDate, previous,
    warning: "直前環境の採用実績です。当日のメタ予測ではありません。禁止・ローテーション・新メカニズムの未確認事項は大会前に再確認してください。" };
}

export function preparationSources(cards, format, startsAt, today = new Date().toISOString().slice(0, 10)) {
  return cards.filter((card) => {
    const legality = card.legalities?.[format];
    return legality === "legal" || (startsAt > today && legality === "not_legal");
  }).map((card) => {
    const image = imageRefFor(card);
    return { id: card.id, raw: card, name: card.name, typeLine: card.type_line || "", set: officialExpansionCode(card.set), setName: officialExpansionName(card.set_name),
      releasedAt: card.released_at || "", image: image.url, imageSource: image.source, imageSourceLabel: image.sourceLabel, imageSourceUrl: image.sourceUrl,
      scryfallUri: card.scryfall_uri, oracleText: card.oracle_text || "", tokenHints: tokenHints(card),
      deckCount: 0, deckUrls: [], decks: [], sources: [], legalityUnconfirmed: card.legalities?.[format] !== "legal" };
  });
}
