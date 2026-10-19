import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { mergeCardMetadata } from '../public/card-metadata.js';
import { createGoldfishGame, keepGoldfishHand, nextGoldfishTurn, beginGoldfishCombat, resolveGoldfishCombat } from '../public/goldfish.js';
import { castGoldfishCard, planGoldfishCastPayment, goldfishLandEntryOptions } from '../public/goldfish-mana.js';
import { goldfishSpellTargets } from '../public/goldfish-spells.js';
import { goldfishFetchRule, goldfishFetchTargets, goldfishFetchEntry, resolveGoldfishFetch } from '../public/goldfish-fetch.js';
import { abilityBlockReason } from '../public/goldfish-constraints.js';
import { goldfishFinish } from '../public/goldfish-sideboard.js';
import { isType } from '../public/goldfish-events.js';
import { settle } from '../test/helpers/goldfish-pilot.js';

// A reproducible gap finder, not a competitive pilot or a full-coverage claim.
// It uses real shuffled lists, never grants resources, and stops at the first
// manual instruction or illegal choice. Combo routes require separate tests.
const results = [];
for (const format of ['standard', 'legacy', 'pioneer']) {
  const fixture = JSON.parse(await readFile(new URL(`../test/fixtures/goldfish-${format}-top10.json`, import.meta.url)));
  for (const deck of fixture.decks) {
    let seed = 100 + deck.rank;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const oldRandom = Math.random; Math.random = random;
    const log = [];
    let state, result;
    const resolve = s => settle(s, log, c => c.optionKey === 'delve' ? { refs: c.candidates.slice(0, c.max).map(x => x.ref) } : null);
    try {
      state = resolve(keepGoldfishHand(createGoldfishGame(mergeCardMetadata(deck.mainboard, fixture.metadata), { sideboardRows: mergeCardMetadata(deck.sideboard, fixture.metadata), random })));
      for (let turn = 1; turn <= 30 && !goldfishFinish(state); turn++) {
        const land = state.hand.find(c => isType(c, 'Land'));
        if (land) {
          log.push(`T${turn} play ${land.name}`);
          state = resolve(castGoldfishCard(state, land.id, { entry: Math.max(0, goldfishLandEntryOptions(land, state).findIndex(e => !e.tapped)), confirmLife: true }));
        }
        for (const land of [...state.battlefield].filter(c => goldfishFetchRule(c) && !c.tapped && !abilityBlockReason(state, c))) {
          const targets = goldfishFetchTargets(state, land.id);
          const target = targets.find(c => isType(c, 'Basic')) || targets[0];
          const entries = target && goldfishFetchEntry(state, land.id, target).choices;
          state = resolve(resolveGoldfishFetch(state, land.id, target?.id, { entry: entries?.find(e => !e.tapped)?.key || entries?.[0].key, random }));
        }
        for (let step = 0; step < 16 && !goldfishFinish(state); step++) {
          const options = { confirmLife: true, splice: [], pitch: [], replicate: 0 };
          const card = state.hand.filter(c => !isType(c, 'Land')).find(c => planGoldfishCastPayment(state, c, { ...options, preview: true }).payable);
          if (!card) break;
          log.push(`T${turn} cast ${card.name}`);
          const targets = goldfishSpellTargets(state, card, options);
          options.target = targets.find(t => t.ref.player === 'opponent')?.ref || targets[0]?.ref;
          state = resolve(castGoldfishCard(state, card.id, options));
        }
        if (!goldfishFinish(state) && state.rules.activePlayer === 'self') state = resolve(beginGoldfishCombat(state));
        while (state.rules.combat && state.rules.combat.stage !== 'done' && !goldfishFinish(state)) state = resolve(resolveGoldfishCombat(state));
        if (!goldfishFinish(state)) state = resolve(nextGoldfishTurn(state));
      }
      result = goldfishFinish(state)?.kind || 'no-finish-in-30-turns';
    } catch (error) { result = 'stopped'; log.push(error.message); }
    finally { Math.random = oldRandom; }
    const row = { format, rank: deck.rank, archetype: deck.archetype, url: deck.url, result, turn: state?.turn, opponentLife: state?.players.opponent.life, log };
    results.push(row); console.log(JSON.stringify({ ...row, log: log.slice(-3) }));
  }
}
await mkdir(new URL('../.cache/', import.meta.url), { recursive: true });
await writeFile(new URL('../.cache/goldfish-formats-audit.json', import.meta.url), JSON.stringify({ auditedAt: new Date().toISOString(), method: 'seeded gap finder; not exhaustive mechanics or postboard certification', results }, null, 2));
