import { officialImageOverrides } from "./data.js";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function toIsoDate(value) {
  if (!value) return "";
  const direct = String(value).match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function imageFor(card) {
  if (card.image_uris?.normal) return card.image_uris.normal;
  return card.card_faces?.find((face) => face.image_uris?.normal)?.image_uris.normal || "";
}

export function gathererImageFor(card) {
  const multiverseId = card?.multiverse_ids?.[0];
  if (!multiverseId) return "";
  return `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${multiverseId}&type=card`;
}

export function imageRefFor(card) {
  const override = officialImageOverrideFor(card);
  if (override) return override;

  const gathererImage = gathererImageFor(card);
  if (gathererImage) {
    return {
      url: gathererImage,
      source: "gatherer",
      sourceLabel: "Wizards公式DB",
      sourceUrl: `https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${card.multiverse_ids[0]}`
    };
  }

  const scryfallImage = imageFor(card);
  return {
    url: scryfallImage,
    source: scryfallImage ? "scryfall" : "none",
    sourceLabel: scryfallImage ? "Scryfall fallback" : "画像なし",
    sourceUrl: card?.scryfall_uri || ""
  };
}

function officialImageOverrideFor(card) {
  if (!card) return null;
  const cardName = String(card.name || "").toLowerCase();
  const cardSet = String(card.set || "").toLowerCase();
  const cardLang = String(card.lang || "").toLowerCase();
  const collectorNumber = String(card.collector_number || "").toLowerCase();
  const match = officialImageOverrides.find((entry) => {
    if (entry.name && String(entry.name).toLowerCase() !== cardName) return false;
    if (entry.set && String(entry.set).toLowerCase() !== cardSet) return false;
    if (entry.lang && String(entry.lang).toLowerCase() !== cardLang) return false;
    if (entry.collectorNumber && String(entry.collectorNumber).toLowerCase() !== collectorNumber) return false;
    return Boolean(entry.image);
  });

  if (!match) return null;
  return {
    url: match.image,
    source: "wizards-gallery",
    sourceLabel: "Wizards公式ギャラリー",
    sourceUrl: match.sourceUrl || match.image
  };
}

export function officialExpansionCode(setCode) {
  const code = String(setCode || "").toUpperCase();
  if (/^T[A-Z0-9]{3,}$/.test(code)) return code.slice(1);
  return code;
}

export function officialExpansionName(setName) {
  return String(setName || "").replace(/\s+Tokens$/i, "");
}
