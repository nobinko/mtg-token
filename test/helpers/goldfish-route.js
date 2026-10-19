import assert from "node:assert/strict";
import { fixture, settle } from "./goldfish-pilot.js";
import { mergeCardMetadata } from "../../public/card-metadata.js";
import { createGoldfishGame, keepGoldfishHand, nextGoldfishTurn, endGoldfishTurn, beginGoldfishCombat, resolveGoldfishCombat, restoreGoldfishGame } from "../../public/goldfish.js";
import { castGoldfishCard, goldfishLandEntryOptions } from "../../public/goldfish-mana.js";
import { activateGoldfishAction } from "../../public/goldfish-actions.js";
import { goldfishReference } from "../../public/goldfish-objects.js";
import { repeatGoldfishCombo } from "../../public/goldfish-practice.js";
import { sideboardGoldfishGame, goldfishFinish } from "../../public/goldfish-sideboard.js";
import { serializeGoldfishSave, parseGoldfishSave } from "../../public/goldfish-storage.js";

// A declared opening/draw order, never a midgame card or mana injection.
// Every card comes from this dated real 75. Tutors and later shuffles still use
// the engine normally. Natural shuffled games are tested separately.
export function route(rank, opening, draws = [], swaps = {}, decide = () => null) {
  const d = fixture.decks.find(d => d.rank === rank), log = [];
  let s = createGoldfishGame(mergeCardMetadata(d.mainboard, fixture.metadata), { sideboardRows: mergeCardMetadata(d.sideboard, fixture.metadata), random: () => .7 });
  if (Object.keys(swaps).length) {
    const counts = Object.fromEntries(s.deckRows.map(c => [c.name, c.count]));
    for (const [n, delta] of Object.entries(swaps)) counts[n] = (counts[n] || 0) + delta;
    s = sideboardGoldfishGame(s, counts, { random: () => .7 });
  }
  const cards = [...s.hand, ...s.library], pick = name => {
    const i = cards.findIndex(c => c.name === name); assert.ok(i >= 0, `実リストに不足: ${name}`); return cards.splice(i, 1)[0];
  };
  assert.equal(opening.length, 7);
  s.hand = opening.map(pick); const top = draws.map(pick); s.library = [...cards, ...top.reverse()];
  assert.equal(s.hand.length + s.library.length, 60); assert.equal(s.sideboard.length, d.sideboard.reduce((n, c) => n + c.count, 0));
  const save = value => restoreGoldfishGame(parseGoldfishSave(serializeGoldfishSave(value)));
  const update = (next, text) => { log.push(`T${s.turn || 1} ${text}`); s = settle(next, log, decide);
    s = save(s); return s; };
  update(keepGoldfishHand(s), "キープ");
  return {
    get s() { return s; }, log,
    update,
    card(name, zone = "battlefield") { const card = s[zone].find(c => c.name === name || c.faces?.[c.faceIndex || 0]?.name === name); assert.ok(card, `${zone}: ${name} / ${s[zone].map(c => c.name)}`); return card; },
    ref(name, zone = "battlefield") { return goldfishReference(this.card(name, zone), zone); },
    cast(name, options = {}) {
      const zone = options.fromExile ? "exile" : options.fromGraveyard ? "graveyard" : options.fromSideboard ? "sideboard" : "hand", c = this.card(name, zone);
      const entries = goldfishLandEntryOptions(c, s), entry = Math.max(0, entries.findIndex(e => !e.tapped));
      return update(castGoldfishCard(s, c.id, { confirmLife: true, entry, ...options }), `唱える/プレイ ${name}${zone !== "hand" ? ` (${zone})` : ""}`);
    },
    act(name, id, options = {}, zone = "battlefield") { return update(activateGoldfishAction(s, this.card(name, zone).id, id, options), `${name}: ${id}`); },
    next() { return update(nextGoldfishTurn(s), "次ターン"); },
    end() { return update(endGoldfishTurn(s), "相手ターン"); },
    attack() {
      update(beginGoldfishCombat(s), "攻撃");
      for (let i = 0; i < 5 && s.rules.combat?.stage !== "done"; i++) update(resolveGoldfishCombat(s), "戦闘ダメージ");
      return s;
    },
    combo(id, name, count) { return update(repeatGoldfishCombo(s, id, this.card(name).id, count), `コンボ ${id} ${count}回`); },
    finish(max = 30) {
      while (!goldfishFinish(s) && s.turn < max) { if (s.rules.activePlayer === "self" && !s.rules.combat) this.attack(); if (!goldfishFinish(s)) this.next(); }
      assert.equal(goldfishFinish(s)?.kind, "win", log.join(" / ")); return s;
    }
  };
}
