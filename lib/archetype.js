const archetypeRules = [
  { name: "Izzet Prowess", cards: ["Slickshot Show-Off", "Stormchaser's Talent", "Monstrous Rage", "Sleight of Hand", "Opt"] },
  { name: "Izzet Spells", cards: ["Eddymurk Crab", "Hearth Elemental", "Prismari Charm", "Opt"] },
  { name: "Mono-Green Landfall", cards: ["Mossborn Hydra", "Sazh's Chocobo", "Traveling Chocobo", "Llanowar Elves"] },
  { name: "Dimir Midrange", cards: ["Kaito, Bane of Nightmares", "Deep-Cavern Bat", "Faerie Mastermind", "Go for the Throat"] },
  { name: "Esper Pixie", cards: ["Nurturing Pixie", "Hopeless Nightmare", "Stormchaser's Talent", "This Town Ain't Big Enough"] },
  { name: "Domain Overlords", cards: ["Overlord of the Hauntwoods", "Overlord of the Mistmoors", "Leyline Binding", "Zur, Eternal Schemer"] },
  { name: "Jeskai Control", cards: ["Jeskai Revelation", "Stock Up", "Day of Judgment", "Get Lost"] },
  { name: "Four-Color Control", cards: ["Jeskai Revelation", "Stock Up", "Get Lost", "Herd Migration"] },
  { name: "Golgari Midrange", cards: ["Mosswood Dreadknight", "Glissa Sunslayer", "Cut Down", "Go for the Throat"] },
  { name: "Azorius Control", cards: ["Temporary Lockdown", "No More Lies", "Sunfall", "Get Lost"] },
  { name: "Boros Convoke", cards: ["Knight-Errant of Eos", "Voldaren Epicure", "Gleeful Demolition", "Imodane's Recruiter"] },
  { name: "Mono-Red Aggro", cards: ["Monastery Swiftspear", "Slickshot Show-Off", "Burst Lightning", "Lightning Strike"] }
];

export function inferArchetypeFromCards(cards, fallbackName) {
  const cardSet = new Set(cards);
  let best = { name: "", hits: 0, ratio: 0 };
  for (const rule of archetypeRules) {
    const hits = rule.cards.filter((card) => cardSet.has(card)).length;
    const ratio = hits / rule.cards.length;
    if (hits > best.hits || (hits === best.hits && ratio > best.ratio)) {
      best = { name: rule.name, hits, ratio };
    }
  }
  if (best.hits >= 2 || best.ratio >= 0.5) return best.name;
  return fallbackName;
}

export function inferArchetype(title, fallback = "") {
  const value = `${title || ""} ${fallback || ""}`;
  if (/platinum|mythic|rank player|magic play|晴れる屋|hareruya|イベントカバレージ|coverage/i.test(value)) return "Unknown";
  const cleaned = value
    .replace(/\b(top|rank|player|decklist|decklists|standard|pioneer|modern|legacy|event|championship|regional|spotlight)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const separators = [" - ", " – ", " — ", " | ", ":"];
  for (const separator of separators) {
    const parts = cleaned.split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) return parts[parts.length - 1];
  }
  return cleaned || "Unknown";
}

export function buildArchetypeProfiles(deckEntries) {
  const byArchetype = new Map();
  for (const deck of deckEntries) {
    const name = deck.archetype;
    if (!name || name === "Unknown") continue;
    if (!byArchetype.has(name)) byArchetype.set(name, []);
    byArchetype.get(name).push(deck.cards || []);
  }

  const profiles = new Map();
  for (const [archetype, deckCards] of byArchetype) {
    if (deckCards.length < 2) continue;
    const cardCount = new Map();
    for (const cards of deckCards) {
      for (const card of cards) cardCount.set(card, (cardCount.get(card) || 0) + 1);
    }
    const threshold = Math.max(2, deckCards.length * 0.4);
    const coreCards = new Set(
      [...cardCount.entries()].filter(([, count]) => count >= threshold).map(([card]) => card)
    );
    if (coreCards.size >= 3) profiles.set(archetype, coreCards);
  }
  return profiles;
}

export function classifyByProfile(cards, profiles) {
  const cardSet = new Set(cards);
  let best = { archetype: "Unknown", score: 0, matches: 0 };
  for (const [archetype, coreCards] of profiles) {
    const matches = [...coreCards].filter((card) => cardSet.has(card)).length;
    const score = matches / coreCards.size;
    if (score > best.score || (score === best.score && matches > best.matches)) {
      best = { archetype, score, matches };
    }
  }
  return best.score >= 0.3 && best.matches >= 3 ? best.archetype : "Unknown";
}

export function archetypeStats(decks) {
  const counts = new Map();
  for (const deck of decks || []) {
    const name = deck.archetype || "Unknown";
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return [...counts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      percent: total ? Math.round((count / total) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function overallArchetypeStats(decks) {
  const stats = archetypeStats(decks);
  const total = decks.length || 1;
  return stats.map((item) => ({
    ...item,
    percent: Math.round((item.count / total) * 1000) / 10
  }));
}
