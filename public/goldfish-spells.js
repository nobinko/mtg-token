import { goldfishCharacteristics, goldfishGraveyardTypes, goldfishKeywords } from "./goldfish-rules.js?v=20261021-public30l";
import { goldfishReference, goldfishFindObject, moveGoldfishRuleObject, goldfishIsLegendary } from "./goldfish-objects.js?v=20261021-public30l";
import { engineSpellProgram, verifiedGoldfishCard } from "./goldfish-card-programs.js?v=20261021-public30l";
import { startEngineResolution, gameColors, damage } from "./goldfish-engine.js?v=20261021-public30l";
import { drawGameCards, cardType, goldfishPlayerTargets } from "./goldfish-events.js?v=20261021-public30l";
import { hasRuleCard } from "./goldfish-constraints.js?v=20261021-public30l";
import { FORMAT_ENTERS } from "./goldfish-format-programs.js?v=20261021-public30l";
import { FORMAT_PERMANENT_NAMES, updateKaito } from "./goldfish-format-permanents.js?v=20261021-public30l";
import { hasAbilityExtension } from "./goldfish-ability-extensions.js?v=20261021-public30l";

const face = (card) => card.faces?.[card.faceIndex || 0] || card;
const front = (card) => card.faces?.[0] || card;
const oracle = (card) => String(face(card).oracleText || "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
const look = (count, mode) => ({ kind: "look", count, mode });
const draw = (count = 1) => ({ kind: "draw", count });
const program = (card, steps, target, label) => ({ id: face(card).name, steps, target, label });
const creature = { zone: "battlefield", types: ["Creature"], label: "クリーチャーを選ぶ" };
const anyTarget = { zone: "battlefield", types: ["Creature", "Planeswalker", "Battle"], players: true, label: "ダメージを与える対象" };

// Each adapter checks the complete, verified spell instruction. Keyword
// actions share commands; arbitrary Oracle prose is never executed as code.
export function goldfishSpellProgram(card) {
  const extended = engineSpellProgram(card); if (extended) return extended;
  if (!card || !/\b(?:Instant|Sorcery)\b/.test(face(card).typeLine || "")) return null;
  const name = face(card).name, text = oracle(card);
  const simple = {
    Preordain: ["Scry 2, then draw a card.", [look(2, "scry"), draw()], "占術2 → 1枚ドロー"],
    Consider: ["Surveil 1. Draw a card.", [look(1, "surveil"), draw()], "諜報1 → 1枚ドロー"],
    Opt: ["Scry 1. Draw a card.", [look(1, "scry"), draw()], "占術1 → 1枚ドロー"],
    "Serum Visions": ["Draw a card. Scry 2.", [draw(), look(2, "scry")], "1枚ドロー → 占術2"],
    Ponder: ["Look at the top three cards of your library, then put them back in any order. You may shuffle. Draw a card.", [look(3, "order"), { kind: "shuffleChoice" }, draw()], "上3枚を並べる → 任意でシャッフル → ドロー"],
    Brainstorm: ["Draw three cards, then put two cards from your hand on top of your library in any order.", [draw(3), { kind: "returnHand", count: 2 }], "3枚ドロー → 手札2枚を山札の上へ"],
    "Expressive Iteration": ["Look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and exile one of them. You may play the exiled card this turn.", [look(3, "iteration")], "上3枚を手札・山札の下・追放へ振り分け"],
    "Sleight of Hand": ["Look at the top two cards of your library. Put one of them into your hand and the other on the bottom of your library.", [look(2, "sleight")], "上2枚から1枚を手札へ、残りを下へ"],
    Manamorphose: ["Add two mana in any combination of colors. Draw a card.", [{ kind: "mana", count: 2 }, draw()], "2色分のマナを選ぶ → 1枚ドロー"]
  };
  const entry = simple[name];
  if (entry && text === entry[0]) return program(card, entry[1], null, entry[2]);
  if (name === "Faithless Looting" && text === "Draw two cards, then discard two cards. Flashback {2}{R}") return { ...program(card, [draw(2), { kind: "returnHand", count: 2, destination: "graveyard" }], null, "2枚ドロー → 手札2枚を捨てる"), flashback: "{2}{R}" };
  if (name === "Otherworldly Gaze" && text === "Surveil 3. Flashback {1}{U}") return { ...program(card, [look(3, "surveil")], null, "諜報3"), flashback: "{1}{U}" };
  if (name === "Lightning Bolt" && text === "Lightning Bolt deals 3 damage to any target.") return program(card, [{ kind: "damage", amount: 3 }], anyTarget, "対象に3点ダメージ");
  if (name === "Lava Dart" && text === "Lava Dart deals 1 damage to any target. Flashback—Sacrifice a Mountain.") return { ...program(card, [{ kind: "damage", amount: 1 }], anyTarget, "対象に1点ダメージ"), flashback: "mountain" };
  if (name === "Unholy Heat" && text === "Unholy Heat deals 2 damage to target creature or planeswalker. Delirium — Unholy Heat deals 6 damage instead if there are four or more card types among cards in your graveyard.") return program(card, [{ kind: "damage", amount: 2, delirium: 6 }], { ...creature, types: ["Creature", "Planeswalker"] }, "対象に2点（昂揚なら6点）");
  if (name === "Mutagenic Growth" && text === "Target creature gets +2/+2 until end of turn.") return program(card, [{ kind: "pump", power: 2, toughness: 2 }], creature, "対象にターン終了まで +2/+2");
  if (name === "Violent Urge" && text === "Target creature gets +1/+0 and gains first strike until end of turn. Delirium — If there are four or more card types among cards in your graveyard, that creature gains double strike until end of turn.") return program(card, [{ kind: "pump", power: 1, toughness: 0, keywords: ["first strike"], deliriumKeywords: ["double strike"] }], creature, "対象に+1/+0・先制攻撃（昂揚なら二段攻撃も）");
  if (name === "Vapor Snag" && text === "Return target creature to its owner's hand. Its controller loses 1 life.") return program(card, [{ kind: "bounce" }, { kind: "life", player: "self", amount: -1 }], creature, "対象を手札へ戻す → コントローラーが1点失う");
  if (name === "Unearth" && text === "Return target creature card with mana value 3 or less from your graveyard to the battlefield. Cycling {2}") return program(card, [{ kind: "reanimate" }], { ...creature, zone: "graveyard", maxManaValue: 3 }, "墓地のマナ総量3以下のクリーチャーを戦場へ");
  if (name === "Persist" && text === "Return target nonlegendary creature card from your graveyard to the battlefield with a -1/-1 counter on it.") return program(card, [{ kind: "reanimate", counter: -1 }], { ...creature, zone: "graveyard", nonlegendary: true }, "墓地から戦場へ、-1/-1カウンター1個");
  if (name === "Reanimate" && text === "Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to that card's mana value.") return program(card, [{ kind: "reanimate", loseManaValue: true }], { ...creature, zone: "graveyard" }, "墓地から戦場へ、マナ総量分のライフを失う");
  return null;
}

export function goldfishManaValue(card) {
  if (card.faceDown) return 0;
  const parts = card.layout === "split" && (!card.cast || card.cast.fuse) ? card.faces : [card.cast || card.layout === "modal_dfc" ? face(card) : front(card)];
  return (parts || [card]).reduce((value, part) => value + (String(part.manaCost || "").match(/\{[^}]+\}/g) || []).reduce((total, symbol) => {
    const part = symbol.slice(1, -1);
    return total + (/^\d+$/.test(part) ? Number(part) : /^[XYZ]$/.test(part) ? card.cast?.x || 0 : /^2\//.test(part) ? 2 : 1);
  }, 0), 0);
}

export function goldfishSpellTargets(state, card, options = card.cast || {}) {
  const target = goldfishSpellProgram(card)?.target;
  if (!target) return [];
  const candidates = (state[target.zone] || []).filter((item) => {
    const data = target.zone === "graveyard" ? front(item) : face(item);
    const type = target.zone === "battlefield" ? cardType(item) : item.faceDown ? "Creature" : data.typeLine || "";
    if (target.types?.length && !target.types.some((name) => new RegExp(`\\b${name}\\b`).test(type))) return false;
    if (target.nonBasic && /\bBasic\b/.test(type)) return false;
    if (target.opposingPermanent) return false;
    if (target.notSubtypes?.some(t => new RegExp(`\\b${t}\\b`).test(type))) return false;
    if (target.nonlegendary && /\bLegendary\b/.test(type)) return false;
    if (target.maxManaValue != null && goldfishManaValue(item) > target.maxManaValue) return false;
    if (target.minManaValue != null && goldfishManaValue(item) < target.minManaValue) return false;
    if (target.manaValue != null && goldfishManaValue(item) !== target.manaValue) return false;
    if (target.notTypes?.some(name => type.split(/[ —]+/).includes(name))) return false;
    if (target.permanent && !/Creature|Artifact|Enchantment|Land|Planeswalker|Battle/.test(type)) return false;
    if (target.maxX && goldfishManaValue(item) > (options.x || 0)) return false;
    if (target.spell && item.kind === "ability") return false;
    if (target.ability && item.kind !== "ability") return false;
    if (target.spellOrTriggered && item.kind === "ability" && item.ability?.activated) return false;
    if (target.colorlessSpell && item.kind !== "ability" && gameColors(item, state).length) return false;
    if (target.monocolored && gameColors(item, state).length !== 1) return false;
    if (target.colorsAny && !gameColors(item, state).some(c => target.colorsAny.includes(c))) return false;
    if (target.notColors && gameColors(item, state).some(c => target.notColors.includes(c))) return false;
    if (target.withoutFlying && goldfishKeywords(state, item).has("flying")) return false;
    if (target.attackingOrBlocking && !state.rules.combat?.attackers?.some(r => r.id === item.id && r.incarnation === item.incarnation)) return false;
    // Shroud disallows our targets too. Opposing permanents are not invented.
    if (target.zone === "battlefield" && goldfishKeywords(state, item).has("shroud")) return false;
    return true;
  }).map((item) => ({ ref: goldfishReference(item, target.zone), label: item.name, card: item }));
  if (target.players) candidates.unshift(...goldfishPlayerTargets(state).map(t => ({ ...t, label: `${t.label} — ライフ ${state.players[t.ref.player].life}` })));
  if (target.opponentOnly) candidates.unshift({ ref: { player: "opponent" }, label: `相手 — ライフ ${state.players.opponent.life}` });
  if (target.virtualOpponent && !target.players && !(hasRuleCard(state, "Mycosynth Lattice") && (target.monocolored || target.colorsAny))) candidates.unshift({ ref: { player: "opponent", virtual: true }, label: "相手の対象へ解決（相手側の領域は省略）" });
  return candidates;
}

export const sameGoldfishTarget = (a, b) => a?.player ? a.player === b?.player : a?.id === b?.id && (a?.zone || "battlefield") === (b?.zone || "battlefield") && a?.incarnation === b?.incarnation;
export function validateGoldfishSpellTarget(state, card, target, options) {
  if (!goldfishSpellProgram(card)?.target) return;
  if (!goldfishSpellTargets(state, card, options).some((option) => sameGoldfishTarget(option.ref, target))) throw new Error("この呪文の適正な対象を選んでください。");
}

function drawCards(state, count) {
  drawGameCards(state, count);
}

export function applyGoldfishStateActions(state) {
  for (const card of state.battlefield) updateKaito(state, card);
  // Auras with no legal attachment go to the graveyard; the newest Role a
  // player controls on one permanent replaces that player's older Roles.
  for (const card of [...state.battlefield]) if (/\bAura\b/.test(face(card).typeLine || "") && !card.summonedAsBestow) {
    const attached = goldfishFindObject(state, card.attachedTo);
    const roles = state.battlefield.filter(c => /\bRole\b/.test(face(c).typeLine || "") && c.attachedTo && card.attachedTo && sameGoldfishTarget(c.attachedTo, card.attachedTo));
    if (!attached || /\bRole\b/.test(face(card).typeLine || "") && roles.at(-1)?.id !== card.id) moveGoldfishRuleObject(state, card.id, "battlefield", "graveyard");
  }
  for (const c of state.battlefield) if (face(c).name === "Extinguisher Battleship" && verifiedGoldfishCard(c)) {
    const creature = (c.counters.charge || 0) >= 5;
    if (creature && !c.stationed) { c.originalTypeLine ||= c.typeLine; c.typeLine += " Creature"; c.stationed = true; c.lane = "creature"; }
    else if (!creature && c.stationed) { c.typeLine = c.originalTypeLine; delete c.originalTypeLine; delete c.stationed; c.lane = "other"; }
  }
  if (!state.rules.pendingChoice) {
    const groups = new Map();
    for (const card of state.battlefield.filter(c => goldfishIsLegendary(state, c))) { const group = groups.get(face(card).name) || []; group.push(card.id); groups.set(face(card).name, group); }
    for (const [name, ids] of groups) if (ids.length > 1) { state.rules.pendingChoice = { type: "engine-legend", sourceName: name, ids }; break; }
  }
  // Repeat for dependent toughness changes (e.g. delirium gained/lost).
  for (let pass = 0; pass < 100; pass += 1) {
    const dying = state.battlefield.filter((card) => {
      const plus = card.counters["+1/+1"] || 0, minus = card.counters["-1/-1"] || 0, paired = Math.min(plus, minus);
      if (paired > 0) { card.counters["+1/+1"] -= paired; card.counters["-1/-1"] -= paired; }
      if (/\bPlaneswalker\b/.test(face(card).typeLine || "") && (card.counters.loyalty || 0) === 0) return true;
      if (face(card).name === "Urza's Saga" && state.battlefield.some(c => face(c).name === "Blood Moon" && !c.faceDown && c.automaticAbilities !== false) && !state.stack.some(e => e.ability?.source?.id === card.id && /第/.test(e.ability.label || ""))) return true;
      if (!/\bCreature\b/.test(card.faceDown ? "Creature" : face(card).typeLine || "")) return false;
      const toughness = Number(goldfishCharacteristics(state, card).toughness);
      if (!Number.isFinite(toughness) || goldfishCharacteristics(state, card).toughness === "") return false;
      const indestructible = goldfishKeywords(state, card).has("indestructible");
      if (toughness > 0 && !indestructible && (card.damage || 0) >= toughness && card.regeneration) { card.regeneration--; card.damage = 0; card.tapped = true; return false; }
      return toughness <= 0 || (!indestructible && (card.damage || 0) >= toughness);
    });
    if (!dying.length) break;
    for (const card of dying) moveGoldfishRuleObject(state, card.id, "battlefield", "graveyard");
    state.rules.lastAction += ` ${dying.map((card) => card.name).join("、")}は墓地へ。`;
  }
}

function finishSpell(state) {
  const resolution = state.rules.resolution;
  moveGoldfishRuleObject(state, resolution.entryId, "stack", "graveyard");
  state.rules.pendingChoice = null;
  state.rules.resolution = null;
  state.rules.lastAction = `${resolution.sourceName}：${resolution.messages.join(" → ") || "解決"}。`;
  applyGoldfishStateActions(state);
}

export function startGoldfishSpellResolution(state) {
  const spell = state.stack.at(-1);
  if (startEngineResolution(state, spell)) return;
  const definition = goldfishSpellProgram(spell);
  if (!definition) throw new Error("この呪文の本文は手動処理です。");
  if (definition.target && !goldfishSpellTargets(state, spell).some(({ ref }) => sameGoldfishTarget(ref, spell.cast?.target))) {
    const name = spell.name;
    moveGoldfishRuleObject(state, spell.id, "stack", "graveyard");
    state.rules.lastAction = `${name}：対象が不適正になったため、解決せず終了しました。`;
    return;
  }
  state.rules.resolution = { entryId: spell.id, sourceName: spell.name, steps: structuredClone(definition.steps), step: 0, target: structuredClone(spell.cast?.target || null), messages: [] };
  continueGoldfishSpellResolution(state);
}

export function continueGoldfishSpellResolution(state) {
  const resolution = state.rules.resolution;
  const entry = state.stack.at(-1);
  if (!resolution || entry?.id !== resolution.entryId) throw new Error("解決中の呪文が一致しません。");
  while (!state.rules.pendingChoice && resolution.step < resolution.steps.length) {
    const operation = resolution.steps[resolution.step];
    const choice = (type, data) => { state.rules.pendingChoice = { type, entryId: entry.id, sourceName: resolution.sourceName, ...data }; };
    if (operation.kind === "draw") { drawCards(state, operation.count); resolution.messages.push(`${operation.count}枚ドロー${state.rules.emptyDraw ? "（山札切れ）" : ""}`); }
    else if (operation.kind === "look") {
      const cards = state.library.slice(-operation.count).toReversed();
      if (cards.length) { choice("spell-arrange", { mode: operation.mode, zone: "library", cardIds: cards.map((card) => card.id) }); return; }
    } else if (operation.kind === "returnHand") {
      const count = Math.min(operation.count, state.hand.length);
      if (count) { choice("spell-return", { count, destination: operation.destination || "libraryTop", cardIds: state.hand.map((card) => card.id) }); return; }
    } else if (operation.kind === "shuffleChoice") { choice("spell-shuffle", {}); return; }
    else if (operation.kind === "mana") { choice("spell-mana", { count: operation.count }); return; }
    else {
      const target = resolution.target?.player ? null : goldfishFindObject(state, resolution.target);
      if (operation.kind === "damage") {
        const amount = operation.delirium && goldfishGraveyardTypes(state).length >= 4 ? operation.delirium : operation.amount;
        if (resolution.target?.player) damage(state, resolution.target, amount);
        else if (target) {
          if (/\bCreature\b/.test(target.faceDown ? "Creature" : face(target).typeLine || "")) target.damage = (target.damage || 0) + amount;
          else {
            const counter = /\bPlaneswalker\b/.test(face(target).typeLine || "") ? "loyalty" : "defense";
            if (!Number.isFinite(target.counters?.[counter])) throw new Error(`${target.name}の${counter === "loyalty" ? "忠誠" : "守備"}カウンターを詳細操作で設定してください。`);
            target.counters[counter] = Math.max(0, target.counters[counter] - amount);
            if (counter === "loyalty" && target.counters[counter] === 0) moveGoldfishRuleObject(state, target.id, "battlefield", "graveyard");
          }
        }
        resolution.messages.push(`${amount}点ダメージ`);
      } else if (operation.kind === "pump" && target) {
        target.temporaryEffects.push({ power: operation.power, toughness: operation.toughness, turn: state.turn, label: resolution.sourceName, keywords: [...(operation.keywords || []), ...(goldfishGraveyardTypes(state).length >= 4 ? operation.deliriumKeywords || [] : [])] });
        resolution.messages.push(`+${operation.power}/+${operation.toughness}（ターン終了まで）`);
      } else if (operation.kind === "bounce" && target) { moveGoldfishRuleObject(state, target.id, "battlefield", "hand"); resolution.messages.push("対象を手札へ"); }
      else if (operation.kind === "life") state.players[operation.player].life += operation.amount;
      else if (operation.kind === "reanimate" && target) {
        const value = goldfishManaValue(target);
        const returned = moveGoldfishRuleObject(state, target.id, "graveyard", "battlefield");
        returned.lane = "creature";
        if (operation.counter) returned.counters["-1/-1"] = 1;
        if (operation.loseManaValue) state.players.self.life -= value;
        // ETB adapters are dispatched by the engine after this spell finishes.
        resolution.messages.push(`${target.name}を戦場へ${operation.loseManaValue ? `、ライフ-${value}` : ""}`);
      }
      state.life = state.players.self.life;
    }
    resolution.step += 1;
  }
  if (!state.rules.pendingChoice) finishSpell(state);
}

export function chooseGoldfishSpellResolution(state, answer, random = Math.random) {
  const choice = state.rules.pendingChoice, resolution = state.rules.resolution;
  if (!choice || !resolution || choice.entryId !== resolution.entryId || state.stack.at(-1)?.id !== resolution.entryId) throw new Error("解決中の選択が一致しません。");
  if (choice.type === "spell-arrange") {
    const allocation = answer.allocation;
    const allowed = choice.mode === "scry" ? ["top", "bottom"] : choice.mode === "surveil" ? ["top", "graveyard"] : choice.mode === "iteration" ? ["hand", "bottom", "exile"] : choice.mode === "sleight" ? ["hand", "bottom"] : ["top"];
    if (!Array.isArray(allocation) || allocation.length !== choice.cardIds.length || new Set(allocation.map((row) => row.id)).size !== choice.cardIds.length || allocation.some((row) => !choice.cardIds.includes(row.id) || !allowed.includes(row.destination))) throw new Error("見たカードをすべて一度ずつ振り分けてください。");
    const actual = state.library.slice(-choice.cardIds.length).map((card) => card.id);
    if (choice.cardIds.some((id) => !actual.includes(id))) throw new Error("確認中に山札が変更されています。");
    const count = (destination) => allocation.filter((row) => row.destination === destination).length;
    if (["iteration", "sleight"].includes(choice.mode) && (count("hand") !== 1 || count("bottom") !== Math.min(1, choice.cardIds.length - 1) || count("exile") !== Math.max(0, choice.cardIds.length - 2))) throw new Error("手札1枚、残りを山札の下と追放へ1枚ずつ選んでください。");
    // The displayed order is top-first, including order within the bottom pile.
    const originals = new Map(state.library.map((card) => [card.id, card]));
    const top = allocation.filter((row) => row.destination === "top").map((row) => originals.get(row.id));
    const bottom = allocation.filter((row) => row.destination === "bottom").map((row) => originals.get(row.id));
    for (const row of allocation.filter((row) => ["hand", "graveyard", "exile"].includes(row.destination))) {
      const card = moveGoldfishRuleObject(state, row.id, "library", row.destination);
      if (row.destination === "exile") card.playPermission = { turn: state.turn, serial: state.rules.turnSerial, source: resolution.sourceName };
    }
    state.library = state.library.filter((card) => !top.some((item) => item.id === card.id) && !bottom.some((item) => item.id === card.id));
    state.library.unshift(...bottom.toReversed());
    state.library.push(...top.toReversed());
    resolution.messages.push(choice.mode === "scry" ? "占術" : choice.mode === "surveil" ? "諜報" : "振り分け");
  } else if (choice.type === "spell-return") {
    const ids = answer.ids;
    if (!Array.isArray(ids) || ids.length !== choice.count || new Set(ids).size !== ids.length || ids.some((id) => !choice.cardIds.includes(id) || !state.hand.some((card) => card.id === id))) throw new Error(`手札から${choice.count}枚を、次に引く順に選んでください。`);
    if (choice.destination === "graveyard" && ids.some((id) => /\bMadness\b/i.test(state.hand.find((card) => card.id === id).oracleText || ""))) throw new Error("マッドネスを持つカードの捨てる処理は、本文の操作で確認してください。");
    for (const id of ids.toReversed()) moveGoldfishRuleObject(state, id, "hand", choice.destination || "libraryTop");
    resolution.messages.push(`手札${choice.count}枚を${choice.destination === "graveyard" ? "捨てました" : "山札の上へ"}`);
  } else if (choice.type === "spell-shuffle") {
    if (typeof answer.shuffle !== "boolean") throw new Error("シャッフルするか選んでください。");
    if (answer.shuffle) for (let index = state.library.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.max(0, Math.min(.999999999, random())) * (index + 1));
      [state.library[index], state.library[target]] = [state.library[target], state.library[index]];
    }
    resolution.messages.push(answer.shuffle ? "シャッフル" : "並び順を維持");
  } else if (choice.type === "spell-mana") {
    if (!Array.isArray(answer.colors) || answer.colors.length !== choice.count || answer.colors.some((color) => !["W", "U", "B", "R", "G"].includes(color))) throw new Error(`${choice.count}マナの色を選んでください。`);
    for (const color of answer.colors) state.manaPool[color] += 1;
    resolution.messages.push(`${answer.colors.join("・")}を加える`);
  } else throw new Error("未対応の呪文選択です。");
  state.rules.pendingChoice = null;
  resolution.step += 1;
  continueGoldfishSpellResolution(state);
}

export function canGoldfishAutoResolve(card) {
  if (hasAbilityExtension(card)) return true;
  if (goldfishSpellProgram(card)) return true;
  const type = face(card).typeLine || "";
  if (verifiedGoldfishCard(card) && FORMAT_ENTERS[face(card).name] && !/\bAura\b/.test(type)) return true;
  if (verifiedGoldfishCard(card) && (FORMAT_PERMANENT_NAMES.has(face(card).name) || ["Superior Spider-Man", "Mockingbird"].includes(face(card).name)) && !/\bAura\b/.test(type)) return true;
  if (verifiedGoldfishCard(card) && ["Eddymurk Crab", "Vibrance", "Deceit"].includes(face(card).name)) return true;
  if (verifiedGoldfishCard(card) && ["Pithing Needle", "Disruptor Flute", "Chalice of the Void", "The Legend of Roku", "Weapons Manufacturing", "Thought-Knot Seer", "Kraul Harpooner"].includes(face(card).name)) return true;
  if (verifiedGoldfishCard(card) && (/\bPlaneswalker\b/.test(type) || ["Murktide Regent", "Moonshadow", "Engineered Explosives", "Pompous Battlemage", "Stormchaser's Talent", "Artist's Talent", "Isochron Scepter", "Ranger-Captain of Eos", "Seasoned Pyromancer", "Badgermole Cub", "Formidable Speaker"].includes(face(card).name))) return true;
  // Permanents without a resolution choice may enter. Their triggered abilities
  // are handled separately, including explicit manual stops for unknown ETBs.
  return /\b(Creature|Artifact|Enchantment)\b/.test(type) && !/\b(Aura|as [^.]* enters|enters[^.]* (?:with|tapped|as)|choose a|devour|sunburst|converge|modular|graft)\b/i.test(`${type} ${oracle(card)}`);
}
