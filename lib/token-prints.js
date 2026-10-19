// Tokens commonly have booster:false even when included in boosters. Use the
// token set's parent product, not that flag alone, to recognize regular prints.
const boosterSetTypes = new Set(["expansion", "core", "masters", "draft_innovation"]);
import { tokenSignature } from "../public/object-identity.js";
import { isModernSet, modernAdditionalSetCodes, supplementalSetForFormat } from "./modern-sets.js";
import { auxiliaryForObject } from "./auxiliary.js";

export function tokenProductCode(card, sets) {
  return sets.get(card.set)?.parent_set_code || card.set;
}

// Ordinary inventory plus products that introduce cards into the selected
// format. A Commander child must never inherit its parent's Modern eligibility.
export function stockTokenProduct(card, sets, { format = "" } = {}) {
  if (tokenPrintRank(card, sets) >= 2) return null;
  const codes = sourceTokenProducts(card.set, sets);
  const eligible = (set) => set && !set.digital && (set.set_type === "token"
    || supplementalSetForFormat(set, format)
    || (!modernAdditionalSetCodes.includes(set.code) && ["expansion", "core"].includes(set.set_type)));
  if (codes.some((code) => !eligible(sets.get(code)))) return null;
  const commander = codes.map((code) => sets.get(code)).find((set) => set.set_type === "commander");
  const product = commander || sets.get(codes.at(-1));
  return product?.set_type !== "token" && eligible(product) ? product : null;
}

export function sourceTokenProducts(setCode, sets) {
  const codes = [];
  let code = String(setCode || "").toLowerCase();
  while (code && !codes.includes(code)) {
    codes.push(code);
    code = sets.get(code)?.parent_set_code;
  }
  return codes;
}

export function sameTokenIdentity(a, b) {
  if (!a?.oracle_id || a.oracle_id !== b?.oracle_id) return false;
  return tokenSignature(a) === tokenSignature(b);
}

export function tokenPrintRank(card, sets) {
  if (card.digital || !card.games?.includes("paper")) return 3;
  const set = sets.get(card.set);
  const parent = set?.parent_set_code ? sets.get(set.parent_set_code) : set;
  // Undercity's ordinary insert uses an inverted frame. That frame alone
  // does not make a known dungeon insert a special collectible variant.
  const ordinaryDungeon = auxiliaryForObject(card)?.dungeon && set?.set_type === "token";
  if (card.promo || ["sld", "slc"].includes(card.set)
    || ["promo", "memorabilia"].includes(set?.set_type)
    || (card.frame_effects || []).some((effect) => ["showcase", "extendedart", "inverted"].includes(effect) && !(effect === "inverted" && ordinaryDungeon))
    || card.textless) return 2;
  if (boosterSetTypes.has(parent?.set_type) && !parent.digital) return 0;
  return 1;
}

export function chooseTokenPrint(reference, prints, sets, { lang = "en", today = new Date().toISOString().slice(0, 10), sameSet = false, preferredSet = "", modernOnly = false, stockOnly = false, format = modernOnly ? "modern" : "", sourceReleasedAt = "" } = {}) {
  const products = sourceTokenProducts(preferredSet, sets);
  const preference = (card) => { const index = products.indexOf(tokenProductCode(card, sets)); return index < 0 ? Infinity : index; };
  const dateOrder = (a, b) => {
    if (modernOnly && sourceReleasedAt) {
      const laterA = a.released_at > sourceReleasedAt;
      const laterB = b.released_at > sourceReleasedAt;
      if (laterA !== laterB) return Number(laterA) - Number(laterB);
      if (laterA) return String(a.released_at || "").localeCompare(String(b.released_at || ""));
    }
    return String(b.released_at || "").localeCompare(String(a.released_at || ""));
  };
  return prints.filter((card) => sameTokenIdentity(reference, card)
    && card.lang === lang && tokenPrintRank(card, sets) < 3
    && (!stockOnly || stockTokenProduct(card, sets, { format }))
    && (!card.released_at || card.released_at <= today)
    && (!modernOnly || isModernSet(sets.get(tokenProductCode(card, sets))))
    && (!sameSet || card.set === reference.set))
    .sort((a, b) => tokenPrintRank(a, sets) - tokenPrintRank(b, sets)
      || (preference(a) === preference(b) ? 0 : preference(a) - preference(b))
      || dateOrder(a, b)
      || String(a.collector_number || "").localeCompare(String(b.collector_number || ""), "en", { numeric: true })
      || a.id.localeCompare(b.id))[0] || null;
}

export function chooseAlternateTokenPrints(reference, prints, sets, { lang = "en", today = new Date().toISOString().slice(0, 10), includeCurrentProduct = false, format = "" } = {}) {
  const product = (card) => stockTokenProduct(card, sets, { format })?.code || tokenProductCode(card, sets);
  const byProduct = new Map();
  const eligible = prints.filter((card) => sameTokenIdentity(reference, card)
    && card.lang === lang && stockTokenProduct(card, sets, { format })
    && (!card.released_at || card.released_at <= today)
    && (includeCurrentProduct || product(card) !== product(reference)))
    .sort((a, b) => tokenPrintRank(a, sets) - tokenPrintRank(b, sets)
      || String(b.released_at || "").localeCompare(String(a.released_at || ""))
      || String(a.collector_number || "").localeCompare(String(b.collector_number || ""), "en", { numeric: true })
      || a.id.localeCompare(b.id));
  for (const card of eligible) if (!byProduct.has(product(card))) byProduct.set(product(card), card);
  return [...byProduct.values()];
}
