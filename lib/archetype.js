const COLOR_WORDS = /\b(mono[\s-]?(red|blue|black|white|green)|dimir|izzet|rakdos|golgari|selesnya|azorius|orzhov|simic|gruul|boros|jeskai|sultai|mardu|abzan|temur|naya|esper|grixis|jund|bant|four[\s-]color|five[\s-]color|domain)\b/i;
const STRATEGY_WORDS = /\b(aggro|midrange|control|ramp|prowess|convoke|reanimator|burn|tempo|tokens?|storm|combo|mill|lifegain|affinity|landfall|sacrifice|flash)\b/i;
const SITE_BRANDING = /晴れる屋(マジック)?|hareruyamtg\.com|hareruya\.com|MTGGoldfish|MTGDecks|MTGTop8|magic\.gg|mtg-jp\.com|melee\.gg|spellbinder\.gg|mtgo\.com/gi;
const NOISE_WORDS = /\b(top\s*\d*|rank\s*\d*|decklist|decklists|standard|pioneer|modern|legacy|event|championship|regional|spotlight|platinum|mythic|rank\s+player|magic\s+play|coverage|player)\b/gi;

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
  const raw = `${title || ""} ${fallback || ""}`.trim();
  if (!raw) return "Unknown";

  // Strip site branding and noise, then look for the archetype-like segment
  const cleaned = raw
    .replace(SITE_BRANDING, "")
    .replace(/\s+by\s+\S+/gi, "")
    .replace(NOISE_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\-–—|:,\s]+|[\-–—|:,\s]+$/g, "")
    .trim();

  if (!cleaned || /^deck\s*\d*$/i.test(cleaned)) return "Unknown";

  // Split on the first matching separator and collect non-trivial segments
  const separators = [" - ", " – ", " — ", " | ", "：", ":"];
  let parts = [cleaned];
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      parts = cleaned.split(sep).map((p) => p.trim()).filter((p) => p.length > 2 && /\w/.test(p));
      break;
    }
  }
  if (!parts.length) return "Unknown";

  // Prefer the segment that looks like a Standard archetype name
  const best = parts.find((p) => COLOR_WORDS.test(p) && p.length < 60)
    ?? parts.find((p) => STRATEGY_WORDS.test(p) && p.length < 60)
    ?? parts[0];

  return best && best.length < 80 ? best : "Unknown";
}

/**
 * メタゲームページのHTMLからアーキタイプ名一覧を抽出する。
 * 現在対応: 晴れる屋 (/ja/deck/N/metagame/)、MTGGoldfish (/metagame/)
 */
export function extractArchetypeNames(html, url) {
  const names = new Set();

  // 晴れる屋: href に archetypeIds= を含むリンク内の最初の <div> テキスト
  if (url.includes("hareruyamtg.com")) {
    const linkPattern = /href="[^"]*archetypeIds=[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkPattern.exec(html))) {
      const divMatch = m[1].match(/<div[^>]*>([\s\S]*?)<\/div>/);
      if (divMatch) {
        const name = divMatch[1].replace(/<[^>]+>/g, "").trim();
        if (name && name.length >= 2 && name.length < 60) names.add(name);
      }
    }
  }

  // MTGGoldfish: /archetype/NAME 形式のリンク
  if (url.includes("mtggoldfish.com/metagame")) {
    const linkPattern = /href="\/archetype\/([^"?#]+)"/gi;
    let m;
    while ((m = linkPattern.exec(html))) {
      const name = decodeURIComponent(m[1]).replace(/[+_-]/g, " ").replace(/\s+/g, " ").trim();
      if (name && name.length >= 2 && name.length < 60) names.add(name);
    }
  }

  return names;
}

/**
 * デッキタイトルを既知のアーキタイプ名リストと照合して一致するものを返す。
 * 完全一致を優先し、次に部分一致を試みる。
 */
export function matchKnownArchetype(title, knownArchetypes) {
  if (!title || !knownArchetypes || knownArchetypes.size === 0) return null;
  const titleLower = title.toLowerCase();
  let partialMatch = null;
  for (const name of knownArchetypes) {
    const nameLower = name.toLowerCase();
    if (titleLower === nameLower) return name;
    if (!partialMatch && titleLower.includes(nameLower)) partialMatch = name;
  }
  return partialMatch;
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
  return best.score >= 0.25 && best.matches >= 2 ? best.archetype : "Unknown";
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
