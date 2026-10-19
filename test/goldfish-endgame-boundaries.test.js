import test from "node:test";
import assert from "node:assert/strict";
import { fixture, settle } from "./helpers/goldfish-pilot.js";
import { route } from "./helpers/goldfish-route.js";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, restoreGoldfishGame, restartGoldfishGame, mulliganGoldfish, createGoldfishToken, advanceGoldfishGame, chooseGoldfishRule } from "../public/goldfish.js";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { castGoldfishCard } from "../public/goldfish-mana.js";
import { activateGoldfishAction } from "../public/goldfish-actions.js";
import { goldfishSideboardPool, sideboardGoldfishGame, goldfishFinish } from "../public/goldfish-sideboard.js";
import { beginGoldfishSacrificeSequence } from "../public/goldfish-batch.js";
import { goldfishAttackers } from "../public/goldfish-combat.js";
import { serializeGoldfishSave, parseGoldfishSave } from "../public/goldfish-storage.js";
import { goldfishReference as ref } from "../public/goldfish-objects.js";
const snap = s => restoreGoldfishGame(parseGoldfishSave(serializeGoldfishSave(s)));
function board(names) {
  let s = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(names.map(name => ({ name, count: 1 })), fixture.metadata), { random: () => .5 }));
  if (s.rules.pendingChoice) s = chooseGoldfishRule(s, { refs: [] });
  return moveGoldfishCards(s, s.hand.map(c => c.id), "libraryBottom");
}
const put = (s, name, zone) => moveGoldfishCards(s, s.library.find(c => c.name === name).id, zone);

test("sideboarding preserves registered pool, saved configuration, reset and mulligan without adding Wish cards", () => {
  const d = fixture.decks[3];
  let s = createGoldfishGame(mergeCardMetadata(d.mainboard, fixture.metadata), { sideboardRows: mergeCardMetadata(d.sideboard, fixture.metadata) });
  const counts = Object.fromEntries(s.deckRows.map(c => [c.name, c.count])); counts.Solitude--; counts['Beza, the Bounding Spring'] = 1;
  assert.throws(() => sideboardGoldfishGame(s, { ...counts, Solitude: counts.Solitude + 1 }), /揃えて/);
  assert.throws(() => sideboardGoldfishGame(s, { ...counts, 'Black Lotus': 1 }), /元のリスト/);
  const pool = goldfishSideboardPool(s);
  s = sideboardGoldfishGame(s, counts); const saved = snap(s);
  for (const current of [saved, restartGoldfishGame(saved), mulliganGoldfish(saved)]) {
    assert.equal(current.deckRows.find(c => c.name === 'Beza, the Bounding Spring').count, 1);
    assert.equal(current.sideboardRows.find(c => c.name === 'Solitude').count, 1);
    assert.deepEqual(goldfishSideboardPool(current), pool);
    assert.equal(current.sideboard.length, 14); // This published UW list is 60/14.
  }
  const original = sideboardGoldfishGame(saved, Object.fromEntries(saved.registeredDeck.main.map(c => [c.name, c.count])));
  assert.ok(!original.deckRows.some(c => c.name === 'Beza, the Bounding Spring'));
  assert.equal(original.hand.length, 7); assert.equal(original.battlefield.length, 0);
});

test("Scepter copied Chant pays optional kicker and prevents this turn's attacks", () => {
  const r = route(4, ['Island', 'Hallowed Fountain', 'Plains', 'Plains', "Orim's Chant", 'Isochron Scepter', 'Solitude'], [], {}, c => c.kind === 'cards' && c.sourceName === 'Isochron Scepter' ? { refs: [c.candidates.find(c => c.label === "Orim's Chant").ref] } : c.kind === 'buttons' && c.sourceName === 'Isochron Scepter' ? { value: 'kicked' } : null);
  r.cast('Island'); r.next(); r.cast('Hallowed Fountain'); r.cast('Isochron Scepter'); r.next(); r.cast('Plains'); r.act('Isochron Scepter', 'engine:scepter');
  assert.equal(r.s.rules.spellsCast, 1); assert.equal(r.s.rules.noAttackSerial, r.s.rules.turnSerial);
  assert.equal(r.s.battlefield.filter(c => /Land/.test(c.typeLine) && c.tapped).length, 3);
  assert.ok(r.s.rules.notices.some(c => c.text.includes('攻撃できない')));
  r.next(); assert.notEqual(r.s.rules.noAttackSerial, r.s.rules.turnSerial);
});

test("Scepter respects Trinisphere payment and High Noon casting prohibition after activation", () => {
  let s = board(['Isochron Scepter', 'Silence', 'Trinisphere', 'High Noon', 'Island', 'Plains', 'Hallowed Fountain', 'Geier Reach Sanitarium', 'Monumental Henge']);
  for (const n of ['Isochron Scepter', 'Trinisphere', 'Island', 'Plains', 'Hallowed Fountain', 'Geier Reach Sanitarium', 'Monumental Henge']) s = put(s, n, 'battlefield');
  s = put(s, 'Silence', 'exile'); const scepter = s.battlefield.find(c => c.name === 'Isochron Scepter'); scepter.imprinted = ref(s.exile[0], 'exile');
  const before = snap(s);
  s = settle(activateGoldfishAction(s, scepter.id, 'engine:scepter'));
  assert.equal(s.battlefield.filter(c => /Land/.test(c.typeLine) && c.tapped).length, 5); assert.equal(s.rules.spellsCast, 1);
  s = put(before, 'High Noon', 'battlefield'); s.rules.spellsCast = 1;
  s = advanceGoldfishGame(activateGoldfishAction(s, scepter.id, 'engine:scepter'));
  assert.deepEqual(s.rules.pendingChoice.options.map(o => o.value), ['no']);
  s = settle(chooseGoldfishRule(snap(s), { value: 'no' })); assert.equal(s.rules.spellsCast, 1);
});

test("Surgical can target opponent graveyard without removing the player's own cards", () => {
  let s = board(['Surgical Extraction', 'Plains', 'Island', 'Swamp', 'Forest', 'Mountain', 'Silence']);
  s = put(s, 'Swamp', 'battlefield'); s = put(s, 'Surgical Extraction', 'hand'); s = put(s, 'Silence', 'graveyard');
  s = settle(castGoldfishCard(s, s.hand[0].id, { target: { player: 'opponent', virtual: true } }));
  assert.ok(s.graveyard.some(c => c.name === 'Silence')); assert.ok(s.rules.notices.some(n => n.text.includes('相手はシャッフル')));
});

test("a batch of twenty Goblin Bombardment activations resolves lethal without merging cast counts", () => {
  let s = board(['Goblin Bombardment', 'Mountain', 'Plains', 'Sacred Foundry', 'Ocelot Pride', 'Guide of Souls', 'Lightning Bolt']);
  s = put(s, 'Goblin Bombardment', 'battlefield');
  for (let i = 0; i < 20; i++) s = createGoldfishToken(s, { name: 'Goblin', typeLine: 'Token Creature — Goblin', power: '1', toughness: '1' });
  const tokens = s.battlefield.filter(c => c.kind === 'token').map(c => c.id), before = snap(s);
  s = settle(beginGoldfishSacrificeSequence(s, s.battlefield.find(c => c.name === 'Goblin Bombardment').id, tokens));
  assert.equal(goldfishFinish(s).kind, 'win'); assert.equal(s.players.opponent.life, 0); assert.equal(s.rules.spellsCast, 0); assert.equal(s.battlefield.length, 1);
  assert.equal(before.battlefield.length, 21); assert.equal(before.players.opponent.life, 20);
});

test("batch pauses for Ajani transformation, resumes after save, and never sacrifices a moved object twice", () => {
  let s = board(['Goblin Bombardment', 'Ajani, Nacatl Pariah', 'Ocelot Pride', 'Mountain', 'Plains', 'Sacred Foundry', 'Lightning Bolt']);
  for (const n of ['Goblin Bombardment', 'Ajani, Nacatl Pariah', 'Ocelot Pride']) s = put(s, n, 'battlefield');
  s = createGoldfishToken(s, { name: 'Cat', typeLine: 'Token Creature — Cat', power: '1', toughness: '1' });
  const cat = s.battlefield.find(c => c.kind === 'token'), ocelot = s.battlefield.find(c => c.name === 'Ocelot Pride'), bombardment = s.battlefield[0];
  s = advanceGoldfishGame(beginGoldfishSacrificeSequence(s, bombardment.id, [cat.id, ocelot.id]));
  assert.equal(s.rules.pendingChoice.sourceName, 'Ajani, Nacatl Pariah'); assert.equal(s.rules.sacrificeSequence.done, 1);
  const resumed = settle(chooseGoldfishRule(snap(s), { value: 'yes' })); assert.equal(resumed.players.opponent.life, 18); assert.equal(resumed.rules.sacrificeSequence, undefined);
  // A resumed sequence must revalidate incarnations, not sacrifice a new object.
  s = snap(s); s.battlefield.find(c => c.id === ocelot.id).incarnation++;
  s = settle(chooseGoldfishRule(s, { value: 'no' })); assert.equal(s.players.opponent.life, 19); assert.ok(s.battlefield.some(c => c.id === ocelot.id)); assert.match(s.rules.batchError, /移動/);
});
