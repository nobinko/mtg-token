import { activeFace as face, cardName as name, cardType, isType, emitGameEvent, changeLife, drawGameCards, addGameCounters, makeGameToken, queueGameAbility, shuffleGameLibrary } from "./goldfish-events.js?v=20261019-formats5";
import { goldfishReference as ref, goldfishFindObject as find, moveGoldfishRuleObject as move, sameGoldfishReference as sameRef, untapGoldfishObject } from "./goldfish-objects.js?v=20261019-formats5";
import { verifiedGoldfishCard, engineSpellProgram, TOKENS, select, tutor, look, discard, draw, token, damageTarget } from "./goldfish-card-programs.js?v=20261019-formats5";
import { goldfishCharacteristics, goldfishKeywords, goldfishGraveyardTypes, recordGoldfishEnter, recordGoldfishCast } from "./goldfish-rules.js?v=20261019-formats5";
import { goldfishSpellProgram, goldfishSpellTargets, sameGoldfishTarget, goldfishManaValue } from "./goldfish-spells.js?v=20261019-formats5";
import { planGoldfishPayment, goldfishCastingCost, payGoldfishPlanDraft } from "./goldfish-mana.js?v=20261019-formats5";
import { entryTriggersBlocked, hasRuleCard, castBlockReason } from "./goldfish-constraints.js?v=20261019-formats5";
import { FORMAT_ENTERS } from "./goldfish-format-programs.js?v=20261019-formats5";

const live = state => state.battlefield.filter(card => !card.faceDown && card.automaticAbilities !== false);
const has = (state, cardName) => live(state).some(card => name(card) === cardName);
export const gameManaValue = card => goldfishManaValue(card);
export function gameColors(card) { return face(card).colors?.length ? face(card).colors : [...new Set((face(card).manaCost || "").match(/[WUBRG]/g) || [])]; }
export function gameLandTypes(state, card) {
  if (!isType(card, "Land")) return [];
  let types = cardType(card).match(/\b(?:Plains|Island|Swamp|Mountain|Forest)\b/g) || [];
  // Both layer-four effects apply in timestamp order. Battlefield insertion order
  // is the entry order, and is preserved by layout/selection operations.
  for (const effect of live(state)) {
    if (name(effect) === "Blood Moon" && !/\bBasic\b/.test(cardType(card))) types = ["Mountain"];
    if (name(effect) === "Leyline of the Guildpact") types = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
  }
  return types;
}
export const gameDomain = state => new Set(state.battlefield.flatMap(card => gameLandTypes(state, card))).size;
export function engineStatAdjustments(state, card) {
  const n = name(card), data = {};
  if (n === "Territorial Kavu") data.power = data.toughness = gameDomain(state);
  if (n === "Nethergoyf") { data.power = goldfishGraveyardTypes(state).length; data.toughness = data.power + 1; }
  if (n === "Wild Nacatl") { const types = new Set(state.battlefield.flatMap(c => gameLandTypes(state, c))); data.boost = Number(types.has("Plains")) + Number(types.has("Mountain")); }
  if (n === "Construct" && card.kind === "token") data.boost = state.battlefield.filter(c => isType(c, "Artifact")).length;
  if (n === "Fiend Artisan") data.boost = state.graveyard.filter(c => isType(c, "Creature")).length;
  if (n === "Dark Matter Manipulator") data.boostPower = 2 * Math.floor(state.graveyard.length / 7);
  for (const aura of state.battlefield) if (aura.summonedAsBestow && find(state, aura.attachedTo)?.id === card.id) data.boost = (data.boost || 0) + 2;
  if (card.earthbent) data.power = data.toughness = 0;
  if (card.animated && (card.animated.until > state.rules.turnSerial || card.animated.serial === state.rules.turnSerial)) data.power = data.toughness = card.animated.size;
  return data;
}
export function engineKeywords(state, card) {
  const result = [];
  if (card.earthbent) result.push("haste");
  if (card.dashed) result.push("haste");
  for (const aura of state.battlefield) if (aura.summonedAsBestow && find(state, aura.attachedTo)?.id === card.id) result.push("flying", "haste");
  for (const key of ["flying", "trample", "haste", "vigilance", "lifelink", "hexproof", "first strike"]) if (card.counters?.[key] > 0) result.push(key);
  if (has(state, "Scion of Draco")) {
    const colors = has(state, "Leyline of the Guildpact") ? ["W", "U", "B", "R", "G"] : gameColors(card);
    for (const [color, keyword] of Object.entries({ W: "vigilance", U: "hexproof", B: "lifelink", R: "first strike", G: "trample" })) if (colors.includes(color)) result.push(keyword);
  }
  return result;
}
export function canTapCreature(state, card) { return !isType(card, "Creature") || card.enteredTurn < state.turn || goldfishKeywords(state, card).has("haste") || has(state, "Tyvar, Jubilant Brawler") || has(state, "Shang-Chi, Master of Kung Fu"); }

export function engineCandidates(state, operation, context = {}) {
  const zones = Array.isArray(operation.zone) ? operation.zone : [operation.zone || "battlefield"];
  const f = operation.filter || operation, x = context.x || 0;
  return zones.flatMap(zone => {
    let cards = state[zone] || [];
    if (operation.top != null) cards = operation.top > 0 ? cards.slice(-operation.top).toReversed() : [];
    return cards.filter(card => {
      if (f.types?.length && !f.types.some(type => isType(card, type) || zone !== "battlefield" && type === "Creature" && name(card) === "Grist, the Hunger Tide")) return false;
      if (f.notTypes?.some(type => isType(card, type))) return false;
      if (f.nonBasic && isType(card, "Basic")) return false;
      if (f.sameName && card.name !== f.sameName) return false;
      if (f.historic && !isType(card, "Artifact|Legendary|Saga")) return false;
      if (f.smallCreature && !(Number(goldfishCharacteristics(state, card).power) <= 1 || Number(goldfishCharacteristics(state, card).toughness) <= 1)) return false;
      if (f.subtypes?.length && !f.subtypes.some(type => zone === "battlefield" && isType(card, "Land") ? gameLandTypes(state, card).includes(type) : new RegExp(`\\b${type}\\b`).test(cardType(card)))) return false;
      if (f.permanent && !isType(card, "Creature|Artifact|Enchantment|Land|Planeswalker|Battle")) return false;
      if (f.colorless && gameColors(card).length) return false;
      if (f.colored && !gameColors(card).length) return false;
      if (f.color && !gameColors(card).includes(f.color)) return false;
      if (f.maxManaValue != null && gameManaValue(card) > f.maxManaValue) return false;
      if (f.minManaValue != null && gameManaValue(card) < f.minManaValue) return false;
      if (f.maxX && gameManaValue(card) > x) return false;
      if (f.printedZeroOne && !["{0}", "{1}"].includes(face(card).manaCost)) return false;
      if (f.nonToken && ["token", "copy"].includes(card.kind)) return false;
      if (f.excludeSelf && card.id === context.source?.id) return false;
      if (f.untapped && card.tapped) return false;
      if (f.attacking && !state.rules.combat?.attackers.some(a => a.id === card.id && a.incarnation === card.incarnation)) return false;
      if (operation.target && zone === "battlefield" && goldfishKeywords(state, card).has("shroud")) return false;
      return true;
    }).map(card => ({ card, ref: ref(card, zone), label: name(card) }));
  });
}
function amount(state, value, context) {
  return value === "x" ? context.x || 0 : value === "creatures" ? state.battlefield.filter(c => isType(c, "Creature")).length : value === "domain" ? gameDomain(state) : value === "metalcraft" ? state.battlefield.filter(c => isType(c, "Artifact")).length >= 3 ? 4 : 2 : value;
}
function damage(state, target, count) {
  if (!target || !count) return;
  if (target.virtual) return;
  if (target.player === "opponent") count += live(state).filter(c => name(c) === "Artist's Talent" && c.level >= 3).length * 2;
  if (target.player) changeLife(state, -count, target.player);
  else {
    const card = find(state, target);
    if (card && isType(card, "Creature")) card.damage = (card.damage || 0) + count;
    else if (card && isType(card, "Planeswalker")) card.counters.loyalty = Math.max(0, (card.counters.loyalty || 0) - count);
  }
}
function destroy(state, card) {
  if (!card || goldfishKeywords(state, card).has("indestructible")) return;
  if (card.regeneration) { card.regeneration -= 1; card.damage = 0; card.tapped = true; if (state.rules.combat) state.rules.combat.attackers = state.rules.combat.attackers.filter(c => c.id !== card.id); }
  else move(state, card.id, "battlefield", "graveyard");
}
function counterTarget(state, ctx, destination = "graveyard") {
  if (ctx.target?.virtual) { (state.rules.notices ||= []).push({ text: `${ctx.sourceName}：相手の対象を打ち消す${destination === "exile" ? "・追放" : ""}（相手側の領域は省略）`, serial: state.rules.turnSerial }); ctx.vars.countered = true; return; }
  const card = find(state, ctx.target);
  if (!card || card.cast?.uncounterable || /(?:This spell|\b[A-Z][^.]+) can't be countered\./.test(face(card).oracleText || "")) return;
  if (card.kind === "ability") state.stack = state.stack.filter(c => c.id !== card.id);
  else move(state, card.id, "stack", destination);
  ctx.vars.countered = true;
}
export function engineEnter(state, card) {
  if (!card || card.faceDown || card.automaticAbilities === false) return false;
  const n = name(card);
  if (isType(card, "Planeswalker") && card.counters.loyalty == null && /^\d+$/.test(face(card).loyalty || "")) card.counters.loyalty = Number(face(card).loyalty);
  if (isType(card, "Class")) card.level ||= 1;
  emitGameEvent(state, { kind: "entered", card });
  if (isType(card, "Land") && !isType(card, "Basic") && has(state, "Blood Moon")) return true;
  if (card.evoked && !entryTriggersBlocked(state, card)) queueGameAbility(state, card, "想起：生け贄", [{ op: "sacrifice-source" }]);
  if (!verifiedGoldfishCard(card)) return entryTriggersBlocked(state, card);
  const add = (label, steps, extra) => queueGameAbility(state, card, label, steps, extra);
  if (n === "Urza's Saga" || n === "The Legend of Roku") { card.sagaChapter = 1; card.counters.lore = 1; add("第I章", n === "Urza's Saga" ? [{ op: "saga", chapter: 1 }] : [{ op: "impulse", count: 3 }]); return true; }
  if (n === "Pompous Battlemage") { card.prepared = true; return true; }
  if (n === "Moonshadow") { card.counters["-1/-1"] = 6; return true; }
  if (n === "Engineered Explosives") { card.counters.charge = card.castColors?.length || 0; return true; }
  if (n === "Chalice of the Void") { card.counters.charge = card.castX || 0; return true; }
  if (n === "Murktide Regent") { card.counters["+1/+1"] = (card.delvedCards || []).filter(c => isType(c, "Instant|Sorcery")).length; return true; }
  // These are entry choices, not triggered abilities: no priority window and
  // no interaction with Torpor Orb or Karn's trigger suppression.
  if (["Pithing Needle", "Disruptor Flute", "Cavern of Souls"].includes(n)) {
    const types = [...new Set([...state.library, ...state.hand, ...state.battlefield, ...state.graveyard].filter(c => isType(c, "Creature")).flatMap(c => (cardType(c).split("—")[1] || "").trim().split(/\s+/)).filter(Boolean))].sort();
    const choice = { type: "engine-entry", card: ref(card), sourceName: n, kind: n === "Cavern of Souls" ? "buttons" : "name", label: n === "Cavern of Souls" ? "魂の洞窟：クリーチャー・タイプ" : "指定するカード名（英語）", names: [...new Set([...state.library, ...state.hand, ...state.battlefield, ...state.graveyard, ...state.sideboard].map(name))].sort(), options: types.map(value => ({ value, label: value })) };
    if (state.rules.pendingChoice) (state.rules.entryChoices ||= []).push(choice); else state.rules.pendingChoice = choice;
    return true;
  }
  if (entryTriggersBlocked(state, card)) return true;
  if (FORMAT_ENTERS[n]) { add("戦場に出たとき", FORMAT_ENTERS[n], { x: card.castX || 0 }); return true; }
  if (n === "Rest in Peace") { add("全墓地を追放", [{ op: "exile-graveyard" }, { op: "opponent-effect", text: "相手の墓地を追放" }]); return true; }
  if (n === "Ingot Chewer") { add("アーティファクトを破壊", [{ op: "destroy-target" }], { targetSpec: { zone: "battlefield", types: ["Artifact"], virtualOpponent: true } }); return true; }
  if (n === "Extinguisher Battleship") { add("非クリーチャーを破壊・全クリーチャーに4点", [{ op: "destroy-target" }, { op: "damage-sweep", amount: 4, filter: { types: ["Creature"] } }], { targetSpec: { zone: "battlefield", permanent: true, notTypes: ["Creature"], virtualOpponent: true } }); return true; }
  if (n === "Beza, the Bounding Spring") { add("相手との比較", [{ op: "beza" }]); return true; }
  if (n === "Kraul Harpooner") { add("宿根：墓地クリーチャー数の強化", [{ op: "undergrowth" }, { op: "opponent-effect", text: "相手の飛行クリーチャーと任意で格闘" }]); return true; }
  if (["Leyline Binding", "Thought-Knot Seer", "Obsidian Charmaw"].includes(n)) { add("相手への登場効果", [{ op: "opponent-effect", text: n === "Leyline Binding" ? "束縛が離れるまで相手の土地でないパーマネントを追放" : n === "Thought-Knot Seer" ? "相手の手札から土地でない1枚を追放" : "相手の基本でない土地を破壊" }]); return true; }
  if (n === "Ugin's Labyrinth" || n === "Isochron Scepter") {
    add("刻印するカードを選ぶ", [select("刻印：手札から追放してもよい", "hand", n === "Ugin's Labyrinth" ? { colorless: true, minManaValue: 7 } : { types: ["Instant"], maxManaValue: 2 }, { destination: "exile", remember: "imprint" }), { op: "imprint-link" }]); return true;
  }
  if (n === "Solitude") { add("クリーチャーを追放・パワー分回復", [{ op: "solitude" }], { targetSpec: { zone: "battlefield", types: ["Creature"], excludeSelf: true, optional: true, virtualOpponent: true } }); return true; }
  if (n === "Skateboard") { add("パーマネントをタップ", [{ op: "tap-target" }], { targetSpec: { zone: "battlefield", permanent: true } }); return true; }
  if (n === "Endurance") { add("墓地を山札の下へ", [{ op: "endurance" }], { targetSpec: { zone: "none", players: true, optional: true } }); return true; }
  if (n === "Badgermole Cub") { add("土の技1", [{ op: "earthbend" }], { targetSpec: { zone: "battlefield", types: ["Land"] } }); return true; }
  const enters = {
    "Quantum Riddler": [draw()], "Stormchaser's Talent": [token("otter")],
    "Dark Matter Manipulator": [{ op: "mill", count: 3 }], "Emry, Lurker of the Loch": [{ op: "mill", count: 4 }],
    "Fear of Missing Out": [discard(1), draw()],
    "Ajani, Nacatl Pariah": [token("catWarrior")],
    "Seasoned Pyromancer": [discard(2, { remember: "selected" }), draw(2), { op: "pyromancer-tokens" }],
    "Ranger-Captain of Eos": [tutor({ types: ["Creature"], maxManaValue: 1 })],
    "Formidable Speaker": [discard(1, { min: 0, remember: "selected" }), { op: "speaker-tutor" }],
    "Craterhoof Behemoth": [{ op: "craterhoof" }],
    "Giant's Boulder": [{ ...look(2, {}, "libraryTop"), max: "all" }],
    "Soul-Guide Lantern": [select("追放する墓地のカード", "graveyard", {}, { destination: "exile" })]
  };
  if (enters[n]) { add("戦場に出たとき", enters[n]); return true; }
  return false;
}

export function engineCast(state, spell) {
  if (!verifiedGoldfishCard(spell)) return;
  const n = name(spell), sourceSteps = {
    "Sowing Mycospawn": [tutor({ types: ["Land"] }, "battlefield")],
    "Devourer of Destiny": [{ op: "move-target", destination: "exile" }],
    "Ugin, Eye of the Storms": [{ op: "move-target", destination: "exile" }]
    ,"Emrakul, the Promised End": [{ op: "opponent-effect", text: "相手の次のターンをコントロール。その後、相手が追加ターンを行う" }]
    ,"Thief of Existence": [{ op: "opponent-effect", text: "相手のクリーチャーでも土地でもないマナ総量4以下のパーマネントを最大1つ追放。離れた時、相手が1枚引く" }]
  };
  if (sourceSteps[n]) queueGameAbility(state, spell, "唱えたとき", sourceSteps[n], ["Devourer of Destiny", "Ugin, Eye of the Storms"].includes(n) ? { targetSpec: { zone: "battlefield", permanent: true, colored: true, optional: n.startsWith("Ugin"), virtualOpponent: true } } : {});
  if (n === "Sowing Mycospawn" && spell.cast?.kicked) queueGameAbility(state, spell, "キッカー：土地を追放", [{ op: "move-target", destination: "exile" }], { targetSpec: { zone: "battlefield", types: ["Land"], virtualOpponent: true } });
  if (["Grapeshot", "Empty the Warrens", "Tendrils of Agony"].includes(n)) queueGameAbility(state, spell, `ストーム：${state.rules.spellsCast - 1}コピー`, [{ op: "storm", spell: structuredClone(spell), count: state.rules.spellsCast - 1 }]);
  if (n === "Consign to Memory" && spell.cast?.replicate) queueGameAbility(state, spell, `複製：${spell.cast.replicate}コピー`, [{ op: "storm", spell: structuredClone(spell), count: spell.cast.replicate }, { op: "copy-target-options" }]);
  if (n === "Ulamog, the Ceaseless Hunger") queueGameAbility(state, spell, "パーマネント2つを追放", [{ op: "move-targets", destination: "exile" }], { targetSpec: { zone: "battlefield", permanent: true, count: 2, virtualOpponent: true } });
  if (n === "Cityscape Leveler") queueGameAbility(state, spell, "パーマネントを破壊・パワーストーン", [{ op: "leveler" }], { targetSpec: { zone: "battlefield", permanent: true, notTypes: ["Land"], optional: true, virtualOpponent: true } });
  for (const card of live(state)) {
    if (!verifiedGoldfishCard(card)) continue;
    const add = (label, steps, extra) => queueGameAbility(state, card, label, steps, extra);
    if (name(card) === "Pinnacle Emissary" && isType(spell, "Artifact")) add("ドローン生成", [token("drone")]);
    if (name(card) === "Stormchaser's Talent" && card.level >= 3 && isType(spell, "Instant|Sorcery")) add("カワウソ生成", [token("otter")]);
    if (name(card) === "Artist's Talent" && !isType(spell, "Creature")) add("任意で手札交換", [discard(1, { min: 0, remember: "selected" }), { op: "draw-selected" }]);
    if (name(card) === "Ugin, Eye of the Storms" && !gameColors(spell).length) add("有色パーマネントを追放", [{ op: "move-target", destination: "exile" }], { targetSpec: { zone: "battlefield", permanent: true, colored: true, optional: true, virtualOpponent: true } });
    if (name(card) === "Ral, Monsoon Mage" && state.rules.activePlayer === "self" && isType(spell, "Instant|Sorcery")) add("コイン投げ", [{ op: "ral-flip" }]);
    if (name(card) === "Vexing Bauble" && spell.cast?.manaSpent === 0) add("マナを使わず唱えた呪文を打ち消す", [{ op: "counter-spell", target: ref(spell, "stack") }]);
    if (name(card) === "Chalice of the Void" && (card.counters.charge || 0) === gameManaValue(spell)) add("虚空の杯：打ち消し", [{ op: "counter-spell", target: ref(spell, "stack") }]);
  }
  if (isType(spell, "Instant|Sorcery")) state.rules.instantSorceryCast = (state.rules.instantSorceryCast || 0) + 1;
}

export function flushEngineEvents(state) {
  if (state.rules.automation || state.rules.resolution) return state;
  for (let pass = 0; state.rules.events?.length && pass < 50; pass++) {
    const events = state.rules.events; state.rules.events = [];
    const deaths = events.filter(e => e.kind === "move" && e.from === "battlefield" && e.to === "graveyard" && isType(e.original, "Creature"));
    const watchers = [...live(state), ...deaths.map(e => e.original).filter(c => !state.battlefield.some(b => b.id === c.id))];
    if (events.some(e => e.kind === "move" && e.to === "graveyard" && isType(e.original, "Creature|Artifact|Enchantment|Land|Planeswalker|Battle"))) {
      for (const card of live(state).filter(c => name(c) === "Moonshadow" && verifiedGoldfishCard(c))) queueGameAbility(state, card, "−1/−1カウンターを取り除く", [{ op: "source-counter", name: "-1/-1", count: -1 }]);
    }
    for (const event of events) {
      if (event.reason === "sacrifice" && isType(event.original, "Artifact")) for (const c of (event.sacrificeWatchers || []).filter(c => verifiedGoldfishCard(c))) queueGameAbility(state, c, "アーティファクトを生け贄：相手に2点", [{ op: "damage", amount: 2 }], { target: { player: "opponent" } });
      if (event.kind === "draw") for (const c of (event.watchers || []).filter(c => name(c) === "Sheoldred, the Apocalypse" && verifiedGoldfishCard(c))) queueGameAbility(state, c, "ドロー：2点回復", [{ op: "life", amount: 2 }]);
      if (event.kind === "move" && event.from === "graveyard" && isType(event.original, "Instant|Sorcery")) for (const c of (event.graveyardWatchers || []).filter(c => verifiedGoldfishCard(c))) queueGameAbility(state, c, "墓地の呪文が離れた：＋1/＋1", [{ op: "source-counter", name: "+1/+1", count: 1 }]);
      if (event.kind === "move" && event.to === "battlefield") {
        const entered = find(state, ref(event.card)) || event.card;
        recordGoldfishEnter(state, entered);
      }
      if (event.kind === "move" && event.from === "battlefield") {
        state.rules.permanentLeft = true;
        if (name(event.original) === "Thought-Knot Seer") queueGameAbility(state, event.original, "相手が1枚引く", [{ op: "opponent-effect", text: "相手が1枚引く" }]);
        if (event.original.name === "Munitions" && event.original.kind === "token") queueGameAbility(state, event.original, "弾薬：2点ダメージ", [{ op: "damage", amount: 2 }], { targetSpec: damageTarget });
        if (event.original.earthbent && ["graveyard", "exile"].includes(event.to)) queueGameAbility(state, event.original, "土の技：タップ状態で戻す", [{ op: "earth-return", target: ref(event.card, event.to) }]);
        for (const linked of event.original.boundCards || []) { const card = find(state, linked); if (card) move(state, card.id, "exile", "battlefield"); }
      }
      if (event.kind === "counters" && event.name === "+1/+1" && event.count > 0 && name(event.card) === "Basking Broodscale" && verifiedGoldfishCard(event.card)) queueGameAbility(state, event.card, "落とし子を生成してもよい", [{ op: "optional-token", name: "spawn" }]);
      if (event.kind === "entered") {
        const entering = event.card;
        if (entryTriggersBlocked(state, entering)) continue;
        for (const watcher of live(state)) {
          if (!verifiedGoldfishCard(watcher)) continue;
          const n = name(watcher), add = (label, steps) => queueGameAbility(state, watcher, label, steps);
          if (n === "Guide of Souls" && watcher.id !== entering.id && isType(entering, "Creature")) add("1点回復・エネルギー1", [{ op: "life", amount: 1 }, { op: "energy", count: 1 }]);
          if (n === "Haliya, Guided by Light" && isType(entering, "Creature|Artifact")) add("1点回復", [{ op: "life", amount: 1 }]);
          if (n === "Kappa Cannoneer" && isType(entering, "Artifact")) add("+1/+1・ブロックされない", [{ op: "source-counter", name: "+1/+1", count: 1 }, { op: "source-keyword", keyword: "unblockable" }]);
          if (n === "Weapons Manufacturing" && isType(entering, "Artifact") && !["token", "copy"].includes(entering.kind)) add("弾薬を生成", [token("munitions")]);
        }
      }
    }
    for (const watcher of watchers) {
      if (!verifiedGoldfishCard(watcher)) continue;
      if (name(watcher) === "Blade of the Bloodchief") for (const death of deaths) queueGameAbility(state, watcher, "装備先にカウンター", [{ op: "bloodchief" }]);
      if (name(watcher) === "Ajani, Nacatl Pariah" && deaths.some(death => death.original.id !== watcher.id && /\bCat\b/.test(cardType(death.original)))) queueGameAbility(state, watcher, "アジャニを変身して戻してもよい", [{ op: "ajani-transform" }]);
    }
    for (const death of deaths) if (name(death.original) === "Haywire Mite" && verifiedGoldfishCard(death.original)) queueGameAbility(state, death.original, "2点回復", [{ op: "life", amount: 2 }]);
    for (const death of deaths) if (name(death.original) === "Greedy Freebooter" && verifiedGoldfishCard(death.original)) queueGameAbility(state, death.original, "占術1・宝物", [{ op: "format-scry", count: 1 }, token("treasure")]);
    for (const event of events) if (event.kind === "move" && event.from === "battlefield" && event.to === "graveyard" && name(event.original) === "Nihil Spellbomb" && verifiedGoldfishCard(event.original)) {
      queueGameAbility(state, event.original, "{B}を払って1枚引いてもよい", [{ op: "optional-draw-cost", cost: "{B}" }]);
    }
  }
  if (!state.rules.cityBlessing && state.battlefield.length >= 10 && live(state).some(c => /\bAscend\b/.test(face(c).oracleText || ""))) state.rules.cityBlessing = true;
  prepareEngineTargets(state);
  return state;
}

function prepareEngineTargets(state) {
  if (state.rules.pendingChoice || state.rules.automation) return;
  const entry = state.stack.toReversed().find(e => e.ability?.rule === "engine" && e.ability.targetSpec && e.ability.target === undefined);
  if (!entry) return;
  const spec = entry.ability.targetSpec, candidates = engineCandidates(state, { ...spec, filter: spec, target: true }, { source: entry.ability.source });
  if (spec.players) candidates.unshift({ ref: { player: "opponent" }, label: "相手" }, { ref: { player: "self" }, label: "自分" });
  if (spec.virtualOpponent) for (let i = 0; i < (spec.count || 1); i++) candidates.unshift({ ref: { id: `virtual-${i}`, player: "opponent", virtual: true }, label: `相手の対象${spec.count ? i + 1 : ""}（領域は省略）` });
  if (!candidates.length) { entry.ability.target = null; entry.ability.noTarget = true; prepareEngineTargets(state); return; }
  state.rules.pendingChoice = { type: "engine-target", sourceName: entry.name, entryId: entry.id, label: spec.label || "誘発の対象を選ぶ", candidates: candidates.map(({ ref, label }) => ({ ref, label })), min: spec.optional ? 0 : spec.count || 1, max: spec.count || 1, ...(spec.count ? { kind: "cards", multipleTargets: true } : {}) };
}

export function engineEndStep(state) {
  if (state.rules.endStepStarted) return;
  state.rules.endStepStarted = true;
  for (const card of live(state)) {
    if (card.warped || card.dashed || card.unearthed) queueGameAbility(state, card, card.dashed ? "疾駆：手札へ" : "終了時：追放", [{ op: "delayed-return", warp: !!card.warped, unearth: !!card.unearthed }]);
    if (card.mobilized) queueGameAbility(state, card, "動員：生け贄", [{ op: "sacrifice-source" }]);
    if (state.rules.activePlayer !== "self") continue;
    if (name(card) === "Ocelot Pride" && state.rules.lifeGained > 0 && verifiedGoldfishCard(card)) queueGameAbility(state, card, "猫を生成・都市の承認ならコピー", [{ op: "ocelot" }]);
    if (name(card) === "Haliya, Guided by Light" && verifiedGoldfishCard(card)) queueGameAbility(state, card, "3点以上回復ならドロー", [{ op: "haliya-draw" }]);
    if (name(card) === "The Ten Rings" && verifiedGoldfishCard(card) && state.hand.length < 10) queueGameAbility(state, card, "手札10枚になるまで引く", [{ op: "ten-rings" }]);
  }
}
export function engineMainStep(state) {
  for (const card of live(state)) if (name(card) === "The Legend of Roku" && verifiedGoldfishCard(card)) { card.sagaChapter = ++card.counters.lore; queueGameAbility(state, card, `第${card.sagaChapter}章`, card.sagaChapter === 2 ? [{ op: "mana-choice", count: 1 }] : [{ op: "roku-transform" }]); }
  for (const card of live(state)) if (name(card) === "Urza's Saga" && verifiedGoldfishCard(card)) {
    card.counters.lore = (card.counters.lore || 0) + 1; card.sagaChapter = card.counters.lore;
    queueGameAbility(state, card, `第${card.sagaChapter}章`, card.sagaChapter === 2 ? [{ op: "saga", chapter: 2 }] : [tutor({ types: ["Artifact"], printedZeroOne: true }, "battlefield"), { op: "saga-final" }]);
  }
}
export function engineUpkeep(state) {
  if (state.rules.activePlayer === "self") for (const card of live(state)) if (name(card) === "Smaug the Magnificent" && verifiedGoldfishCard(card)) queueGameAbility(state, card, "宝物を生成", [token("treasure")]);
  for (const card of live(state)) if (verifiedGoldfishCard(card) && (name(card) === "Duskwatch Recruiter" && state.rules.previousSpellsCast === 0 || name(card) === "Krallenhorde Howler" && state.rules.previousSpellsCast >= 2)) queueGameAbility(state, card, "前のターンの呪文数で変身", [{ op: "transform-source" }]);
}
export function beginEngineOpening(state) {
  const candidates = state.hand.filter(card => verifiedGoldfishCard(card) && (["Leyline of Abundance", "Leyline of the Guildpact", "Devourer of Destiny"].includes(name(card)) || name(card) === "Gemstone Caverns" && !state.onThePlay));
  if (!candidates.length) return false;
  state.rules.openingDraw = !state.onThePlay;
  state.rules.pendingChoice = { type: "engine-opening", sourceName: "ゲーム開始前", label: "初手の能力を使うカードを選ぶ", kind: "cards", min: 0, max: candidates.length, candidates: candidates.map(c => ({ ref: ref(c, "hand"), label: c.name })) };
  return true;
}
function finishOpening(state) {
  for (const source of state.rules.openingReveals || []) queueGameAbility(state, source, "最初のアップキープ：上4枚を選別", [look(4, {}, "libraryTop", "exile")]);
  state.rules.openingReveals = [];
  state.rules.openingComplete = true;
}
export function engineBeginningCombat(state) {
  const before = state.stack.length;
  for (const card of live(state)) if (name(card) === "Ouroboroid" && verifiedGoldfishCard(card)) queueGameAbility(state, card, "パワー分のカウンターを全員へ", [{ op: "ouroboroid" }]);
  return state.stack.length > before;
}
export function engineAttack(state, card, dealtDamage) {
  if (sameRef(state.rules.ringBearer, ref(card))) {
    if (!dealtDamage && state.rules.ringLevel >= 2) queueGameAbility(state, card, "指輪：1枚引いて1枚捨てる", [draw(), discard(1)]);
    if (dealtDamage && state.rules.ringLevel >= 4) queueGameAbility(state, card, "指輪：相手は3点失う", [{ op: "opponent-life", amount: -3 }]);
  }
  if (!dealtDamage && /Firebending (\d+)/.test(face(card).oracleText || "")) queueGameAbility(state, card, "火の技", [{ op: "firebending", count: Number(face(card).oracleText.match(/Firebending (\d+)/)[1]) }]);
  if (!verifiedGoldfishCard(card)) return false;
  const n = name(card), add = (label, steps, extra) => queueGameAbility(state, card, label, steps, extra);
  if (dealtDamage && n === "Ragavan, Nimble Pilferer") { add("宝物を生成・相手の上1枚を確認", [token("treasure"), { op: "restriction", label: "相手の山札を用意している場合、その上1枚を追放。このターン唱えられる。" }]); return true; }
  if (dealtDamage) return false;
  if (n === "Smaug the Magnificent") { add("宝物の数のダメージ", [{ op: "treasure-damage" }], { targetSpec: damageTarget }); return true; }
  if (n === "Ulamog, the Ceaseless Hunger") { add("相手の山札20枚を追放", [{ op: "opponent-effect", text: "相手の山札の上20枚を追放" }]); return true; }
  if (n === "Cityscape Leveler") { add("パーマネントを破壊・パワーストーン", [{ op: "leveler" }], { targetSpec: { zone: "battlefield", permanent: true, notTypes: ["Land"], optional: true, virtualOpponent: true } }); return true; }
  if (n === "Voice of Victory") { add("動員2", [{ op: "mobilize", count: 2 }]); return true; }
  if (n === "Territorial Kavu") { add("カヴー：モードを選ぶ", [{ op: "kavu" }]); return true; }
  if (n === "Fear of Missing Out" && goldfishGraveyardTypes(state).length >= 4 && card.attackedSerial !== state.rules.turnSerial) {
    card.attackedSerial = state.rules.turnSerial;
    add("昂揚：アンタップ・追加戦闘", [{ op: "untap-target" }, { op: "extra-combat" }], { targetSpec: { zone: "battlefield", types: ["Creature"] } }); return true;
  }
  return false;
}
export function engineAttackGroup(state) {
  if (!state.rules.combat?.attackers.length) return;
  for (const card of live(state)) if (name(card) === "Guide of Souls" && verifiedGoldfishCard(card)) queueGameAbility(state, card, "エネルギー3で攻撃クリーチャーを強化", [{ op: "guide-attack" }]);
  for (const source of state.rules.encampments || []) queueGameAbility(state, source, "野営地：戦士2体で攻撃", [{ op: "mobilize", count: 2 }]);
}

function contextEntry(state) { return state.stack.find(c => c.id === state.rules.automation?.entryId); }
function sourceOf(state, ctx) { return find(state, ctx.source); }
function setChoice(state, data) { const ctx = state.rules.automation; state.rules.pendingChoice = { type: "engine-choice", entryId: ctx.entryId, sourceName: ctx.sourceName, ...data }; }
function insertSteps(ctx, steps) { ctx.steps.splice(ctx.step + 1, 0, ...structuredClone(steps)); }
export function startEngineResolution(state, entry) {
  const ability = entry.ability, program = ability?.rule === "engine" ? ability : engineSpellProgram(entry);
  if (!program) return false;
  state.rules.automation = { entryId: entry.id, sourceName: entry.name, source: ability?.source || ref(entry, "stack"), isAbility: !!ability,
    target: structuredClone(ability?.target || entry.cast?.target || null), targets: structuredClone(ability?.targets || []), allocation: structuredClone(ability?.allocation || []), costCards: structuredClone(ability?.costCards || []), x: ability?.x ?? entry.cast?.x ?? 0, cast: structuredClone(entry.cast || {}), steps: structuredClone(program.steps), step: 0, vars: {}, snapshot: structuredClone(ability?.snapshot || entry), finishZone: "graveyard" };
  if (ability?.noTarget || ability?.targetSpec && ability.target && !ability.target.player && !engineCandidates(state, { ...ability.targetSpec, filter: ability.targetSpec, target: true }, state.rules.automation).some(c => sameRef(c.ref, ability.target))) state.rules.automation.steps = [];
  if (!ability && program.target && !goldfishSpellTargets(state, entry).some(c => sameGoldfishTarget(c.ref, state.rules.automation.target))) state.rules.automation.steps = [];
  if (ability?.allocation) {
    const candidates = engineCandidates(state, { ...ability.targetSpec, filter: ability.targetSpec, target: true });
    state.rules.automation.allocation = ability.allocation.filter(a => a.target.player || candidates.some(c => sameRef(c.ref, a.target)));
    if (!state.rules.automation.allocation.length) state.rules.automation.steps = [];
  }
  if (program.target?.maxX && !state.rules.automation.target?.virtual) {
    const candidates = engineCandidates(state, { ...program.target, filter: program.target, target: true }, state.rules.automation);
    if (!candidates.some(c => sameRef(c.ref, state.rules.automation.target))) state.rules.automation.steps = [];
  }
  if (state.rules.automation.target?.virtual && !program.steps.some(op => op.op.startsWith("counter"))) (state.rules.notices ||= []).push({ text: `${entry.name}：相手の対象へ解決（相手側の領域・適正性の確認は省略）`, serial: state.rules.turnSerial });
  continueEngineResolution(state); return true;
}
function finishEngineResolution(state) {
  const ctx = state.rules.automation;
  if (ctx.isAbility) state.stack = state.stack.filter(e => e.id !== ctx.entryId);
  else if (state.stack.some(c => c.id === ctx.entryId)) { move(state, ctx.entryId, "stack", ctx.finishZone); if (ctx.finishZone === "library") shuffleGameLibrary(state); }
  state.rules.automation = null; state.rules.pendingChoice = null;
  state.rules.lastAction = `${ctx.sourceName}：解決しました。`;
}

export function continueEngineResolution(state) {
  const ctx = state.rules.automation;
  while (ctx && !state.rules.pendingChoice && ctx.step < ctx.steps.length) {
    const op = ctx.steps[ctx.step], source = sourceOf(state, ctx), target = ctx.target?.player ? null : find(state, ctx.target);
    const count = amount(state, op.count, ctx);
    if (op.op === "draw") drawGameCards(state, count);
    else if (op.op === "half-x-draw") drawGameCards(state, Math.floor(ctx.x / 2));
    else if (op.op === "cryomancer-reflexive") {
      const count = (ctx.vars.selected || []).filter(c => !isType(c, "Land")).length;
      if (count) queueGameAbility(state, source || ctx.snapshot, "捨てた土地でないカード数までタップ・麻痺", [{ op: "stun-targets" }], { targetSpec: { zone: "battlefield", types: ["Creature"], count, optional: true, virtualOpponent: true } });
    }
    else if (op.op === "stun-targets") for (const r of ctx.targets) { const c = find(state, r); if (c && isType(c, "Creature") && !goldfishKeywords(state, c).has("shroud")) { c.tapped = true; addGameCounters(state, c, "stun", 1); } }
    else if (op.op === "flow-state") { const types = new Set(state.graveyard.flatMap(c => cardType(c).split(/\W+/))), n = types.has("Instant") && types.has("Sorcery") ? 2 : 1; insertSteps(ctx, [{ ...look(3, {}), min: n, max: n }]); }
    else if (op.op === "format-scry") insertSteps(ctx, [{ ...look(count, {}, "libraryTop"), max: "all" }]);
    else if (op.op === "ritual-threshold") state.manaPool.B += state.graveyard.length >= 7 ? 5 : 3;
    else if (op.op === "kicked-damage") damage(state, ctx.target, ctx.cast.kicked ? op.kicked : op.normal);
    else if (op.op === "treasure-damage") damage(state, ctx.target, state.battlefield.filter(c => isType(c, "Treasure")).length);
    else if (op.op === "drain-target") { changeLife(state, -count, ctx.target.player); changeLife(state, count); }
    else if (op.op === "controller-maps" && !ctx.target?.virtual) makeGameToken(state, TOKENS.map, count);
    else if (op.op === "controller-basic" && !ctx.target?.virtual) insertSteps(ctx, [tutor({ types: ["Basic"], subtypes: ["Plains", "Island", "Swamp", "Mountain", "Forest"] }, "battlefield", { tapped: true })]);
    else if (op.op === "explore") {
      const top = state.library.at(-1);
      if (top && isType(top, "Land")) move(state, top.id, "library", "hand");
      else { if (target) addGameCounters(state, target, "+1/+1", 1); if (top) insertSteps(ctx, [select("探検：公開したカードを墓地へ置くか、上に残す", "library", {}, { top: 1, destination: "graveyard" })]); }
    }
    else if (op.op === "life") changeLife(state, op.amount);
    else if (op.op === "opponent-life") changeLife(state, op.amount, "opponent");
    else if (op.op === "energy") state.players.self.energy += count;
    else if (op.op === "mana") for (const color of op.colors) state.manaPool[color]++;
    else if (op.op === "firebending") { state.manaPool.R += count; state.rules.fireMana = (state.rules.fireMana || 0) + count; }
    else if (op.op === "dragon") makeGameToken(state, { name: "Dragon", colors: ["R"], typeLine: "Token Creature — Dragon", power: "4", toughness: "4", oracleText: "Flying\nFirebending 4" });
    else if (op.op === "station" && source) { const paid = ctx.costCards[0], c = paid && (find(state, ref(paid)) || paid); addGameCounters(state, source, "charge", Math.max(0, c ? Number(goldfishCharacteristics(state, c).power) || 0 : 0)); }
    else if (op.op === "artifact-until-end" && target && !isType(target, "Artifact")) { target.originalTypeLine ||= target.typeLine; target.typeLine += " Artifact"; target.addedArtifactSerial = state.rules.turnSerial; if (target.faces?.length) { target.originalFaces ||= structuredClone(target.faces); target.faces[target.faceIndex || 0].typeLine += " Artifact"; } }
    else if (op.op === "unearth" && source) { const c = move(state, source.id, "graveyard", "battlefield"); if (state.battlefield.includes(c)) { c.unearthed = true; c.temporaryEffects.push({ keywords: ["haste"], turn: state.turn, label: "蘇生" }); } }
    else if (op.op === "roku-transform" && source) { const c = move(state, source.id, "battlefield", "exile"), back = move(state, c.id, "exile", "battlefield"); back.faceIndex = 1; back.lane = "creature"; }
    else if (op.op === "team-keyword") for (const c of state.battlefield.filter(c => isType(c, "Creature"))) c.temporaryEffects.push({ keywords: [op.keyword], turn: state.turn, label: ctx.sourceName });
    else if (op.op === "team-counters") for (const c of state.battlefield.filter(c => isType(c, "Creature"))) addGameCounters(state, c, "+1/+1", op.count);
    else if (op.op === "ring-tempts") { state.rules.ringLevel = Math.min(4, (state.rules.ringLevel || 0) + 1); insertSteps(ctx, [select("指輪所持者を選ぶ", "battlefield", { types: ["Creature"] }, { min: 1, remember: "ringBearer" }), { op: "ring-bearer" }]); }
    else if (op.op === "ring-bearer") state.rules.ringBearer = ctx.vars.ringBearer?.[0]?.ref || null;
    else if (op.op === "undergrowth" && source) source.temporaryEffects.push({ power: state.graveyard.filter(c => isType(c, "Creature") || name(c) === "Grist, the Hunger Tide").length, toughness: 0, turn: state.turn, label: "宿根" });
    else if (op.op === "grist-drain") changeLife(state, -state.graveyard.filter(c => isType(c, "Creature") || name(c) === "Grist, the Hunger Tide").length, "opponent");
    else if (op.op === "grist-plus") {
      makeGameToken(state, { name: "Insect", colors: ["B", "G"], typeLine: "Token Creature — Insect", power: "1", toughness: "1" });
      const card = state.library.at(-1); if (card) { const insect = isType(card, "Insect") || name(card) === "Grist, the Hunger Tide"; move(state, card.id, "library", "graveyard"); if (insect) { if (source) addGameCounters(state, source, "loyalty", 1); insertSteps(ctx, [{ op: "grist-plus" }]); } }
    }
    else if (op.op === "grist-reflexive" && ctx.vars.sacrifice?.length) queueGameAbility(state, source || ctx.snapshot, "生け贄にした：クリーチャーかPWを破壊", [{ op: "destroy-target" }], { targetSpec: { zone: "battlefield", types: ["Creature", "Planeswalker"], virtualOpponent: true } });
    else if (op.op === "ashiok") { if (ctx.target?.player === "self") insertSteps(ctx, [{ op: "mill", count: 4 }, { op: "opponent-effect", text: "相手の墓地を追放" }]); else insertSteps(ctx, [{ op: "opponent-effect", text: "相手は4枚切削し、その墓地を追放" }]); }
    else if (op.op === "leveler") {
      if (target) { destroy(state, target); makeGameToken(state, { name: "Powerstone", typeLine: "Token Artifact — Powerstone", tapped: true, power: "", toughness: "", oracleText: "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell." }); }
      else if (ctx.target?.virtual) (state.rules.notices ||= []).push({ text: "相手の対象を破壊し、相手がタップ状態のパワーストーンを生成（相手の領域は省略）", serial: state.rules.turnSerial });
    }
    else if (op.op === "name-card") { setChoice(state, { kind: "name", label: "指定するカード名（英語）", names: [...new Set([...state.library, ...state.hand, ...state.battlefield, ...state.graveyard, ...state.sideboard].map(name))].sort() }); return; }
    else if (op.op === "beza") { setChoice(state, { kind: "comparisons", label: "ベザ：相手のほうが多いものを選ぶ", options: [{ value: "lands", label: "土地の数（宝物1つ）" }, { value: "creatures", label: "クリーチャーの数（魚2体）" }, { value: "hand", label: "手札枚数（1枚ドロー）" }] }); return; }
    else if (op.op === "arena-mana" && source) { state.manaPool.R += 2; state.rules.hasteMana = (state.rules.hasteMana || 0) + 2; source.exerted = true; }
    else if (op.op === "encampment") (state.rules.encampments ||= []).push(structuredClone(ctx.snapshot));
    else if (op.op === "mill") for (let i = 0; i < count && state.library.length; i++) move(state, state.library.at(-1).id, "library", "graveyard");
    else if (op.op === "token") makeGameToken(state, TOKENS[op.name], count);
    else if (op.op === "optional-token") { setChoice(state, { kind: "buttons", label: "トークンを生成しますか？", options: [{ value: "yes", label: "生成する" }, { value: "no", label: "しない" }] }); return; }
    else if (op.op === "select") {
      const candidates = engineCandidates(state, op, ctx);
      const min = Math.min(op.min ?? 0, candidates.length), max = op.max === "all" ? candidates.length : Math.min(op.max ?? 1, candidates.length);
      const seen = op.top != null ? (op.top > 0 ? state[op.zone].slice(-op.top).toReversed().map(c => ref(c, op.zone)) : []) : null;
      if (candidates.length) { setChoice(state, { kind: "cards", label: op.label, candidates: candidates.map(({ ref, label }) => ({ ref, label })), min, max, seen }); return; }
      applySelection(state, ctx, op, [], seen);
    }
    else if (op.op === "draw-selected") drawGameCards(state, (ctx.vars.selected?.length || 0) + (op.extra || 0));
    else if (op.op === "draw-empty") drawGameCards(state, state.hand.length ? 1 : 2);
    else if (op.op === "pyromancer-tokens") makeGameToken(state, TOKENS.elemental, (ctx.vars.selected || []).filter(c => !isType(c, "Land")).length);
    else if (op.op === "speaker-tutor") { if (ctx.vars.selected?.length) insertSteps(ctx, [tutor({ types: ["Creature"] })]); }
    else if (op.op === "consult") { const size = state.battlefield.filter(c => isType(c, "Land")).length; insertSteps(ctx, [{ ...look(size, {}), min: ctx.cast.kicked ? 2 : 1, max: ctx.cast.kicked ? 2 : 1, randomRemainder: true }]); }
    else if (op.op === "damage") damage(state, ctx.target, amount(state, op.amount, ctx));
    else if (op.op === "counter-target") counterTarget(state, ctx, op.destination);
    else if (op.op === "counter-unless") {
      const ferocious = op.ferocious && state.battlefield.some(c => isType(c, "Creature") && Number(goldfishCharacteristics(state, c).power) >= 4);
      if (ctx.target?.virtual || ferocious || !planGoldfishPayment(state, { manaCost: op.cost }).payable) counterTarget(state, ctx, op.destination);
      else { setChoice(state, { kind: "buttons", label: `自分の対象の呪文：${op.cost}を払って打ち消しを回避`, options: [{ value: "pay", label: "支払う" }, { value: "decline", label: "打ち消される" }] }); return; }
    }
    else if (op.op === "swan" && ctx.vars.countered && !ctx.target?.virtual) makeGameToken(state, { name: "Bird", colors: ["U"], typeLine: "Token Creature — Bird", power: "2", toughness: "2", oracleText: "Flying" });
    else if (op.op === "target-controller-life" && !ctx.target?.virtual) changeLife(state, op.amount);
    else if (op.op === "opponent-effect") (state.rules.notices ||= []).push({ text: op.text + "（相手側の領域は省略）", serial: state.rules.turnSerial });
    else if (op.op === "damage-sweep") for (const { card } of engineCandidates(state, { zone: "battlefield", filter: op.filter }, ctx)) damage(state, ref(card), op.amount);
    else if (op.op === "deluge") for (const c of state.battlefield.filter(c => isType(c, "Creature"))) { const n = gameColors(c).some(color => ["G", "W"].includes(color)) ? -3 : -1; c.temporaryEffects.push({ power: n, toughness: n, turn: state.turn, label: ctx.sourceName }); }
    else if (op.op === "divided-damage") for (const a of ctx.allocation) damage(state, a.target, a.amount);
    else if (op.op === "ral-draw" && live(state).some(c => c.id !== ctx.source.id && (gameColors(c).includes("U") || has(state, "Leyline of the Guildpact") && !isType(c, "Land")))) drawGameCards(state, 1);
    else if (op.op === "converge-exile" && target && !isType(target, "Land") && gameManaValue(target) <= (ctx.cast.colorsSpent || []).length) move(state, target.id, "battlefield", "exile");
    else if (op.op === "fuse-destroy") for (const [targets, type] of [[ctx.cast.fuseArtifact, "Artifact"], [ctx.cast.fuseEnchantment, "Enchantment"]]) { const c = find(state, targets?.[0]); if (c && isType(c, type) && !goldfishKeywords(state, c).has("shroud")) destroy(state, c); }
    else if (op.op === "brotherhood") insertSteps(ctx, ctx.cast.mode === "damage" ? [{ op: "damage-sweep", amount: 3, filter: { types: ["Creature", "Planeswalker"] } }] : [{ op: "sweep", filter: { types: ["Artifact"], maxManaValue: 3 } }]);
    else if (op.op === "wail") {
      if (ctx.cast.mode === "scion") makeGameToken(state, { ...TOKENS.spawn, name: "Eldrazi Scion", typeLine: "Token Creature — Eldrazi Scion", power: "1" });
      else { const r = ctx.cast.modeTargets?.[0], c = find(state, r); ctx.target = r;
        if (ctx.cast.mode === "counter") { if (r?.virtual || c && isType(c, "Sorcery")) counterTarget(state, ctx); }
        else if (c && isType(c, "Creature") && !goldfishKeywords(state, c).has("shroud") && (Number(goldfishCharacteristics(state, c).power) <= 1 || Number(goldfishCharacteristics(state, c).toughness) <= 1)) move(state, c.id, "battlefield", "exile");
      }
    }
    else if (op.op === "grant-free-cast") for (const c of ctx.vars.freeCards || []) { const card = find(state, c.ref); if (card) card.playPermission = { kind: "impulse", expires: state.rules.turnSerial, free: true }; }
    else if (op.op === "exile-graveyard") for (const c of [...state.graveyard]) move(state, c.id, "graveyard", "exile");
    else if (op.op === "jace-ultimate") {
      if (ctx.target?.player === "self") { for (const c of [...state.library]) move(state, c.id, "library", "exile"); for (const c of [...state.hand]) move(state, c.id, "hand", "library"); shuffleGameLibrary(state); }
      else (state.rules.notices ||= []).push({ text: "ジェイス−12：相手の山札を全追放し、手札を山札にしてシャッフル（相手側の領域は省略）", serial: state.rules.turnSerial });
    }
    else if (op.op === "jace-top") insertSteps(ctx, ctx.target?.player === "self" ? [look(1, {}, "libraryTop")] : [{ op: "opponent-effect", text: "相手の山札の上1枚を見て、任意で一番下へ置く" }]);
    else if (op.op === "thraben") {
      const r = ctx.cast.modeTargets?.[0], card = find(state, r);
      if (ctx.cast.mode === "graveyards") {
        if (ctx.cast.gravePlayers.some(r => r.player === "self")) for (const c of [...state.graveyard]) move(state, c.id, "graveyard", "exile");
        if (ctx.cast.gravePlayers.some(r => r.player === "opponent")) (state.rules.notices ||= []).push({ text: "スレイベンの魔除け：相手の墓地を追放", serial: state.rules.turnSerial });
      } else if (card && !goldfishKeywords(state, card).has("shroud")) {
        if (ctx.cast.mode === "damage" && isType(card, "Creature")) damage(state, r, state.battlefield.filter(c => isType(c, "Creature")).length * 2);
        if (ctx.cast.mode === "enchantment" && isType(card, "Enchantment")) destroy(state, card);
      }
    }
    else if (op.op === "bounce") { if (target) move(state, target.id, ctx.target.zone || "battlefield", "hand"); }
    else if (op.op === "boomerang-draw") { if (ctx.target && !ctx.target.player) drawGameCards(state, 1); }
    else if (op.op === "pump" && target) target.temporaryEffects.push({ power: op.power, toughness: op.toughness, turn: state.turn, label: ctx.sourceName });
    else if (op.op === "destroy" && target) { if (gameManaValue(target) <= (state.rules.permanentLeft ? 4 : 2)) destroy(state, target); }
    else if (op.op === "move-target" && target) move(state, target.id, ctx.target.zone || "battlefield", op.destination);
    else if (op.op === "move-targets") for (const r of ctx.targets) { const c = find(state, r); if (c && !goldfishKeywords(state, c).has("shroud")) move(state, c.id, r.zone || "battlefield", op.destination); }
    else if (op.op === "sweep") for (const { card } of engineCandidates(state, { zone: "battlefield", filter: op.filter }, ctx)) destroy(state, card);
    else if (op.op === "source-counter" && source) addGameCounters(state, source, op.name, count);
    else if (op.op === "source-keyword" && source) source.temporaryEffects.push({ keywords: [op.keyword], turn: state.turn, label: op.keyword });
    else if (op.op === "adapt" && source && !source.counters["+1/+1"]) addGameCounters(state, source, "+1/+1", 1);
    else if (op.op === "untap-source" && source) untapGoldfishObject(source);
    else if (op.op === "tap-source" && source) source.tapped = true;
    else if (op.op === "untap-target" && target) untapGoldfishObject(target);
    else if (op.op === "tap-target" && target) target.tapped = true;
    else if (op.op === "team-counters") for (const card of state.battlefield.filter(c => isType(c, "Creature") && (!op.subtype || new RegExp(`\\b${op.subtype}\\b`).test(cardType(c))))) addGameCounters(state, card, "+1/+1", count);
    else if (op.op === "level" && source) {
      source.level = op.level;
      if (name(source) === "Stormchaser's Talent" && op.level === 2) queueGameAbility(state, source, "墓地の呪文を手札へ", [{ op: "move-target", destination: "hand" }], { targetSpec: { zone: "graveyard", types: ["Instant", "Sorcery"] } });
    }
    else if (op.op === "grant-cast" && target) target.grantedCast = { serial: state.rules.turnSerial, cost: face(target).manaCost };
    else if (op.op === "woodland-copy" && source && target) {
      const fields = ["name", "printedName", "typeLine", "oracleText", "manaCost", "power", "toughness", "colors", "loyalty", "imageUrl", "faces", "faceIndex", "layout"];
      source.copyBase = Object.fromEntries(fields.map(key => [key, structuredClone(source[key])]));
      for (const key of fields) source[key] = structuredClone(target[key]);
      source.faceIndex = 0; source.lane = isType(source, "Creature") ? "creature" : isType(source, "Land") ? "land" : "other";
    }
    else if (op.op === "past-flames") for (const card of state.graveyard.filter(c => isType(c, "Instant|Sorcery"))) card.grantedCast = { serial: state.rules.turnSerial, cost: face(card).manaCost, flashback: true };
    else if (op.op === "finish-zone") ctx.finishZone = op.zone;
    else if (op.op === "impulse" || op.op === "hex") {
      const cards = op.op === "hex" ? [...state.hand] : state.library.slice(-count).toReversed();
      for (const card of cards) { const exiled = move(state, card.id, op.op === "hex" ? "hand" : "library", "exile"); if (!op.instantSorcery || isType(card, "Instant|Sorcery")) exiled.playPermission = { kind: "impulse", expires: state.rules.turnSerial + (op.expiresNow ? 0 : state.rules.activePlayer === "self" ? 2 : 1), free: !!op.free }; }
      if (op.op === "hex") drawGameCards(state, cards.length);
    }
    else if (op.op === "wish") state.rules.wish = state.rules.turnSerial;
    else if (op.op === "mana-choice") { setChoice(state, { kind: "mana", label: op.sameColor ? `同じ色のマナを${count}点加える` : "加えるマナの色", count, sameColor: !!op.sameColor, colors: op.colors || ["W", "U", "B", "R", "G"] }); return; }
    else if (op.op === "optional-draw-cost") {
      const plan = planGoldfishPayment(state, { manaCost: op.cost });
      if (plan.payable) { setChoice(state, { kind: "buttons", label: `${op.cost}を払って1枚引きますか？${plan.life ? `（ライフ${plan.life}点）` : ""}`, options: [{ value: "yes", label: "払って引く" }, { value: "no", label: "払わない" }] }); return; }
    }
    else if (op.op === "bloodchief" && source) { const equipped = find(state, source.attachedTo); if (equipped) addGameCounters(state, equipped, "+1/+1", /\bVampire\b/.test(cardType(equipped)) ? 2 : 1); }
    else if (op.op === "saga" && source) source.sagaAbilities = Math.max(source.sagaAbilities || 0, op.chapter);
    else if (op.op === "saga-final" && source) move(state, source.id, "battlefield", "graveyard");
    else if (op.op === "delayed-return" && source) { const card = move(state, source.id, "battlefield", op.warp || op.unearth ? "exile" : "hand"); if (op.warp) card.playPermission = { kind: "warp", serial: state.rules.turnSerial }; }
    else if (op.op === "sacrifice-source" && source) move(state, source.id, "battlefield", "graveyard");
    else if (op.op === "haliya-draw" && state.rules.lifeGained >= 3) drawGameCards(state, 1);
    else if (op.op === "ten-rings" && state.hand.length < 10) drawGameCards(state, 10 - state.hand.length);
    else if (op.op === "ral-reduce") state.rules.ralReductionUntil = state.rules.turnSerial + 1;
    else if (op.op === "imprint-link" && source && ctx.vars.imprint?.length) source.imprinted = ctx.vars.imprint[0].ref;
    else if (op.op === "imprint-return" && source) { const card = find(state, source.imprinted); if (card) move(state, card.id, "exile", "hand"); }
    else if (op.op === "imprint-copy" && source && find(state, source.imprinted)) {
      ctx.vars.imprintCopy = structuredClone(find(state, source.imprinted));
      const spell = ctx.vars.imprintCopy, blocked = castBlockReason(state, "exile"), options = [];
      for (const kicked of [false, true]) {
        if (kicked && !/Kicker \{/.test(face(spell).oracleText)) continue;
        const cost = goldfishCastingCost(spell, { state, baseCost: "{0}", kicked });
        const plan = planGoldfishPayment(state, { manaCost: cost }, { spell });
        if (!blocked && plan.payable) options.push({ value: kicked ? "kicked" : "yes", label: `${kicked ? "キッカー込みで" : ""}唱える${plan.manaSpent ? `（追加${cost}）` : "（0マナ）"}` });
      }
      options.push({ value: "no", label: "唱えない" });
      setChoice(state, { kind: "buttons", label: blocked || (options.length === 1 ? "追加のマナを払えないため、コピーを唱えられません" : "刻印した呪文のコピーを唱えますか？"), options }); return;
    }
    else if (op.op === "copy-target") {
      const spec = goldfishSpellProgram(ctx.vars.castCopy)?.target;
      const candidates = spec ? engineCandidates(state, { ...spec, filter: spec, target: true }, ctx).map(({ ref, label }) => ({ ref, label })) : [];
      if (spec?.players) candidates.unshift({ ref: { player: "opponent" }, label: "相手" }, { ref: { player: "self" }, label: "自分" });
      else if (spec?.virtualOpponent) candidates.unshift({ ref: { player: "opponent", virtual: true }, label: "相手の対象（領域は省略）" });
      if (spec && !candidates.length) delete ctx.vars.castCopy;
      else if (spec) { setChoice(state, { kind: "copy-target", label: "コピーする呪文の対象", candidates, min: 1, max: 1 }); return; }
    }
    else if (op.op === "copy-target-options") { setChoice(state, { kind: "buttons", label: "複製した呪文の対象", options: [{ value: "same", label: "すべて元と同じ対象" }, { value: "new", label: "コピーごとに対象を選ぶ" }] }); return; }
    else if (op.op === "retarget-copy") {
      const copy = ctx.vars.stormCopies[op.index], candidates = goldfishSpellTargets(state, copy).map(({ ref, label }) => ({ ref, label }));
      // Keeping an original target is allowed even if it has become illegal.
      if (!candidates.some(c => sameGoldfishTarget(c.ref, copy.cast.target))) candidates.unshift({ ref: copy.cast.target, label: "元の対象のまま" });
      setChoice(state, { kind: "copy-target", label: `コピー${op.index + 1}の対象`, candidates, min: 1, max: 1 }); return;
    }
    else if (op.op === "grave-source-return" && source) move(state, source.id, "graveyard", "hand");
    else if (op.op === "solitude" && target) { const power = Math.max(0, Number(goldfishCharacteristics(state, target).power) || 0); move(state, target.id, "battlefield", "exile"); changeLife(state, power); }
    else if (op.op === "binding" && target && source) { const card = move(state, target.id, "battlefield", "exile"); source.boundCards = [ref(card, "exile")]; }
    else if (op.op === "endurance" && ctx.target?.player === "self") insertSteps(ctx, [select("自分の墓地を山札の下へ置く（全カード）", "graveyard", {}, { min: state.graveyard.length, max: "all", destination: "libraryBottom" })]);
    else if (op.op === "endurance" && ctx.target?.player === "opponent") insertSteps(ctx, [{ op: "opponent-effect", text: "相手は墓地を好きな順序で山札の一番下に置く" }]);
    else if (op.op === "pummeler") { const creatures = state.battlefield.filter(c => isType(c, "Creature")), size = Math.max(0, ...creatures.map(c => Number(goldfishCharacteristics(state, c).power) || 0)); for (const c of creatures) c.temporaryEffects.push({ power: size, toughness: size, turn: state.turn, label: ctx.sourceName }); }
    else if (op.op === "ajani-damage" && live(state).some(c => c.id !== source?.id && gameColors(c).includes("R"))) queueGameAbility(state, source || ctx.snapshot, "アジャニ：クリーチャー数分のダメージ", [{ op: "damage", amount: "creatures" }], { targetSpec: damageTarget });
    else if (op.op === "ocelot" && state.rules.lifeGained > 0) {
      makeGameToken(state, TOKENS.cat);
      if (state.battlefield.length >= 10 && has(state, "Ocelot Pride")) state.rules.cityBlessing = true;
      if (state.rules.cityBlessing) {
        const copies = state.battlefield.filter(c => ["token", "copy"].includes(c.kind) && c.enteredSerial === state.rules.turnSerial).map(c => ({ name: c.name, typeLine: c.typeLine, manaCost: c.manaCost, power: c.power, toughness: c.toughness, colors: c.colors, oracleText: c.oracleText, imageUrl: c.imageUrl }));
        for (const card of copies) makeGameToken(state, card);
      }
    }
    else if (op.op === "earthbend") {
      const card = target;
      if (card) { card.earthbent = true; if (!isType(card, "Creature")) { card.originalTypeLine ||= card.typeLine; card.originalFaces ||= structuredClone(card.faces); card.typeLine += " Creature"; if (card.faces?.length) card.faces[card.faceIndex || 0].typeLine += " Creature"; } card.lane = "creature"; addGameCounters(state, card, "+1/+1", 1); }
    }
    else if (op.op === "earth-return") { const card = find(state, op.target); if (card) move(state, card.id, op.target.zone, "battlefield").tapped = true; }
    else if (op.op === "craterhoof") { const creatures = state.battlefield.filter(c => isType(c, "Creature")); for (const card of creatures) card.temporaryEffects.push({ power: creatures.length, toughness: creatures.length, keywords: ["trample"], turn: state.turn, label: ctx.sourceName }); }
    else if (op.op === "ouroboroid") { const p = Number(source ? goldfishCharacteristics(state, source).power : ctx.snapshot.power || 0); for (const card of state.battlefield.filter(c => isType(c, "Creature"))) addGameCounters(state, card, "+1/+1", Math.max(0, p)); }
    else if (op.op === "mobilize") { for (const card of makeGameToken(state, { ...TOKENS.warrior, tapped: true, mobilized: true }, count)) state.rules.combat?.attackers.push(ref(card)); }
    else if (op.op === "extra-combat") state.rules.extraCombats = (state.rules.extraCombats || 0) + 1;
    else if (op.op === "guide-attack") {
      if (state.players.self.energy >= 3) { setChoice(state, { kind: "buttons", label: "エネルギー3を払って強化しますか？", options: [{ value: "yes", label: "3払う" }, { value: "no", label: "払わない" }] }); return; }
    }
    else if (op.op === "guide-boost" && target && state.rules.combat?.attackers.some(r => sameRef(r, ref(target)))) { addGameCounters(state, target, "+1/+1", 2); addGameCounters(state, target, "flying", 1); target.originalTypeLine ||= target.typeLine; target.typeLine += " Angel"; }
    else if (op.op === "regenerate" && target) target.regeneration = (target.regeneration || 0) + 1;
    else if (op.op === "explosives") { const charge = ctx.snapshot.counters?.charge || 0; for (const card of [...state.battlefield]) if (!isType(card, "Land") && gameManaValue(card) === charge) destroy(state, card); }
    else if (op.op === "grave-exile") { setChoice(state, { kind: "buttons", label: "追放する墓地", options: [{ value: "self", label: "自分" }, { value: "opponent", label: "相手（仮想）" }] }); return; }
    else if (op.op === "teferi-flash") state.rules.sorceryFlashUntil = state.rules.turnSerial + 2;
    else if (op.op === "animate-artifact" && target) { target.animated = { until: state.rules.turnSerial + 2, size: gameManaValue(target), originalTypeLine: target.typeLine }; target.originalTypeLine ||= target.typeLine; target.typeLine += " Creature"; target.lane = "creature"; }
    else if (op.op === "transform-source" && source) source.faceIndex = source.faceIndex ? 0 : 1;
    else if (op.op === "destroy-target" && target) destroy(state, target);
    else if (op.op === "energy-damage" || op.op === "wrath-energy") { setChoice(state, { kind: "number", label: "使うエネルギー", min: 0, max: state.players.self.energy }); return; }
    else if (["kavu", "ajani-transform", "ral-flip"].includes(op.op)) {
      if (op.op === "ral-flip") {
        const win = Math.random() < .5; ctx.vars.flip = win;
        if (!win) { changeLife(state, -1); (state.rules.notices ||= []).push({ text: "ラル：コイン負け、1点ダメージ", serial: state.rules.turnSerial }); }
        else { setChoice(state, { kind: "buttons", label: "コインは勝ち。ラルを変身させますか？", options: [{ value: "yes", label: "変身する" }, { value: "no", label: "しない" }] }); return; }
      } else { setChoice(state, { kind: "buttons", label: op.op === "kavu" ? "攻撃時のモード" : "アジャニを変身させますか？", options: op.op === "kavu" ? [{ value: "loot", label: "捨てて引く" }, { value: "exile", label: "墓地1枚を追放" }] : [{ value: "yes", label: "変身する" }, { value: "no", label: "しない" }] }); return; }
    }
    else if (op.op === "storm") { const copies = []; for (let i = 0; i < op.count; i++) copies.push({ ...structuredClone(op.spell), id: `extra-${state.nextId++}`, kind: "copy" }); ctx.vars.stormCopies = copies; }
    else if (op.op === "counter-spell") counterTarget(state, { ...ctx, target: op.target });
    else if (op.op === "restriction") (state.rules.notices ||= []).push({ text: op.label, serial: state.rules.turnSerial });
    else if (op.op === "chant") {
      if (ctx.target?.player === "self") state.rules.selfNoCastSerial = state.rules.turnSerial;
      if (ctx.cast.kicked) state.rules.noAttackSerial = state.rules.turnSerial;
      (state.rules.notices ||= []).push({ text: `${ctx.target?.player === "self" ? "自分" : "相手"}はこのターン呪文を唱えられない${ctx.cast.kicked ? "。このターンはクリーチャーが攻撃できない" : ""}`, serial: state.rules.turnSerial });
    }
    else if (op.op === "opponent-hand") (state.rules.notices ||= []).push({ text: "相手の手札破壊を解決（相手側の領域は省略）", serial: state.rules.turnSerial });
    else if (op.op === "days-undoing") {
      for (const zone of ["hand", "graveyard"]) for (const card of [...state[zone]]) move(state, card.id, zone, "library"); shuffleGameLibrary(state); drawGameCards(state, 7);
      if (state.rules.activePlayer === "self") {
        ctx.finishZone = "exile"; state.rules.endTurnEffect = true;
        for (const card of [...state.stack]) if (card.id !== ctx.entryId && card.kind !== "ability") move(state, card.id, "stack", "exile");
        state.stack = state.stack.filter(c => c.id === ctx.entryId);
        state.rules.events = []; state.rules.resumeCombat = false; delete state.rules.afterEndStep;
      }
    }
    else if (op.op === "kozilek-modes") {
      const command = ctx.cast.command;
      if (!command) throw new Error("コジレックの命令のモードが未指定です。唱える前まで戻して選んでください。");
      const steps = [];
      if (command.modes.includes("spawn")) steps.push(command.spawn === "self" ? token("spawn", ctx.x) : { op: "restriction", label: `相手：落とし子${ctx.x}体` });
      if (command.modes.includes("scry")) steps.push(...(command.scry === "self" ? [{ ...look(ctx.x, {}, "libraryTop"), max: "all" }, draw()] : [{ op: "restriction", label: `相手：占術${ctx.x}と1枚ドロー` }]));
      if (command.modes.includes("creature")) {
        const card = find(state, command.creature[0]);
        if (card && isType(card, "Creature") && gameManaValue(card) <= ctx.x && !goldfishKeywords(state, card).has("shroud")) steps.push({ op: "move-fixed", target: command.creature[0], destination: "exile" });
      }
      if (command.modes.includes("grave")) for (const target of command.grave) if (find(state, target)) steps.push({ op: "move-fixed", target, destination: "exile" });
      insertSteps(ctx, steps);
    }
    else if (op.op === "move-fixed") { const card = find(state, op.target); if (card) move(state, card.id, op.target.zone, op.destination); }
    else if (op.op === "surgical" && target) insertSteps(ctx, [select("同名のカードを好きな枚数追放", ["graveyard", "hand", "library"], { sameName: target.name }, { max: "all", destination: "exile", shuffle: true })]);
    else if (op.op === "surgical" && ctx.target?.virtual) (state.rules.notices ||= []).push({ text: "相手の対象と同名のカードを相手の手札・墓地・山札から任意に追放し、相手はシャッフル（相手の領域は省略）", serial: state.rules.turnSerial });
    else if (op.op === "cavern-type" && source) {
      const types = [...new Set([...state.library, ...state.hand, ...state.battlefield, ...state.graveyard].filter(c => isType(c, "Creature")).flatMap(c => (cardType(c).split("—")[1] || "").trim().split(/\s+/)).filter(Boolean))].sort();
      setChoice(state, { kind: "buttons", label: "魂の洞窟：クリーチャー・タイプ", options: types.map(value => ({ value, label: value })) }); return;
    }
    ctx.step++;
  }
  if (ctx && !state.rules.pendingChoice) {
    const copies = ctx.vars.stormCopies, castCopy = ctx.vars.castCopy, copyTarget = ctx.vars.copyTarget, copyPlan = ctx.vars.copyPlan, copyKicked = ctx.vars.copyKicked;
    if (castCopy) payGoldfishPlanDraft(state, copyPlan);
    finishEngineResolution(state); if (copies) state.stack.push(...copies);
    if (castCopy) { const spell = { ...castCopy, id: "extra-" + state.nextId++, kind: "copy", counters: {}, cast: { target: copyTarget || null, kicked: copyKicked, x: 0, manaSpent: copyPlan.manaSpent, colorsSpent: copyPlan.colorsSpent, uncounterable: copyPlan.uncounterable } }; state.stack.push(spell); recordGoldfishCast(state, spell); }
  }
}

function applySelection(state, ctx, op, refs, seen) {
  const selected = refs.map(r => ({ ...structuredClone(find(state, r)), ref: r })).filter(c => c.id);
  ctx.vars[op.remember || "selected"] = selected;
  // UI order is first-to-draw; library is stored with its top at the end.
  for (const card of op.destination === "libraryTop" ? selected.toReversed() : selected) if (op.destination) {
    const moved = move(state, card.id, card.ref.zone, op.destination);
    const actual = ["battlefield", "hand", "graveyard", "exile", "library"].find(zone => state[zone].includes(moved));
    card.ref = ref(moved, actual || card.ref.zone);
    if (actual === "battlefield" && (op.tapped || /enters tapped\./.test(face(moved).oracleText || ""))) moved.tapped = true;
  }
  if (seen && op.remainder) {
    let rest = seen.filter(r => !refs.some(s => s.id === r.id));
    if (op.randomRemainder) rest = rest.map(r => ({ r, n: Math.random() })).sort((a, b) => a.n - b.n).map(x => x.r);
    for (const r of rest.toReversed()) if (find(state, r)) move(state, r.id, r.zone, op.remainder);
  }
  if (op.shuffle) shuffleGameLibrary(state);
}
export function chooseEngine(state, answer) {
  const choice = state.rules.pendingChoice;
  if (choice?.type === "engine-entry") {
    const source = find(state, choice.card), value = answer.value;
    if (typeof value !== "string" || !value.trim() || value.length > 160 || choice.kind === "buttons" && !choice.options.some(o => o.value === value)) throw new Error("戦場に出る際の選択を確定してください。");
    if (source) {
      if (choice.kind === "buttons") source.chosenType = value;
      else source.chosenName = choice.names.find(n => n.toLowerCase() === value.trim().toLowerCase()) || value.trim();
    }
    state.rules.pendingChoice = state.rules.entryChoices?.shift() || null;
    if (!state.rules.pendingChoice && state.rules.automation) continueEngineResolution(state);
    return;
  }
  if (choice?.type === "engine-opening") {
    const refs = answer.refs;
    if (!Array.isArray(refs) || new Set(refs.map(r => r.id)).size !== refs.length || refs.some(r => !choice.candidates.some(c => JSON.stringify(c.ref) === JSON.stringify(r)) || !find(state, r))) throw new Error("初手のカードを選んでください。");
    state.rules.pendingChoice = null; state.rules.openingReveals = []; let caverns = 0;
    for (const r of refs) {
      const card = find(state, r);
      if (name(card) === "Devourer of Destiny") state.rules.openingReveals.push(structuredClone(card));
      else { const entered = move(state, card.id, "hand", "battlefield"); if (name(card) === "Gemstone Caverns") { entered.counters.luck = 1; caverns++; } }
    }
    if (caverns) {
      if (state.hand.length < caverns) throw new Error("宝石の洞窟で追放する手札が足りません。");
      state.rules.pendingChoice = { type: "engine-opening-exile", sourceName: "宝石の洞窟", label: "手札を追放する", kind: "cards", min: caverns, max: caverns, candidates: state.hand.map(c => ({ ref: ref(c, "hand"), label: c.name })) };
    } else finishOpening(state);
    return;
  }
  if (choice?.type === "engine-opening-exile") {
    if (!Array.isArray(answer.refs) || answer.refs.length !== choice.min || new Set(answer.refs.map(r => r.id)).size !== answer.refs.length || answer.refs.some(r => !find(state, r) || r.zone !== "hand")) throw new Error("指定枚数の手札を選んでください。");
    for (const r of answer.refs) move(state, r.id, "hand", "exile");
    state.rules.pendingChoice = null; finishOpening(state); return;
  }
  if (choice?.type === "engine-legend") {
    if (!choice.ids.includes(answer.keep)) throw new Error("残す伝説のパーマネントを選んでください。");
    for (const id of choice.ids) if (id !== answer.keep && state.battlefield.some(c => c.id === id)) move(state, id, "battlefield", "graveyard");
    state.rules.pendingChoice = null; return;
  }
  if (choice?.type === "engine-target") {
    const entry = state.stack.find(e => e.id === choice.entryId);
    if (choice.multipleTargets) {
      const refs = answer.refs;
      if (!entry || !Array.isArray(refs) || refs.length < choice.min || refs.length > choice.max || new Set(refs.map(r => JSON.stringify(r))).size !== refs.length || refs.some(r => !choice.candidates.some(c => JSON.stringify(c.ref) === JSON.stringify(r)))) throw new Error("異なる適正な対象を選んでください。");
      entry.ability.targets = refs; entry.ability.target = null; state.rules.pendingChoice = null; prepareEngineTargets(state); return;
    }
    const target = answer.target || null;
    if (!entry || (!target && choice.min) || (target && !choice.candidates.some(c => JSON.stringify(c.ref) === JSON.stringify(target)))) throw new Error("適正な対象を選んでください。");
    entry.ability.target = target; state.rules.pendingChoice = null; prepareEngineTargets(state); return;
  }
  const ctx = state.rules.automation;
  if (!ctx || choice?.type !== "engine-choice" || choice.entryId !== ctx.entryId) throw new Error("解決中の選択が一致しません。");
  const op = ctx.steps[ctx.step];
  if (choice.kind === "name") {
    if (typeof answer.value !== "string" || !answer.value.trim() || answer.value.length > 160) throw new Error("カード名を入力してください。");
    const card = sourceOf(state, ctx); if (card) card.chosenName = choice.names.find(n => n.toLowerCase() === answer.value.trim().toLowerCase()) || answer.value.trim();
  } else if (choice.kind === "comparisons") {
    if (!Array.isArray(answer.values) || new Set(answer.values).size !== answer.values.length || answer.values.some(v => !choice.options.some(o => o.value === v))) throw new Error("比較条件を選んでください。");
    if (answer.values.includes("lands")) makeGameToken(state, TOKENS.treasure);
    if (state.players.opponent.life > state.players.self.life) changeLife(state, 4);
    if (answer.values.includes("creatures")) makeGameToken(state, { name: "Fish", colors: ["U"], typeLine: "Token Creature — Fish", power: "1", toughness: "1" }, 2);
    if (answer.values.includes("hand")) drawGameCards(state, 1);
  } else if (choice.kind === "copy-target") {
    if (!choice.candidates.some(c => JSON.stringify(c.ref) === JSON.stringify(answer.target))) throw new Error("対象を選んでください。");
    if (op.op === "retarget-copy") ctx.vars.stormCopies[op.index].cast.target = answer.target;
    else ctx.vars.copyTarget = answer.target;
  } else if (choice.kind === "cards") {
    const refs = answer.refs;
    if (!Array.isArray(refs) || refs.length < choice.min || refs.length > choice.max || new Set(refs.map(r => r.id)).size !== refs.length || refs.some(r => !choice.candidates.some(c => JSON.stringify(c.ref) === JSON.stringify(r)) || !find(state, r))) throw new Error(`カードを${choice.min}〜${choice.max}枚選んでください。`);
    applySelection(state, ctx, op, refs, choice.seen);
  } else if (choice.kind === "number") {
    const n = answer.value;
    if (!Number.isInteger(n) || n < choice.min || n > choice.max) throw new Error("範囲内の整数を選んでください。");
    state.players.self.energy -= n;
    if (op.op === "energy-damage") damage(state, ctx.target, n);
    else for (const card of [...state.battlefield]) if (isType(card, "Artifact|Creature|Enchantment") && gameManaValue(card) <= n) destroy(state, card);
  } else if (choice.kind === "mana") {
    if (!Array.isArray(answer.colors) || answer.colors.length !== choice.count || answer.colors.some(c => !(choice.colors || ["W", "U", "B", "R", "G"]).includes(c))) throw new Error("マナの色を選んでください。");
    if (op.sameColor && new Set(answer.colors).size !== 1) throw new Error("同じ色のマナを選んでください。");
    for (const color of answer.colors) state.manaPool[color]++;
  } else if (choice.kind === "buttons") {
    const values = choice.multiple ? answer.values : [answer.value];
    if (!Array.isArray(values) || values.length !== (choice.multiple || 1) || new Set(values).size !== values.length || values.some(v => !choice.options.some(o => o.value === v))) throw new Error("選択肢を選んでください。");
    const value = values[0];
    if (op.op === "copy-target-options" && value === "new") insertSteps(ctx, ctx.vars.stormCopies.map((_, index) => ({ op: "retarget-copy", index })));
    if (op.op === "counter-unless") {
      if (value === "pay") { const plan = planGoldfishPayment(state, { manaCost: op.cost }); if (!plan.payable) throw new Error(plan.reason); for (const a of plan.activations) state.battlefield.find(c => c.id === a.id).tapped = true; state.manaPool = plan.remaining; state.rules.restrictedMana = plan.restrictedMana; state.rules.hasteMana = plan.remainingHasteMana; state.rules.fireMana = plan.remainingFireMana; changeLife(state, -plan.life); }
      else counterTarget(state, ctx, op.destination);
    }
    if (op.op === "optional-draw-cost" && value === "yes") {
      const plan = planGoldfishPayment(state, { manaCost: op.cost });
      if (!plan.payable) throw new Error(plan.reason);
      for (const activation of plan.activations) state.battlefield.find(c => c.id === activation.id).tapped = true;
      state.manaPool = plan.remaining; state.rules.restrictedMana = plan.restrictedMana; state.rules.hasteMana = plan.remainingHasteMana; state.rules.fireMana = plan.remainingFireMana; changeLife(state, -plan.life); drawGameCards(state, 1);
    }
    if (op.op === "guide-attack" && value === "yes") {
      if (state.players.self.energy < 3) throw new Error("エネルギーが足りません。");
      state.players.self.energy -= 3;
      queueGameAbility(state, sourceOf(state, ctx) || ctx.snapshot, "攻撃クリーチャーにカウンター2個と飛行", [{ op: "guide-boost" }], { targetSpec: { zone: "battlefield", types: ["Creature"], attacking: true } });
    }
    if (op.op === "cavern-type") { const card = sourceOf(state, ctx); if (card) card.chosenType = value; }
    if (op.op === "imprint-copy" && value !== "no") {
      const spell = ctx.vars.imprintCopy, kicked = value === "kicked", blocked = castBlockReason(state, "exile");
      if (blocked) throw new Error(blocked);
      const plan = planGoldfishPayment(state, { manaCost: goldfishCastingCost(spell, { state, baseCost: "{0}", kicked }) }, { spell });
      if (!plan.payable) throw new Error(plan.reason);
      ctx.vars.copyPlan = plan; ctx.vars.copyKicked = kicked; ctx.vars.castCopy = spell; insertSteps(ctx, [{ op: "copy-target" }]);
    }
    if (op.op === "optional-token" && value === "yes") makeGameToken(state, TOKENS[op.name]);
    if (op.op === "grave-exile" && value === "self") for (const card of [...state.graveyard]) move(state, card.id, "graveyard", "exile");
    if (op.op === "kavu") insertSteps(ctx, value === "loot" ? [discard(1, { remember: "selected" }), { op: "draw-selected" }] : [select("墓地から追放", "graveyard", {}, { destination: "exile" })]);
    if (["ajani-transform", "ral-flip"].includes(op.op) && value === "yes") {
      const source = sourceOf(state, ctx);
      if (source) { const exiled = move(state, source.id, "battlefield", "exile"), back = move(state, exiled.id, "exile", "battlefield"); back.faceIndex = 1; back.lane = "other"; back.counters.loyalty = Number(face(back).loyalty || 0) + (op.op === "ral-flip" ? state.rules.instantSorceryCast || 0 : 0); }
    }
  }
  state.rules.pendingChoice = null; ctx.step++; continueEngineResolution(state);
}
