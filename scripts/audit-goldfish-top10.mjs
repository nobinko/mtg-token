import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { extractMtgTop8MetaSnapshot } from '../lib/meta.js';

const format = process.argv[2] || 'modern';
const codes = { modern: 'MO', standard: 'ST', legacy: 'LE', pioneer: 'PI' };
if (!codes[format]) throw new Error('Choose modern, standard, legacy or pioneer');
const targetDate = process.argv[3] || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error('Use an ISO target date');
const output = new URL(`../test/fixtures/goldfish-${format === 'modern' ? '' : `${format}-`}top10.json`, import.meta.url);
const checkpoint = new URL(`../.cache/goldfish-${format}-${targetDate}.json`, import.meta.url);
const sourceUrl = `https://mtgtop8.com/format?f=${codes[format]}`;
const request = async (url, body) => {
  const response = await fetch(url, { ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`${response.status} ${url}: ${(await response.text()).slice(0, 300)}`);
  return response;
};
let saved;
try { saved = JSON.parse(await readFile(checkpoint, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const fetchedAt = saved?.fetchedAt || new Date().toISOString();
const snapshot = saved?.snapshot || extractMtgTop8MetaSnapshot(await (await request(sourceUrl)).text(), sourceUrl, fetchedAt);
if (!snapshot?.entries || snapshot.entries.length < 10) throw new Error('A verified top 10 is required');
const decks = saved?.decks || [];
await mkdir(new URL('../.cache/', import.meta.url), { recursive: true });
const saveProgress = () => writeFile(checkpoint, JSON.stringify({ format, targetDate, fetchedAt, snapshot, decks }, null, 2) + '\n');
await saveProgress();
for (const entry of snapshot.entries.slice(0, 10)) {
  if (decks.some(deck => deck.rank === entry.rank)) continue;
  const result = await (await request('http://localhost:5177/api/meta-deck', { archetypeUrl: entry.archetypeUrl, archetypeName: entry.name, format, targetDate })).json();
  if (!result.deck?.mainboard?.length || !result.deck?.sideboard) throw new Error(`Incomplete deck: ${entry.name}`);
  decks.push({ rank: entry.rank, archetype: entry.name, sharePercent: entry.sharePercent, sourceUrl: entry.archetypeUrl, sampleSize: result.sampleSize, ...result.deck });
  await saveProgress();
  console.log(`${entry.rank}. ${entry.name}: ${result.deck.mainboard?.length} main rows ${result.deck.url}`);
}
const names = [...new Set(decks.flatMap(deck => [...deck.mainboard, ...deck.sideboard].map(row => row.name)))];
const metadata = [];
for (let index = 0; index < names.length; index += 75) {
  const data = await (await request('http://localhost:5177/api/card-metadata', { names: names.slice(index, index + 75) })).json();
  metadata.push(...data.cards);
  console.log(`Oracle ${Math.min(index + 75, names.length)}/${names.length}`);
}
await mkdir(new URL('../test/fixtures/', import.meta.url), { recursive: true });
if (metadata.some(card => card.unavailable)) throw new Error(`Oracle lookup failed: ${metadata.filter(card => card.unavailable).map(card => card.name).join(', ')}`);
await writeFile(output, JSON.stringify({ format, targetDate, fetchedAt, snapshot: { ...snapshot, entries: snapshot.entries.slice(0, 10) }, decks, metadata }, null, 2) + '\n');
console.log(`Saved ${decks.length} decks and ${metadata.length} card records`);
