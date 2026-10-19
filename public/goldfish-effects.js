// These are explicit paper-play shortcuts, not a rules engine. The full Oracle
// text accompanies them so the player chooses when a condition/trigger applies.
const numbers = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const amount = (value) => numbers[value.toLowerCase()] || Number(value);
export function goldfishCardOperations(card) {
  const text = String((card.faces?.[card.faceIndex || 0] || card).oracleText || "");
  const operations = [];
  const add = (kind, count, label) => {
    if (count > 0 && count <= 30 && !operations.some((op) => op.kind === kind && op.count === count)) operations.push({ kind, count, label });
  };
  for (const match of text.matchAll(/\b(surveil|scry) (\d+)\b/gi)) add(match[1].toLowerCase(), Number(match[2]), `${match[1].toLowerCase() === "surveil" ? "諜報" : "占術"}${match[2]}：山札の上を見る`);
  for (const match of text.matchAll(/look at the top (a|one|two|three|four|five|six|seven|\d+) cards? of your library/gi)) add("top", amount(match[1]), `山札の上${amount(match[1])}枚を見る`);
  for (const match of text.matchAll(/(?:^|[.\n]\s*|\byou (?:may )?)draw (a|one|two|three|four|five|six|seven|\d+) cards?\b/gi)) add("draw", amount(match[1]), `${amount(match[1])}枚ドロー`);
  for (const match of text.matchAll(/(?:^|[.\n]\s*|\byou )mill (a|one|two|three|four|five|six|seven|\d+) cards?\b/gi)) add("mill", amount(match[1]), `自分の山札を${amount(match[1])}枚切削`);
  if (/Look at the top three cards of your library\.\s*Put one of them into your hand, put one of them on the bottom of your library, and exile one of them\./i.test(text)) {
    const look = operations.find((op) => op.kind === "top" && op.count === 3);
    if (look) look.destinations = { hand: 1, exile: 1, libraryBottom: 1 };
  }
  return { text, operations };
}
