// Legality belongs to the source card. Token inserts may come from any paper
// product, provided their characteristics match the token being created.
export function isPaperCard(card) {
  return card?.digital !== true && Array.isArray(card?.games) && card.games.includes("paper");
}

export function isPaperLegalCard(card, format) {
  return isPaperCard(card) && card.legalities?.[format] === "legal";
}
