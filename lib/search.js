import { escapeRegex, officialExpansionCode, officialExpansionName, imageFor } from "./util.js";
import { tokenHints } from "./tokens.js";

export function findNameInText(names, text) {
  return names.some((name) => {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(name.toLowerCase())}([^a-z0-9]|$)`, "i");
    return pattern.test(text);
  });
}

function findNameInDeck(names, deck) {
  const cardNames = deck.cards || [];
  if (cardNames.some((cardName) => names.some((name) => cardName.toLowerCase() === name.toLowerCase()))) return true;
  return findNameInText(names, String(deck.text || "").toLowerCase());
}

export function findCardMentions(cards, pages) {
  const pageTexts = pages.map((page) => page.text.toLowerCase());
  const deckEntries = pages.flatMap((page) => page.deckEntries || []);
  const results = [];

  for (const card of cards) {
    const names = [card.name, ...(card.card_faces || []).map((face) => face.name)].filter(Boolean);
    const mentionedSources = [];
    const mentionedDecks = [];

    for (const deck of deckEntries) {
      if (findNameInDeck(names, deck)) {
        mentionedDecks.push({
          title: deck.title,
          archetype: deck.archetype || "Unknown",
          url: deck.url,
          pageTitle: deck.pageTitle,
          pageUrl: deck.pageUrl
        });
        mentionedSources.push(deck.pageUrl);
      }
    }

    if (!mentionedDecks.length) {
      for (let index = 0; index < pages.length; index += 1) {
        if (findNameInText(names, pageTexts[index])) {
          mentionedSources.push(pages[index].url);
        }
      }
    }

    if (mentionedSources.length) {
      const uniqueDecks = [...new Map(mentionedDecks.map((deck) => [deck.url, deck])).values()];
      results.push({
        id: card.id,
        raw: card,
        name: card.name,
        manaCost: card.mana_cost || card.card_faces?.[0]?.mana_cost || "",
        typeLine: card.type_line,
        set: officialExpansionCode(card.set),
        setName: officialExpansionName(card.set_name),
        releasedAt: card.released_at || "",
        rarity: card.rarity,
        image: imageFor(card),
        oracleText: card.oracle_text || card.card_faces?.map((face) => `${face.name}: ${face.oracle_text}`).join("\n\n") || "",
        scryfallUri: card.scryfall_uri,
        tokenHints: tokenHints(card),
        deckCount: uniqueDecks.length || mentionedSources.length,
        decks: uniqueDecks.slice(0, 24),
        sources: [...new Set(mentionedSources)].slice(0, 8)
      });
    }
  }

  return results.sort((a, b) => (b.deckCount || 0) - (a.deckCount || 0) || a.name.localeCompare(b.name));
}

export function deckResultsFromPages(pages) {
  const deckPages = pages.flatMap((page) => page.deckEntries || []);
  const unique = new Map(deckPages.map((deck) => [deck.url, deck]));
  return [...unique.values()];
}
