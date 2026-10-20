import { readFile, writeFile } from 'node:fs/promises';
const files = ['goldfish-top10.json', ...['standard', 'legacy', 'pioneer'].map(format => `goldfish-${format}-top10.json`), 'goldfish-public-20261020.json', 'goldfish-public-top30.json'];
const fixtures = await Promise.all(files.map(async file => JSON.parse(await readFile(new URL(`../test/fixtures/${file}`, import.meta.url), 'utf8'))));
const cards = {};
for (const card of fixtures.flatMap(fixture => fixture.metadata).filter(card => !card.unavailable).flatMap(card => [card, ...(card.faces || [])])) {
  const entry = { oracleText: card.oracleText, manaCost: card.manaCost, typeLine: card.typeLine, colors: card.colors, power: card.power, toughness: card.toughness, loyalty: card.loyalty };
  if (cards[card.name] && JSON.stringify(cards[card.name]) !== JSON.stringify(entry)) throw new Error(`Conflicting Oracle snapshots for ${card.name}; review before replacing`);
  cards[card.name] = entry;
}
await writeFile(new URL('../public/goldfish-catalog.js', import.meta.url), '// Verified Oracle snapshots for the real top-10 fixtures. Runtime adapters require an exact text match.\nexport const GOLD_FISH_CATALOG = ' + JSON.stringify(cards, null, 2) + ';\n');
console.log(`${Object.keys(cards).length} verified card faces`);
// Ship the same reviewed snapshots with complete face/layout/image data. Solo
// practice must not wait for an external service to rediscover known cards.
const metadata = new Map();
for (const card of fixtures.flatMap(f => f.metadata).filter(c => !c.unavailable && (!c.language || c.language === "en"))) {
  const existing = metadata.get(card.name);
  const aliases = new Set([...(existing?.aliases || []), card.requestedName, card.name, ...(card.faces || []).map(f => f.name)].filter(Boolean));
  metadata.set(card.name, { ...card, aliases: [...aliases] });
}
await writeFile(new URL('../public/goldfish-metadata.js', import.meta.url), '// Generated from the reviewed real-list fixtures; no player or tournament data.\nexport const GOLDFISH_METADATA = ' + JSON.stringify([...metadata.values()]) + ';\n');
