// Supplemental sets that introduce cards directly into paper Modern.
// https://magic.wizards.com/en/formats/modern
export const modernAdditionalSetCodes = ["mh1", "mh2", "mh3", "ltr", "acr"];
const firstModernRelease = "2003-07-28"; // Eighth Edition

export function isModernSet(set) {
  return Boolean(set && !set.digital && set.released_at >= firstModernRelease
    && (["expansion", "core"].includes(set.set_type) || modernAdditionalSetCodes.includes(set.code)));
}

export function modernSetTimeline(sets, targetDate) {
  return sets.filter((set) => isModernSet(set) && set.released_at <= targetDate)
    .map((set) => ({ code: set.code.toUpperCase(), name: set.name, releasedAt: set.released_at,
      iconSvgUri: set.icon_svg_uri || "", scryfallUri: set.scryfall_uri || "" }))
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt) || a.code.localeCompare(b.code));
}

export function chooseModernSourceOrigin(reference, prints, sets, targetDate) {
  return prints.filter((card) => card.oracle_id === reference.oracle_id && !card.digital
    && card.games?.includes("paper") && isModernSet(sets.get(card.set))
    && card.released_at <= targetDate)
    .sort((a, b) => a.released_at.localeCompare(b.released_at)
      || Number(Boolean(a.promo)) - Number(Boolean(b.promo))
      || String(a.collector_number || "").localeCompare(String(b.collector_number || ""), "en", { numeric: true }))[0] || null;
}
