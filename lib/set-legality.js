// Published constructed legality can differ from a product's sale/release date.
// Keep the same override in environment windows and preparation set choices.
const overrides = {
  mbc: {
    legacy: {
      date: "2027-01-01",
      sourceUrl: "https://magic.wizards.com/en/news/feature/whats-inside-mystery-booster-commander-edition"
    }
  }
};

export function constructedSetLegality(code, format) {
  return overrides[String(code || "").toLowerCase()]?.[format] || null;
}
