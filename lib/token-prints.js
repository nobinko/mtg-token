// Tokens commonly have booster:false even when included in boosters. Use the
// token set's parent product, not that flag alone, to recognize regular prints.
const boosterSetTypes = new Set(["expansion", "core", "masters", "draft_innovation"]);

export function sameTokenIdentity(a, b) {
  if (!a?.oracle_id || a.oracle_id !== b?.oracle_id) return false;
  const signature = (card) => JSON.stringify([
    card.name, card.type_line, card.oracle_text || "", card.power || "", card.toughness || "",
    [...(card.colors || [])].sort(),
    (card.card_faces || []).map((face) => [face.name, face.type_line, face.oracle_text || "", face.power || "", face.toughness || "", [...(face.colors || [])].sort()])
  ]);
  return signature(a) === signature(b);
}

export function tokenPrintRank(card, sets) {
  if (card.digital || !card.games?.includes("paper")) return 3;
  const set = sets.get(card.set);
  const parent = set?.parent_set_code ? sets.get(set.parent_set_code) : set;
  if (card.promo || ["sld", "slc"].includes(card.set)
    || ["promo", "memorabilia"].includes(set?.set_type)
    || (card.frame_effects || []).some((effect) => ["showcase", "extendedart", "inverted"].includes(effect))
    || card.textless) return 2;
  if (boosterSetTypes.has(parent?.set_type) && !parent.digital) return 0;
  return 1;
}

export function chooseTokenPrint(reference, prints, sets, { lang = "en", today = new Date().toISOString().slice(0, 10), sameSet = false } = {}) {
  return prints.filter((card) => sameTokenIdentity(reference, card)
    && card.lang === lang && tokenPrintRank(card, sets) < 3
    && (!card.released_at || card.released_at <= today)
    && (!sameSet || card.set === reference.set))
    .sort((a, b) => tokenPrintRank(a, sets) - tokenPrintRank(b, sets)
      || String(b.released_at || "").localeCompare(String(a.released_at || ""))
      || String(a.collector_number || "").localeCompare(String(b.collector_number || ""), "en", { numeric: true })
      || a.id.localeCompare(b.id))[0] || null;
}
