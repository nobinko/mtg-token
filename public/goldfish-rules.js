// Deterministic rules adapters. These functions mutate only a caller-owned draft;
// goldfish.js supplies immutable transitions, history and zone operations.
// No network, DOM, timers or inferred execution of arbitrary Oracle text here.
import { goldfishCardActions, goldfishEquipmentBonus, goldfishCanEquip } from "./goldfish-action-definitions.js?v=20261021-public30l";
import { engineEnter, engineCast, engineAttack, engineStatAdjustments, engineKeywords, startEngineResolution, engineUpkeep } from "./goldfish-engine.js?v=20261021-public30l";
import { verifiedGoldfishCard, ENGINE_RULE_NOTES, engineSpellProgram } from "./goldfish-card-programs.js?v=20261021-public30l";
import { drawGameCards, emitGameEvent } from "./goldfish-events.js?v=20261021-public30l";
import { moveGoldfishRuleObject } from "./goldfish-objects.js?v=20261021-public30l";
import { ABILITY_EXTENSION_NOTES, duplicateEnterAbilities, recordGoldfishTargets } from "./goldfish-ability-extensions.js?v=20261021-public30l";
const face = (card) => card.faces?.[card.faceIndex || 0] || card;
const textOf = (card) => String(face(card).oracleText || "");
const typeOf = (card) => String(face(card).typeLine || "").split(" // ")[0];
const withoutReminder = (text) => text.replace(/\([^)]*\)/g, "").trim();
const reference = (card) => ({ id: card.id, incarnation: card.incarnation || 0 });
const permanent = (state, ref) => state.battlefield.find((card) => card.id === ref?.id && (card.incarnation || 0) === ref.incarnation);
const integer = (value, fallback = 0) => Number.isInteger(value) && value >= 0 && value <= 1000000 ? value : fallback;

export function freshGoldfishRules() {
  return { version: 1, nextEventId: 1, spellsCast: 0, castCountKnown: true, landsPlayed: 0, pendingChoice: null, resolution: null, activePlayer: "self", turnSerial: 1, delayedDraws: [], combat: null, lastAction: "" };
}

export function cloneGoldfishRules(state) {
  const rules = state.rules;
  if (!rules) return { ...freshGoldfishRules(), landsPlayed: state.phase === "playing" ? null : 0, castCountKnown: state.phase !== "playing" };
  return { ...structuredClone(rules), activePlayer: rules.activePlayer || "self", turnSerial: rules.turnSerial || Math.max(1, state.turn * 2 - 1), delayedDraws: structuredClone(rules.delayedDraws || []), version: 1, nextEventId: integer(rules.nextEventId, 1),
    spellsCast: integer(rules.spellsCast), landsPlayed: Number.isInteger(rules.landsPlayed) ? integer(rules.landsPlayed) : null, castCountKnown: rules.castCountKnown !== false };
}

export function assertGoldfishChoiceComplete(state) {
  if (state.rules?.pendingChoice) throw new Error("解決中の選択を終えてください。やり直すときは「戻す」を使えます。");
}

function prowessCount(card) {
  if (!/\bCreature\b/.test(typeOf(card))) return 0;
  // Only an actual keyword on its own keyword line; not "tokens with prowess"
  // or an ability which grants prowess to a different object.
  return withoutReminder(textOf(card)).split("\n").flatMap((line) => line.split(","))
    .filter((word) => /^prowess$/i.test(word.trim())).length;
}

function isChanneler(card) {
  return face(card).name === "Dragon's Rage Channeler" && /Whenever you cast a noncreature spell, surveil 1\./.test(textOf(card));
}

function isCutter(card) {
  return face(card).name === "Cori-Steel Cutter" && /Whenever you cast your second spell each turn, create a 1\/1 white Monk creature token with prowess\./.test(textOf(card));
}

function isSlickshot(card) {
  return face(card).name === "Slickshot Show-Off" && /Whenever you cast a noncreature spell, (?:this creature|Slickshot Show-Off) gets \+2\/\+0 until end of turn\./.test(textOf(card));
}

export function isGoldfishBauble(card) {
  return card && !card.faceDown && card.automaticAbilities !== false && face(card).name === "Mishra's Bauble" && /^\{T\}, Sacrifice (?:this artifact|Mishra's Bauble): Look at the top card of target player's library\. Draw a card at the beginning of the next turn's upkeep\.$/.test(textOf(card));
}

export function goldfishKeywords(state, card) {
  const result = new Set();
  if (card.suppressedKeywords) return result;
  for (const keyword of engineKeywords(state, card)) result.add(keyword);
  if (!card.faceDown && card.automaticAbilities !== false) {
    const lines = withoutReminder(textOf(card)).toLowerCase().split("\n");
    for (const name of ["haste", "vigilance", "first strike", "double strike", "lifelink", "infect", "defender", "flying", "trample", "shroud", "hexproof", "indestructible", "deathtouch", "reach"]) {
      if (lines.some((line) => line.split(",").some((word) => word.trim() === name))) result.add(name);
    }
  }
  for (const effect of card.temporaryEffects || []) if (effect.turn === state.turn) for (const keyword of effect.keywords || []) result.add(keyword);
  for (const equipment of state.battlefield) if (permanent(state, equipment.attachedTo)?.id === card.id) for (const keyword of goldfishEquipmentBonus(equipment).keywords) result.add(keyword);
  return result;
}

export function goldfishRuleCoverage(card) {
  const automatic = [];
  if (verifiedGoldfishCard(card) && ABILITY_EXTENSION_NOTES[face(card).name]) automatic.push(ABILITY_EXTENSION_NOTES[face(card).name]);
  if (verifiedGoldfishCard(card) && ENGINE_RULE_NOTES[face(card).name]) automatic.push(ENGINE_RULE_NOTES[face(card).name]);
  if (engineSpellProgram(card)) automatic.push("対象・モードを選び、カードの効果を順に解決");
  if (prowessCount(card)) automatic.push("果敢：ターン終了まで +1/+1");
  if (isChanneler(card)) automatic.push("非クリーチャー呪文 → 諜報1", "昂揚：墓地のタイプ4種で +2/+2・飛行");
  if (isCutter(card)) automatic.push("2つ目の呪文 → モンク生成・任意で装着", "装着中の +1/+1・トランプル・速攻");
  if (isSlickshot(card)) automatic.push("非クリーチャー呪文 → ターン終了まで +2/+0");
  if (isGoldfishBauble(card)) automatic.push("生け贄 → 山札を見る → 次のターンのアップキープに1枚ドロー");
  automatic.push(...goldfishCardActions(card).map((action) => action.label));
  const equipment = goldfishEquipmentBonus(card);
  if (!isCutter(card) && (equipment.power || equipment.toughness || equipment.keywords.length)) automatic.push(`装着中の修整 ${equipment.power >= 0 ? "+" : ""}${equipment.power}/${equipment.toughness >= 0 ? "+" : ""}${equipment.toughness} ${equipment.keywords.join("・")}`);
  return { automatic, manual: "記載以外の効果・起動型能力・置換効果は本文の操作で処理" };
}

function makeAbility(state, source, batch, rule, label, text, extra = {}) {
  return { id: `ability-${state.rules.nextEventId++}`, kind: "ability", name: face(source).name || source.name,
    imageUrl: face(source).imageUrl || source.imageUrl || "", oracleText: text,
    ability: { rule, label, source: reference(source), batch, ...extra } };
}

export function recordGoldfishActivation(state, card, action, target) {
  state.stack.push(makeAbility(state, card, state.rules.nextEventId, ["land-draw", "cycling"].includes(action.id) ? "draw" : action.id,
    action.label, action.description, { target: target ? { ...target } : null }));
}

export function recordGoldfishBauble(state, card, player) {
  state.stack.push(makeAbility(state, card, state.rules.nextEventId, "bauble", "山札を見る・次のターンにドロー", textOf(card), { player }));
}

export function recordGoldfishUpkeep(state) {
  engineUpkeep(state);
  const due = (state.rules.delayedDraws || []).filter((item) => item.serial <= state.rules.turnSerial);
  state.rules.delayedDraws = (state.rules.delayedDraws || []).filter((item) => item.serial > state.rules.turnSerial);
  for (const item of due) state.stack.push(makeAbility(state, item.source, state.rules.nextEventId, "draw", "アップキープ：1枚ドロー", "カードを1枚引く。"));
}

export function recordGoldfishAttack(state, card, damage = false) {
  if (card.faceDown || card.automaticAbilities === false) return;
  if (engineAttack(state, card, damage)) return;
  const self = String(face(card).name || card.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^Whenever (?:this creature|${self}) ${damage ? "deals combat damage to" : "attacks\\b"}`);
  for (const paragraph of withoutReminder(textOf(card)).split("\n").map((line) => line.trim())) {
    if (!pattern.test(paragraph)) continue;
    const draw = damage && face(card).name === "Psychic Frog" && paragraph === "Whenever this creature deals combat damage to a player or planeswalker, draw a card.";
    state.stack.push(makeAbility(state, card, state.rules.nextEventId, draw ? "draw" : "manual", draw ? "戦闘ダメージ：1枚ドロー" : "戦闘の誘発を確認", paragraph));
  }
}

export function recordGoldfishEnter(state, card) {
  const start = state.stack.length;
  recordEnter(state, card);
  duplicateEnterAbilities(state, start, card);
}
function recordEnter(state, card) {
  if (card.faceDown || card.automaticAbilities === false) return;
  if (engineEnter(state, card)) return;
  const self = String(face(card).name || card.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^When (?:${self}|this (?:land|creature|artifact|enchantment|permanent)) enters(?: the battlefield)?, (.+)$`);
  const triggers = [];
  for (const paragraph of withoutReminder(textOf(card)).split("\n").map((line) => line.trim())) {
    const match = paragraph.match(pattern);
    if (!match) continue;
    const surveil = match[1] === "surveil 1.";
    triggers.push(makeAbility(state, card, state.rules.nextEventId, surveil ? "surveil" : "manual", surveil ? "諜報1" : "出たときの能力を確認", paragraph));
  }
  state.stack.push(...triggers.toReversed());
  if (triggers.length > 1) state.rules.pendingChoice = { type: "order", entryIds: triggers.map((entry) => entry.id) };
}

export function recordGoldfishCast(state, spell) {
  const rules = state.rules;
  if (!rules.castCountKnown) throw new Error("このターンにすでに唱えた回数を設定してください。旧保存データには回数がありません。");
  rules.spellsCast += 1;
  const firstTrigger = state.stack.length;
  engineCast(state, spell);
  recordGoldfishTargets(state, [spell.cast?.target, ...(spell.cast?.targets || []), ...(spell.cast?.modeTargets || [])]);
  const batch = rules.nextEventId++;
  const noncreature = !/\bCreature\b/.test(typeOf(spell));
  const triggers = [];
  for (const card of state.battlefield) {
    if (card.faceDown || card.automaticAbilities === false) continue;
    const add = (rule, label, text, extra) => triggers.push(makeAbility(state, card, batch, rule, label, text, extra));
    if (noncreature) {
      for (let index = 0; index < prowessCount(card); index += 1) add("boost", "果敢 +1/+1", "ターン終了まで +1/+1", { power: 1, toughness: 1 });
      if (isChanneler(card)) add("surveil", "諜報1", "山札の一番上を見て、上に残すか墓地へ置く。");
      if (isSlickshot(card)) add("boost", "+2/+0", "ターン終了まで +2/+0", { power: 2, toughness: 0 });
    }
    if (isCutter(card) && rules.spellsCast === 2) add("cutter", "モンクを生成", "白の1/1・果敢のモンクを生成。その後、任意でこの装備品を装着する。");
    // Preserve an explicit manual stop for unimplemented cast-trigger paragraphs.
    // Do not claim to interpret their condition or execute their effect.
    for (const paragraph of withoutReminder(textOf(card)).split("\n").map((line) => line.trim()).filter(Boolean)) {
      if (!/\b(?:When|Whenever) you cast\b/.test(paragraph)) continue;
      // A self cast trigger belongs to the spell on the stack. It must never
      // trigger again when another spell is cast after this permanent resolves.
      if (/^When you cast this spell\b/.test(paragraph)) continue;
      if (verifiedGoldfishCard(card) && ["Great Hall of the Biblioplex", "Death to Our Enemies", "The Fantasticar", "Colorstorm Stallion", "Ral, Crackling Wit", "Song of Creation", "Glaring Fleshraker", "Pinnacle Emissary", "Stormchaser's Talent", "Artist's Talent", "Ugin, Eye of the Storms", "Ral, Monsoon Mage", "Vexing Bauble"].includes(face(card).name)) continue;
      if (isChanneler(card) && paragraph.startsWith("Whenever you cast a noncreature spell, surveil 1.")) continue;
      if (isCutter(card) && paragraph.includes("Whenever you cast your second spell each turn,")) continue;
      if (isSlickshot(card) && paragraph.startsWith("Whenever you cast a noncreature spell,")) continue;
      if (/noncreature spell/.test(paragraph) && !noncreature) continue;
      if (/instant or sorcery spell/.test(paragraph) && !/\b(Instant|Sorcery)\b/.test(typeOf(spell))) continue;
      add("manual", "誘発条件・効果を確認", paragraph);
    }
  }
  state.stack.push(...triggers.toReversed());
  // The player orders simultaneous abilities before anyone receives priority.
  const simultaneous = state.stack.slice(firstTrigger).toReversed();
  if (rules.automation) (rules.waitingCastTriggers ||= []).push(...state.stack.splice(firstTrigger));
  else if (simultaneous.length > 1) rules.pendingChoice = { type: "order", entryIds: simultaneous.map((entry) => entry.id) };
  rules.lastAction = `${spell.name} を唱えました（このターン ${rules.spellsCast} 回目）。誘発 ${simultaneous.length} 件。`;
}

function finishAbility(state, message) {
  state.stack.pop();
  if (state.rules.pendingChoice?.type !== "engine-draw") state.rules.pendingChoice = null;
  state.rules.lastAction = message;
}

export function resolveGoldfishAbilityDraft(state) {
  assertGoldfishChoiceComplete(state);
  const entry = state.stack.at(-1);
  if (entry?.kind !== "ability") throw new Error("一番上は誘発型能力ではありません。");
  const ability = entry.ability;
  const source = permanent(state, ability.source);
  if (ability.rule === "engine") { startEngineResolution(state, entry); return; }
  if (ability.rule === "bauble") {
    state.rules.delayedDraws.push({ serial: state.rules.turnSerial + 1, source: { id: entry.ability.source.id, incarnation: entry.ability.source.incarnation, name: entry.name } });
    state.rules.pendingChoice = { type: "bauble-look", entryId: entry.id, sourceName: entry.name, player: ability.player, cardId: ability.player === "self" ? state.library.at(-1)?.id : null };
  } else if (ability.rule === "draw") {
    const count = drawGameCards(state, 1);
    finishAbility(state, `${entry.name}：${count}枚ドローしました。`);
  } else if (ability.rule === "equip") {
    const target = permanent(state, ability.target);
    if (goldfishCanEquip(state, source, target)) {
      source.attachedTo = reference(target);
      finishAbility(state, `${entry.name} を ${target.name} に装備しました。`);
    } else finishAbility(state, `${entry.name}：装備品または対象が不適正なため、装着先は変わりません。`);
  } else if (ability.rule === "frog-counter" || ability.rule === "frog-flying") {
    if (source) {
      if (ability.rule === "frog-counter") source.counters["+1/+1"] = (source.counters["+1/+1"] || 0) + 1;
      else source.temporaryEffects.push({ power: 0, toughness: 0, keywords: ["flying"], turn: state.turn, label: "飛行" });
    }
    finishAbility(state, source ? `${entry.name}：${ability.rule === "frog-counter" ? "+1/+1カウンターを1個置きました" : "ターン終了まで飛行を得ました"}。` : `${entry.name} は戦場を離れているため効果は適用されません。`);
  } else if (ability.rule === "boost") {
    if (source) source.temporaryEffects.push({ power: ability.power, toughness: ability.toughness, turn: state.turn, label: ability.label });
    finishAbility(state, source ? `${entry.name}：${ability.label}（ターン終了まで）` : `${entry.name} は戦場を離れているため、強化は適用されません。`);
  } else if (ability.rule === "surveil") {
    const top = state.library.at(-1);
    if (!top) finishAbility(state, `${entry.name}：山札が空のため諜報1を終了。`);
    else state.rules.pendingChoice = { type: "surveil", entryId: entry.id, cardId: top.id, sourceName: entry.name };
  } else if (ability.rule === "cutter") {
    // No priority between creation and the optional attachment. Keep this entry
    // on the stack until the choice completes, including across save/restore.
    const token = { id: `extra-${state.nextId++}`, kind: "token", name: "Monk", typeLine: "Token Creature — Monk", colors: ["W"],
      power: "1", toughness: "1", oracleText: "Prowess", manaCost: "", imageUrl: "", faces: [], faceIndex: 0,
      faceDown: false, tapped: false, lane: "creature", counters: {}, powerOverride: "", toughnessOverride: "", note: "", groupId: "",
      incarnation: 0, enteredTurn: state.turn, temporaryEffects: [], attachedTo: null };
    state.battlefield.push(token);
    token.enteredSerial = state.rules.turnSerial;
    emitGameEvent(state, { kind: "move", from: "creation", to: "battlefield", card: token, original: token });
    if (source && !source.faceDown && /\bEquipment\b/.test(typeOf(source)) && !/\bCreature\b/.test(typeOf(source))) {
      state.rules.pendingChoice = { type: "attach", entryId: entry.id, source: ability.source, token: reference(token), sourceName: entry.name };
    } else finishAbility(state, "果敢を持つ白の1/1モンクを生成。装備品がないため装着は行いません。");
  } else {
    state.rules.pendingChoice = { type: "manual", entryId: entry.id, sourceName: entry.name, text: entry.oracleText };
  }
}

export function chooseGoldfishRuleDraft(state, answer) {
  const choice = state.rules.pendingChoice;
  if (!choice) throw new Error("選択待ちの処理がありません。");
  if (choice.type === "order") {
    const ids = answer.order;
    if (!Array.isArray(ids) || ids.length !== choice.entryIds.length || new Set(ids).size !== ids.length || ids.some((id) => !choice.entryIds.includes(id))) throw new Error("すべての誘発を一度ずつ並べてください。");
    const entries = new Map(state.stack.map((entry) => [entry.id, entry]));
    if (ids.some((id) => !entries.has(id))) throw new Error("並べる誘発が見つかりません。");
    state.stack = [...state.stack.filter((entry) => !ids.includes(entry.id)), ...ids.toReversed().map((id) => entries.get(id))];
    state.rules.pendingChoice = null;
    state.rules.lastAction = "誘発の解決順を設定しました。";
    return;
  }
  const entry = state.stack.at(-1);
  if (entry?.id !== choice.entryId) throw new Error("解決中の誘発が一致しません。");
  if (choice.type === "bauble-look") {
    if (answer.acknowledge !== true) throw new Error("確認したら進んでください。");
    finishAbility(state, `${choice.sourceName}：確認を終了。次のターンのアップキープに1枚引きます。`);
  } else if (choice.type === "surveil") {
    if (!["top", "graveyard"].includes(answer.destination)) throw new Error("山札の上に残すか、墓地へ置いてください。");
    if (state.library.at(-1)?.id !== choice.cardId) throw new Error("諜報中に山札が変更されています。戻す操作で確認してください。");
    if (answer.destination === "graveyard") {
      moveGoldfishRuleObject(state, state.library.at(-1).id, "library", "graveyard");
    }
    finishAbility(state, `${choice.sourceName}：諜報1 → ${answer.destination === "top" ? "山札の上に残しました" : "墓地へ置きました"}。`);
  } else if (choice.type === "attach") {
    if (typeof answer.attach !== "boolean") throw new Error("装着するか選んでください。");
    const equipment = permanent(state, choice.source);
    const token = permanent(state, choice.token);
    if (answer.attach && equipment && token) equipment.attachedTo = reference(token);
    finishAbility(state, answer.attach && equipment && token ? "モンクを生成し、コーリ鋼を装着しました（2/2・果敢・トランプル・速攻）。" : "果敢を持つ白の1/1モンクを生成。装着はしません。" );
  } else if (choice.type === "manual") {
    if (answer.acknowledge !== true) throw new Error("本文を確認してください。");
    finishAbility(state, `${choice.sourceName}：手動処理へ引き継ぎました。盤面の操作で反映してください。`);
  } else throw new Error("未対応の選択です。戻す操作で確認してください。");
}

export function resetGoldfishTurnRules(state) {
  state.rules.restrictedMana = [];
  state.rules.hasteMana = 0;
  state.rules.encampments = [];
  state.rules.previousSpellsCast = state.rules.spellsCast;
  state.rules.previousActiveSpells = state.rules.activePlayer === "self" ? state.rules.spellsCast : state.rules.opponentSpellsCast || 0;
  state.rules.opponentSpellsCast = 0;
  state.rules.artifactsSacrificed = 0;
  state.rules.permanentsSacrificed = 0;
  state.rules.firstFlyingCreature = false;
  state.rules.instantSorceryCast = 0;
  state.rules.lifeGained = 0;
  state.rules.lifeLost = 0;
  state.rules.opponentLifeLost = 0;
  state.rules.cardsDrawn = 0;
  state.rules.permanentLeft = false;
  state.rules.nonlandLeft = false;
  state.rules.warpCast = false;
  state.rules.noncreatureCast = 0;
  state.rules.endStepStarted = false;
  state.rules.extraCombats = 0;
  state.rules.beginCombatStarted = false;
  state.rules.offeredCrewIds = [];
  for (const c of state.battlefield) if (c.suppressedKeywords && !c.suppressedBy) { c.automaticAbilities = c.lostAbilitiesOriginal; delete c.lostAbilitiesOriginal; delete c.suppressedKeywords; }
  state.rules.fireMana = 0;
  state.rules.spellsCast = 0;
  state.rules.castCountKnown = true;
  state.rules.landsPlayed = 0;
  state.rules.combat = null;
  for (const card of state.battlefield) { card.temporaryEffects = []; card.damage = 0; card.regeneration = 0; if (card.animated && (card.animated.until == null || card.animated.until <= state.rules.turnSerial + 1)) { card.typeLine = card.animated.originalTypeLine || card.typeLine.replace(/ Creature$/, ""); delete card.animated; card.lane = "other"; } }
  for (const card of state.battlefield) if (card.copyBase && !card.permanentCopy) { Object.assign(card, card.copyBase); delete card.copyBase; card.lane = "land"; }
  for (const card of state.battlefield) if (card.addedArtifactSerial != null) { card.typeLine = card.originalTypeLine; if (card.originalFaces) card.faces = structuredClone(card.originalFaces); delete card.originalTypeLine; delete card.originalFaces; delete card.addedArtifactSerial; }
}

export function goldfishGraveyardTypes(state) {
  const types = new Set();
  for (const card of state.graveyard) {
    if (card.name === "Grist, the Hunger Tide") types.add("Creature");
    if (["token", "copy", "ability"].includes(card.kind)) continue;
    // Front face outside the stack/battlefield; split card type lines already
    // contain both halves. Subtypes and supertypes never count for delirium.
    const type = card.layout === "split" ? card.faces?.map((part) => part.typeLine).join(" // ") : card.faces?.length ? card.faces[0].typeLine : card.typeLine;
    for (const name of String(type || "").match(/\b(?:Artifact|Battle|Creature|Enchantment|Instant|Kindred|Tribal|Land|Planeswalker|Sorcery)\b/g) || []) types.add(name === "Tribal" ? "Kindred" : name);
  }
  return [...types];
}

export function goldfishCharacteristics(state, card) {
  const battlefield = state.battlefield.some((item) => item.id === card.id);
  const base = face(card);
  let power = card.powerOverride || (card.faceDown ? "2" : base.power ?? card.power);
  let toughness = card.toughnessOverride || (card.faceDown ? "2" : base.toughness ?? card.toughness);
  const notes = [];
  let boostP = 0, boostT = 0;
  if (!card.faceDown) {
    const derived = engineStatAdjustments(state, card);
    if (!card.powerOverride && derived.power != null) power = String(derived.power);
    if (!card.toughnessOverride && derived.toughness != null) toughness = String(derived.toughness);
    boostP += (derived.boost || 0) + (derived.boostPower || 0); boostT += (derived.boost || 0) + (derived.boostToughness || 0);
  }
  if (battlefield) {
    const counters = (card.counters?.["+1/+1"] || 0) - (card.counters?.["-1/-1"] || 0);
    boostP += counters; boostT += counters;
    for (const effect of card.temporaryEffects || []) {
      if (effect.turn !== state.turn) continue;
      boostP += effect.power || 0; boostT += effect.toughness || 0;
      notes.push(`${effect.label}・ターン終了まで`);
      for (const keyword of effect.keywords || []) notes.push(({ "first strike": "先制攻撃", "double strike": "二段攻撃" })[keyword] || keyword);
    }
    if (!card.faceDown && card.automaticAbilities !== false && isChanneler(card) && goldfishGraveyardTypes(state).length >= 4) {
      boostP += 2; boostT += 2; notes.push("昂揚・飛行・可能なら攻撃");
    }
    for (const equipment of state.battlefield) {
      if (permanent(state, equipment.attachedTo)?.id === card.id) {
        const bonus = goldfishEquipmentBonus(equipment);
        boostP += bonus.power; boostT += bonus.toughness;
        notes.push(isCutter(equipment) ? "コーリ鋼：+1/+1・トランプル・速攻" : `${equipment.name} 装備中`);
      }
    }
    if (card.attachedTo && permanent(state, card.attachedTo)) notes.push(`装着先：${permanent(state, card.attachedTo).name}`);
  }
  const add = (value, bonus) => value !== "" && value != null && Number.isFinite(Number(value)) ? String(Number(value) + bonus) : value;
  return { power: add(power, boostP), toughness: add(toughness, boostT), notes };
}
