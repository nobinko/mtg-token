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

export function officialExpansionCode(setCode) {
  const code = String(setCode || "").toUpperCase();
  if (/^T[A-Z0-9]{3,}$/.test(code)) return code.slice(1);
  return code;
}

export function officialExpansionName(setName) {
  return String(setName || "").replace(/\s+Tokens$/i, "");
}
