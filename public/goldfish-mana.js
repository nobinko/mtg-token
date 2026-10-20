import { cloneGoldfishState, moveGoldfishCards, GOLDFISH_MANA_TYPES as COLORS, normalizeGoldfishMana,
  playGoldfishCard, goldfishPlayDestination } from "./goldfish.js?v=20261020-public30b";
import { assertGoldfishChoiceComplete, goldfishCharacteristics } from "./goldfish-rules.js?v=20261020-public30b";
import { goldfishSpellProgram, goldfishSpellTargets, validateGoldfishSpellTarget } from "./goldfish-spells.js?v=20261020-public30b";
import { goldfishReference, goldfishFindObject, moveGoldfishRuleObject } from "./goldfish-objects.js?v=20261020-public30b";
import { goldfishPlotReady } from "./goldfish-action-definitions.js?v=20261020-public30b";
import { gameDomain, gameLandTypes, gameColors, canTapCreature, gameManaValue } from "./goldfish-engine.js?v=20261020-public30b";
import { cardName, isType, changeLife } from "./goldfish-events.js?v=20261020-public30b";
import { commandCastChoice, extraCastChoice } from "./goldfish-modal.js?v=20261020-public30b";
import { hasRuleCard, castBlockReason, abilityBlockReason } from "./goldfish-constraints.js?v=20261020-public30b";
import { verifiedGoldfishCard } from "./goldfish-card-programs.js?v=20261020-public30b";
import { effectCastPermission, completeEffectCast } from "./goldfish-format-runtime.js?v=20261020-public30b";
import { continueEngineResolution } from "./goldfish-engine.js?v=20261020-public30b";
import { castGoldfishAlternative, planHogaak } from "./goldfish-alternatives.js?v=20261020-public30b";
import { EXTRA_COST_SPELLS, formatAdditionalMana, payFormatExtraCosts } from "./goldfish-extra-costs.js?v=20261020-public30b";
import { advancedMana } from "./goldfish-advanced-spells.js?v=20261020-public30b";

const BASIC = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
const faceOf = (card) => card.faces?.[card.faceIndex || 0] || card;
export const goldfishManaCost = (card) => String(faceOf(card).manaCost || "");
export const canPlayGoldfishGraveyard = (s, c) => s.rules.gaeaWillSerial === s.rules.turnSerial || c.grantedCast?.serial === s.rules.turnSerial || Boolean(goldfishSpellProgram(c)?.flashback || goldfishSpellProgram(c)?.harmonize) || isType(c, "Land") && s.battlefield.some(x => verifiedGoldfishCard(x) && /You may play lands from your graveyard\./.test(faceOf(x).oracleText));
export function goldfishCastingCost(card, { fromExile = false, fromGraveyard = false, warp = false, dash = false, kicked = false, state, x = 0, splice = [], pitch = [], replicate = 0, fuse = false, baseCost, delve = [], mode, harmonizeTap = [], format = {} } = {}) {
  let cost = fuse ? "{1}{R}{W}" : baseCost ?? goldfishManaCost(card);
  if (fromExile && card.playPermission?.kind === "plot") cost = "{0}";
  if (fromExile && card.playPermission?.free) cost = "{0}";
  if (fromExile && card.playPermission?.cost) cost = card.playPermission.cost;
  if (fromGraveyard) { const fb = card.grantedCast?.cost || goldfishSpellProgram(card)?.harmonize || goldfishSpellProgram(card)?.flashback; cost = fb === "mountain" ? "{0}" : fb || ""; }
  if (fromGraveyard && state && state.rules.gaeaWillSerial === state.rules.turnSerial) cost = goldfishManaCost(card);
  if (warp || dash) cost = String(faceOf(card).oracleText || "").match(new RegExp((warp ? "Warp" : "Dash") + " ((?:\\{[^}]+\\})+)"))?.[1] || "";
  if (cardName(card) === "Overlord of the Balemurk" && format.impending === "yes") cost = "{1}{B}";
  if (["Snuff Out", "Massacre", "Force of Vigor"].includes(cardName(card)) && format.freeCast === "yes") cost = "{0}";
  if (state && effectCastPermission(state, card)) cost = effectCastPermission(state, card).cost || "{0}";
  if (baseCost === undefined && !warp && !dash && state && !fromExile && !fromGraveyard && state.battlefield.some(c => cardName(c) === "Omniscience" && verifiedGoldfishCard(c))) cost = "{0}";
  if (kicked) cost += String(faceOf(card).oracleText || "").match(/Kicker ((?:\{[^}]+\})+)/)?.[1] || "";
  cost += "{1}{R}".repeat(splice.length);
  if (replicate) cost += `{${replicate}}`;
  if (cardName(card) === "Lively Dirge" && verifiedGoldfishCard(card)) cost += `{${mode === "both" ? 3 : mode === "return" ? 2 : 1}}`;
  if (cardName(card) === "Fire Magic" && verifiedGoldfishCard(card)) cost += `{${mode === "firaga" ? 5 : mode === "fira" ? 2 : 0}}`;
  if (cardName(card) === "Path of Peril" && mode === "cleave" && verifiedGoldfishCard(card)) cost = "{4}{W}{B}";
  if (verifiedGoldfishCard(card)) cost += formatAdditionalMana(card, format) + advancedMana(card, format);
  if (!state || !cost) return cost;
  let reduction = cardName(card) === "March of Otherworldly Light" ? pitch.length * 2 : 0;
  if (fromGraveyard && goldfishSpellProgram(card)?.harmonize && !card.grantedCast && harmonizeTap.length) {
    const tapped = goldfishFindObject(state, harmonizeTap[0]);
    if (tapped) reduction += Math.max(0, Number(goldfishCharacteristics(state, tapped).power) || 0);
  }
  const n = cardName(card), text = faceOf(card).oracleText || "";
  if (n === "Rottenmouth Viper" && verifiedGoldfishCard(card)) reduction += format.cards?.length || 0;
  if (n === "Scion of Draco") reduction += gameDomain(state) * 2;
  if (n === "Leyline Binding") reduction += gameDomain(state);
  if (n === "Sapling Nursery" && verifiedGoldfishCard(card)) reduction += state.battlefield.filter(c => gameLandTypes(state, c).includes("Forest")).length;
  if (n === "Sunderflock" && verifiedGoldfishCard(card)) reduction += Math.max(0, ...state.battlefield.filter(c => isType(c, "Elemental")).map(gameManaValue));
  if (n === "Stormwing Entity" && verifiedGoldfishCard(card) && state.rules.instantSorceryCast > 0) { reduction += 2; cost = cost.replace("{U}", ""); }
  if (verifiedGoldfishCard(card) && ["Eddymurk Crab", "Hearth Elemental"].includes(n)) reduction += state.graveyard.filter(c => isType(c, "Instant|Sorcery")).length;
  if (n === "Emry, Lurker of the Loch" || /Affinity for artifacts/.test(text)) reduction += state.battlefield.filter(c => isType(c, "Artifact")).length;
  if (n === "Emrakul, the Promised End") reduction += new Set(state.graveyard.flatMap(c => (c.typeLine || "").match(/\b(?:Artifact|Battle|Creature|Enchantment|Instant|Kindred|Land|Planeswalker|Sorcery)\b/g) || [])).size;
  for (const c of state.battlefield.filter(c => !c.faceDown && c.automaticAbilities !== false)) {
    if (cardName(c) === "Momo, Friendly Flier" && verifiedGoldfishCard(c) && state.rules.activePlayer === "self" && !state.rules.firstFlyingCreature && isType(card, "Creature") && !isType(card, "Lemur") && /\bFlying\b/i.test(text)) reduction++;
    if (verifiedGoldfishCard(c) && cardName(c) === "Bilbo, Thief in the Night" && (fromExile || fromGraveyard)) reduction++;
    if (verifiedGoldfishCard(c) && cardName(c) === "It That Heralds the End" && !gameColors(card).length && gameManaValue({ ...card, cast: { x } }) >= 7) reduction++;
    if (cardName(c) === "Eye of Ugin" && verifiedGoldfishCard(c) && isType(card, "Eldrazi") && !gameColors(card).length) reduction += 2;
    if (cardName(c) === "Ruby Medallion" && gameColors(card).includes("R")) reduction++;
    if (cardName(c) === "The Fire Crystal" && verifiedGoldfishCard(c) && gameColors(card).includes("R")) reduction++;
    if (cardName(c) === "Ral, Monsoon Mage" && isType(card, "Instant|Sorcery")) reduction++;
    if (cardName(c) === "Artist's Talent" && c.level >= 2 && !isType(card, "Creature")) reduction++;
    if (cardName(c) === "Krallenhorde Howler" && isType(card, "Creature")) reduction++;
  }
  if (isType(card, "Instant|Sorcery") && state.rules.ralReductionUntil >= state.rules.turnSerial) reduction++;
  let generic = 0;
  cost = cost.replace(/\{X\}/g, "{" + x + "}").replace(/\{(\d+)\}/g, (_, n) => { generic += Number(n); return ""; });
  if (hasRuleCard(state, "Damping Sphere")) generic += state.rules.spellsCast;
  generic += state.battlefield.filter(c => cardName(c) === "Sphere of Resistance" && verifiedGoldfishCard(c)).length;
  generic += state.battlefield.filter(c => cardName(c) === "Disruptor Flute" && c.chosenName === n && !c.faceDown && c.automaticAbilities !== false).length * 3;
  generic = Math.max(0, generic - reduction);
  if (state.battlefield.some(c => cardName(c) === "Trinisphere" && !c.tapped)) generic = Math.max(generic, 3 - (cost.match(/\{/g) || []).length);
  generic = Math.max(0, generic - delve.length);
  return "{" + generic + "}" + cost;
}
export function planGoldfishCastPayment(state, card, options = {}) {
  if (cardName(card) === "Hogaak, Arisen Necropolis" && verifiedGoldfishCard(card) && !effectCastPermission(state, card)) return planHogaak(state, card);
  if (options.preview && options.fromGraveyard && goldfishSpellProgram(card)?.harmonize && !card.grantedCast && options.harmonizeTap === undefined) {
    const plans = [[], ...state.battlefield.filter(c => isType(c, "Creature") && !c.tapped).map(c => [goldfishReference(c)])].map(harmonizeTap => planGoldfishCastPayment(state, card, { ...options, preview: false, harmonizeTap }));
    return plans.find(p => p.payable) || plans[0];
  }
  if (options.preview && options.delve === undefined && verifiedGoldfishCard(card) && ["Murktide Regent", "Treasure Cruise", "Dig Through Time"].includes(cardName(card))) {
    const generic = Number(goldfishCastingCost(card, { ...options, state }).match(/\{(\d+)\}/)?.[1] || 0);
    options = { ...options, delve: state.graveyard.filter(c => c.id !== card.id).slice(0, generic).map(c => goldfishReference(c, "graveyard")) };
  }
  const cost = goldfishCastingCost(card, { ...options, state });
  if (!(verifiedGoldfishCard(card) && (["March of Otherworldly Light", "Bitter Triumph", "Crop Rotation"].includes(cardName(card)) || EXTRA_COST_SPELLS.has(cardName(card)))) && /\bAs an additional cost to cast\b/i.test(faceOf(card).oracleText || "")) return { cost, supported: false, payable: false, reason: "このカードには追加コストがあります。本文を確認し、追加コストを処理してから手動支払いで唱えてください。" };
  // Delve pays generic mana after the total cost (including Trinisphere) is
  // determined. It is not a reduction, and cannot pay colored symbols.
  const paymentCost = goldfishCastingCost(card, { ...options, state, delve: [] });
  return { ...planGoldfishPayment(state, { manaCost: paymentCost }, { ...options, exclude: [...(options.exclude || []), ...(options.harmonizeTap || []).map(r => r.id), ...(cardName(card) === "We Say Thee Nay!" ? options.format?.cards || [] : []).map(r => r.id)], reserve: [...(options.format?.cards || []), ...(options.costCards || [])].filter(r => (r.zone || "battlefield") === "battlefield").map(r => r.id), spell: card, genericCredit: options.delve?.length || 0, maximizeColors: ["Prismatic Ending", "Engineered Explosives", "Together as One"].includes(cardName(card)) }), cost };
}
export const goldfishManaText = (pool) => COLORS.flatMap((color) => pool[color] ? [`${pool[color]}${color}`] : []).join(" ") || "0";
const total = (pool) => COLORS.reduce((sum, color) => sum + pool[color], 0);
const add = (a, b) => Object.fromEntries(COLORS.map((color) => [color, a[color] + (b[color] || 0)]));

export function goldfishLandEntryOptions(card, state) {
  const text = String(faceOf(card).oracleText || "");
  if (state) {
    if (!isType(card, "Basic") && state.battlefield.some(c => cardName(c) === "Blood Moon" && c.automaticAbilities !== false)) return [{ tapped: false, life: 0, label: "血染めの月：アンタップイン" }];
    const needs = text.match(/enters tapped unless you control (?:a|an) (Plains|Island|Swamp|Mountain|Forest)(?: or (?:a|an) (Plains|Island|Swamp|Mountain|Forest))?\./);
    if (needs) { const tapped = !state.battlefield.some(c => gameLandTypes(state, c).some(type => needs.slice(1).includes(type))); return [{ tapped, life: 0, label: tapped ? "条件未達：タップイン" : "条件を満たしてアンタップイン" }]; }
    if (/enters tapped unless you control two or fewer other lands/.test(text)) { const tapped = state.battlefield.filter(c => isType(c, "Land")).length > 2; return [{ tapped, life: 0, label: tapped ? "タップイン" : "アンタップイン" }]; }
  }
  if (/you may pay 2 life\. If you don't, (?:it|[^.]+) enters(?: the battlefield)? tapped\./i.test(text)) {
    return [{ tapped: true, life: 0, label: "タップイン" }, { tapped: false, life: 2, label: "2ライフ払ってアンタップイン" }];
  }
  if (/enters(?: the battlefield)?[^.]*tapped/i.test(text)) {
    if (/enters(?: the battlefield)? tapped\./i.test(text)) return [{ tapped: true, life: 0, label: "タップイン" }];
    return [{ tapped: true, life: 0, label: "条件を確認 → タップイン" }, { tapped: false, life: 0, label: "条件を確認 → アンタップイン" }];
  }
  return [{ tapped: false, life: 0, label: "戦場へ" }];
}

// Only complete, unconditional land abilities are recognized. In particular,
// produced_mana alone loses spending restrictions, activation costs and choices.
export function goldfishLandManaOptions(card, state, context = {}) {
  if (card.automaticAbilities === false || state && abilityBlockReason(state, card, { manaAbility: true })) return [];
  const face = faceOf(card);
  const type = state && isType(card, "Land") ? "Land — " + gameLandTypes(state, card).join(" ") : face.typeLine || "";
  if (card.faceDown || (!state && (!/\bLand\b/.test(type) || /\bCreature\b/.test(type))) || (state && isType(card, "Creature") && !canTapCreature(state, card))) return [];
  const result = [];
  const n = cardName(card), battlefield = state?.battlefield || [];
  if (state && isType(card, "Creature") && hasRuleCard(state, "Cursed Totem")) return [];
  const escapedName = String(face.name || card.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tapDamage = String(face.oracleText || "").match(new RegExp(`(?:Whenever|When) (?:this land|${escapedName}) becomes tapped, (?:it|this land|${escapedName}) deals (\\d+) damage to you\\.`, "i"));
  const insert = (pool, life = 0, damage = false) => {
    if (state && isType(card, "Land") && hasRuleCard(state, "Damping Sphere") && total(pool) >= 2) pool = normalizeGoldfishMana({ C: 1 });
    if (state && isType(card, "Creature")) pool.G += battlefield.filter(c => ["Leyline of Abundance", "Badgermole Cub"].includes(cardName(c)) && !c.faceDown).length;
    if (tapDamage) { life += Number(tapDamage[1]); damage = true; }
    if (!result.some((item) => JSON.stringify(item.pool) === JSON.stringify(pool) && item.life === life && item.damage === damage)) result.push({ pool, life, damage });
  };
  for (const [subtype, color] of Object.entries(BASIC)) {
    if (new RegExp(`\\b${subtype}\\b`).test(type.split(/[—–]/)[1] || "")) insert(normalizeGoldfishMana({ [color]: 1 }));
  }
  if (state && isType(card, "Land") && !/\bBasic\b/.test(face.typeLine) && battlefield.some(c => cardName(c) === "Blood Moon")) return result;
  if (state && isType(card, "Land") && !hasRuleCard(state, "Blood Moon") && battlefield.some(c => cardName(c) === "Petrified Hamlet" && verifiedGoldfishCard(c) && c.chosenName === n)) insert(normalizeGoldfishMana({ C: 1 }));
  if (["Urza's Mine", "Urza's Power Plant", "Urza's Tower"].includes(n) && ["Urza's Mine", "Urza's Power Plant", "Urza's Tower"].every(required => battlefield.some(c => cardName(c) === required))) { insert(normalizeGoldfishMana({ C: n === "Urza's Tower" ? 3 : 2 })); return result; }
  if (n === "Urza's Saga" && card.sagaAbilities >= 1) insert(normalizeGoldfishMana({ C: 1 }));
  const eldraziUse = context.spell || context.abilitySource;
  if (n === "Eldrazi Temple" && (!eldraziUse || isType(eldraziUse, "Eldrazi") && !gameColors(eldraziUse).length)) insert(normalizeGoldfishMana({ C: 2 }));
  if (n === "Ugin's Labyrinth") insert(normalizeGoldfishMana({ C: card.imprinted && state?.exile.some(c => c.id === card.imprinted.id && c.incarnation === card.imprinted.incarnation) ? 2 : 1 }));
  if (n === "Mox Opal" && battlefield.filter(c => isType(c, "Artifact")).length >= 3) for (const color of COLORS.slice(0, 5)) insert(normalizeGoldfishMana({ [color]: 1 }));
  if (n === "Chrome Mox" && verifiedGoldfishCard(card)) { const imprinted = goldfishFindObject(state, card.imprinted); if (imprinted) for (const color of gameColors(imprinted)) insert(normalizeGoldfishMana({ [color]: 1 })); }
  if (card.hydroLand && verifiedGoldfishCard(card)) insert(normalizeGoldfishMana({ U: 1 }));
  if (n === "Tablet of Discovery" && verifiedGoldfishCard(card) && (!context.spell || isType(context.spell, "Instant|Sorcery"))) { const i = result.length; insert(normalizeGoldfishMana({ R: 2 })); if (result.length > i) result.at(-1).restriction = "instantSorcery"; }
  if (state && isType(card, "Forest") && battlefield.some(c => c.trollAura && goldfishFindObject(state, c.attachedTo)?.id === card.id)) insert(normalizeGoldfishMana({ G: 2 }));
  if (n === "Powerstone" && (!context.spell || isType(context.spell, "Artifact"))) insert(normalizeGoldfishMana({ C: 1 }));
  if (n === "Floodfarm Verge" && battlefield.some(c => gameLandTypes(state, c).some(t => ["Plains", "Island"].includes(t)))) insert(normalizeGoldfishMana({ U: 1 }));
  if (n === "Gleaming Bastion" && verifiedGoldfishCard(card) && (card.enteredSerial === state?.rules.turnSerial || battlefield.some(c => isType(c, "Basic") && isType(c, "Land")))) for (const color of ["W", "U"]) insert(normalizeGoldfishMana({ [color]: 1 }));
  if (n === "Castle Doom" && verifiedGoldfishCard(card)) for (const color of COLORS.slice(0, 5)) { insert(normalizeGoldfishMana({ [color]: 1 })); result.at(-1).restriction = "artifactSpell"; }
  if (n === "Gemstone Caverns") { for (const color of card.counters?.luck ? COLORS.slice(0, 5) : ["C"]) insert(normalizeGoldfishMana({ [color]: 1 })); return result; }
  if (n === "Delighted Halfling" && (!context.spell || isType(context.spell, "Legendary"))) for (const color of COLORS.slice(0, 5)) insert(normalizeGoldfishMana({ [color]: 1 }));
  if (n === "Shang-Chi, Master of Kung Fu" && (!context.spell || context.creatureAbility)) for (const color of COLORS.slice(0, 5)) insert(normalizeGoldfishMana({ [color]: 2 }));
  if (n === "Cavern of Souls" && card.chosenType && (!context.spell || isType(context.spell, "Creature") && isType(context.spell, card.chosenType))) for (const color of COLORS.slice(0, 5)) insert(normalizeGoldfishMana({ [color]: 1 }));
  for (const option of result) {
    if (n === "Powerstone") option.restriction = "artifactOrAbility";
    if (n === "Eldrazi Temple" && option.pool.C === 2) option.restriction = "eldrazi";
    if (n === "Shang-Chi, Master of Kung Fu") option.restriction = "creatureAbility";
    if (n === "Delighted Halfling" && !option.pool.C) { option.restriction = "legendary"; option.uncounterable = true; }
    if (n === "Cavern of Souls" && !option.pool.C) { option.restriction = "creature:" + card.chosenType; option.uncounterable = true; }
  }
  for (let line of String(face.oracleText || "").split("\n")) {
    line = line.trim().replace(/^\((.*)\)$/, "$1");
    const match = line.match(/^\{T\}(?:, Pay (\d+) life)?: Add (.+?)\.(?: (.+?) deals (\d+) damage to you\.)?$/);
    if (!match) continue;
    if (match[3] && ![face.name, card.name, "This land", "This artifact"].includes(match[3])) continue;
    const life = Number(match[1] || match[4] || 0);
    if (life > 20 || (match[1] && match[4])) continue;
    let productions;
    if (match[2] === "one mana of any color") productions = COLORS.slice(0, 5).map((color) => `{${color}}`);
    else if (/^\{[WUBRGC]\}(?:,? (?:or )?\{[WUBRGC]\})+$/.test(match[2])) productions = match[2].match(/\{[WUBRGC]\}/g);
    else if (/^(?:\{[WUBRGC]\})+$/.test(match[2])) productions = [match[2]];
    else continue;
    for (const production of productions) {
      const pool = normalizeGoldfishMana();
      for (const symbol of production.match(/\{[WUBRGC]\}/g)) pool[symbol[1]] += 1;
      insert(pool, life, Boolean(match[4]));
    }
  }
  if (state && !context.inheritedMana) for (const inherited of card.grantedAbilityCards || []) {
    const borrowed = { ...structuredClone(card), ...inherited.values, faces: [], faceIndex: 0, grantedAbilityCards: [] };
    delete borrowed.copyRuleName;
    for (const option of goldfishLandManaOptions(borrowed, state, { ...context, inheritedMana: true })) {
      if (!result.some(o => JSON.stringify(o) === JSON.stringify(option))) result.push(option);
    }
  }
  return result;
}

function costVariants(cost, x) {
  if (!cost || !/^(?:\{[^{}]+\})+$/.test(cost)) return { error: "マナ・コストを確認できません。代替コストなどは手動で処理してください。" };
  if (!Number.isInteger(x) || x < 0 || x > 99) return { error: "Xは0〜99の整数で指定してください。" };
  let variants = [{ ...normalizeGoldfishMana(), generic: 0, life: 0 }];
  for (const symbol of cost.match(/\{([^}]+)\}/g).map((part) => part.slice(1, -1))) {
    let choices;
    if (/^\d+$/.test(symbol)) choices = [{ generic: Number(symbol) }];
    else if (symbol === "X") choices = [{ generic: x }];
    else if (COLORS.includes(symbol)) choices = [{ [symbol]: 1 }];
    else if (/^[WUBRGC]\/[WUBRGC]$/.test(symbol)) choices = symbol.split("/").map((color) => ({ [color]: 1 }));
    else if (/^2\/[WUBRG]$/.test(symbol)) choices = [{ generic: 2 }, { [symbol[2]]: 1 }];
    else if (/^[WUBRG](?:\/[WUBRG])?\/P$/.test(symbol)) choices = [...symbol.split("/").filter((part) => part !== "P").map((color) => ({ [color]: 1 })), { life: 2 }];
    else return { error: `このマナ記号（${symbol}）は手動で支払ってください。` };
    const unique = new Map();
    for (const variant of variants) for (const choice of choices) {
      const next = { ...variant };
      for (const [key, amount] of Object.entries(choice)) next[key] += amount;
      unique.set(JSON.stringify(next), next);
    }
    variants = [...unique.values()];
    if (variants.length > 512 || variants.some((v) => v.generic > 300 || total(v) > 100)) return { error: "このコストは手動で支払ってください。" };
  }
  return { variants };
}

// Excess colored mana is interchangeable for a fixed generic requirement. This
// DP key avoids exponential land combinations while never using a dual twice.
function coverage(pool, cost, credit = 0) {
  const matched = COLORS.map((color) => Math.min(pool[color], cost[color]));
  return [...matched, Math.min(cost.generic, total(pool) + credit - matched.reduce((a, b) => a + b, 0))].join(",");
}
function better(a, b) {
  return !b || a.life < b.life || (a.life === b.life && ((a.sacrifices || 0) < (b.sacrifices || 0) ||
    (a.sacrifices || 0) === (b.sacrifices || 0) && (a.activations.length < b.activations.length ||
    (a.activations.length === b.activations.length && a.flexibility < b.flexibility))));
}
// Only these complete mana abilities may consume a permanent automatically.
// LED's discard and other non-mana costs remain explicit player choices.
function sacrificeManaOptions(card, state) {
  if (card.faceDown || card.automaticAbilities === false || abilityBlockReason(state, card, { manaAbility: true })) return [];
  if (card.tapped || isType(card, "Creature") && !canTapCreature(state, card)) return [];
  const text = String(faceOf(card).oracleText || "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  const petal = cardName(card) === "Lotus Petal" && verifiedGoldfishCard(card);
  const treasure = isType(card, "Treasure") && text === "{T}, Sacrifice this artifact: Add one mana of any color.";
  if (!petal && !treasure) return [];
  return COLORS.slice(0, 5).map(color => ({ pool: normalizeGoldfishMana({ [color]: 1 }), life: 0, sacrifice: true }));
}
function payPool(pool, cost, credit = 0) {
  const remaining = { ...pool };
  for (const color of COLORS) remaining[color] -= cost[color];
  let generic = Math.max(0, cost.generic - credit);
  for (const color of ["C", "W", "U", "B", "R", "G"]) {
    const spent = Math.min(remaining[color], generic);
    remaining[color] -= spent;
    generic -= spent;
  }
  return remaining;
}

export function planGoldfishPayment(state, card, { autoTap = true, x = 0, phyrexianLife = false, exclude = [], reserve = [], spell, creatureAbility, abilitySource, maximizeColors = false, requiredColors = [], genericCredit = 0 } = {}) {
  if (maximizeColors) {
    let best;
    for (let mask = 0; mask < 32; mask++) {
      const colors = COLORS.slice(0, 5).filter((_, i) => mask & (1 << i));
      const plan = planGoldfishPayment(state, card, { autoTap, x, phyrexianLife, exclude, reserve, spell, creatureAbility, abilitySource, requiredColors: colors, genericCredit });
      if (plan.payable && (!best?.payable || plan.colorsSpent.length > best.colorsSpent.length || plan.colorsSpent.length === best.colorsSpent.length && better(plan, best))) best = plan;
      else best ||= plan;
    }
    return best;
  }
  const cost = goldfishManaCost(card);
  const parsed = costVariants(cost, x);
  if (parsed.error) return { payable: false, supported: false, cost, reason: parsed.error };
  if (creatureAbility && hasRuleCard(state, "Agatha's Soul Cauldron")) for (const v of parsed.variants) {
    for (const color of COLORS.slice(0, 5)) { v.generic += v[color]; v[color] = 0; }
  }
  const improvise = spell && /\bImprovise\b/.test(faceOf(spell).oracleText || "");
  const sources = autoTap ? state.battlefield.filter(land => !exclude.includes(land.id))
    .map(land => ({ id: land.id, options: [...(!land.tapped ? goldfishLandManaOptions(land, state, { spell, creatureAbility, abilitySource }) : []), ...(!reserve.includes(land.id) ? sacrificeManaOptions(land, state) : []), ...(improvise && !land.tapped && isType(land, "Artifact") ? [{ pool: normalizeGoldfishMana(), life: 0, credit: 1 }] : [])] })).filter(source => source.options.length) : [];
  const eldraziUse = spell || abilitySource;
  const eligible = item => item.restriction === "artifactSpell" ? spell && isType(spell, "Artifact") : item.restriction === "instantSorcery" ? spell && isType(spell, "Instant|Sorcery") : item.restriction === "artifactOrAbility" ? !spell || isType(spell, "Artifact") : item.restriction === "eldrazi" ? eldraziUse && isType(eldraziUse, "Eldrazi") && !gameColors(eldraziUse).length : item.restriction === "creatureAbility" ? creatureAbility : item.restriction === "legendary" ? spell && isType(spell, "Legendary") : item.restriction?.startsWith("creature:") ? spell && isType(spell, "Creature") && isType(spell, item.restriction.slice(9)) : true;
  for (const source of sources) source.options = source.options.filter(option => !option.restriction || eligible(option));
  const restrictions = structuredClone(state.rules.restrictedMana || []);
  const blocked = restrictions.filter(item => !eligible(item));
  const initialPool = normalizeGoldfishMana(state.manaPool);
  for (const item of blocked) for (const color of COLORS) initialPool[color] = Math.max(0, initialPool[color] - (item.pool[color] || 0));
  const initial = { pool: initialPool, activations: [], sacrifices: 0, life: 0, flexibility: 0, credit: genericCredit, restrictions: restrictions.filter(eligible) };
  let best = null;
  const maxLife = Math.max(...parsed.variants.map((variant) => variant.life));
  for (const parsedVariant of parsed.variants.filter((variant) => !phyrexianLife || variant.life === maxLife)) {
    const variant = { ...parsedVariant };
    if (spell && state.battlefield.some(c => cardName(c) === "Trinisphere" && !c.tapped)) variant.generic = Math.max(variant.generic, 3 - total(variant));
    for (const color of requiredColors) if (!variant[color]) { variant[color] = 1; variant.generic--; }
    if (variant.generic < 0) continue;
    if (variant.life && variant.life >= state.players.self.life) continue;
    const target = [...COLORS.map((color) => variant[color]), variant.generic].join(",");
    let candidates = new Map([[coverage(initial.pool, variant, initial.credit), { ...initial, life: variant.life }]]);
    for (const source of sources) {
      const next = new Map(candidates);
      for (const [key, candidate] of candidates) {
        if (key === target) continue;
        source.options.forEach((option, optionIndex) => {
          const life = candidate.life + option.life;
          // Never auto-pay down to zero. The manual controls remain available.
          if (life && life >= state.players.self.life) return;
          const proposed = { pool: add(candidate.pool, option.pool), life, credit: candidate.credit + (option.credit || 0), restrictions: [...candidate.restrictions, ...(option.restriction ? [{ restriction: option.restriction, pool: option.pool, uncounterable: option.uncounterable }] : [])],
            activations: [...candidate.activations, { id: source.id, optionIndex, ...(option.sacrifice ? { sacrifice: true } : {}) }], sacrifices: candidate.sacrifices + Number(!!option.sacrifice), flexibility: candidate.flexibility + source.options.length };
          const nextKey = coverage(proposed.pool, variant, proposed.credit);
          if (better(proposed, next.get(nextKey))) next.set(nextKey, proposed);
        });
      }
      candidates = next;
      if (candidates.size > 25000) return { payable: false, supported: false, cost, reason: "組み合わせが多いため、土地を選んでマナを出してから支払ってください。" };
    }
    const candidate = candidates.get(target);
    if (candidate && better(candidate, best)) best = { ...candidate, remaining: payPool(candidate.pool, variant, candidate.credit) };
  }
  if (best) {
    const spent = Object.fromEntries(COLORS.map(c => [c, best.pool[c] - best.remaining[c]]));
    const colorsSpent = COLORS.slice(0, 5).filter(c => spent[c] > 0), manaSpent = total(spent), manaByColor = { ...spent };
    const usedHaste = Math.min(state.rules.hasteMana || 0, spent.R);
    const remainingFireMana = Math.max(0, (state.rules.fireMana || 0) - spent.R);
    const restrictedMana = []; let uncounterable = false;
    for (const item of best.restrictions) {
      const remainder = { ...item.pool };
      for (const color of COLORS) { const used = Math.min(remainder[color] || 0, spent[color]); remainder[color] = (remainder[color] || 0) - used; spent[color] -= used; if (used && item.uncounterable && spell) uncounterable = true; }
      if (total(remainder)) restrictedMana.push({ ...item, pool: remainder });
    }
    for (const item of blocked) for (const color of COLORS) best.remaining[color] += item.pool[color] || 0;
    return { ...best, restrictedMana: [...restrictedMana, ...blocked], remainingFireMana, remainingHasteMana: (state.rules.hasteMana || 0) - usedHaste, hasteMana: !!(usedHaste && spell && isType(spell, "Creature")), uncounterable, payable: true, supported: true, cost, x, colorsSpent, manaSpent, manaByColor };
  }
  return {
    payable: false, supported: true, cost,
    reason: autoTap ? "必要な色・量のマナが足りません。対応外の能力やコスト変更は「手動処理」を使えます。" : "マナプールが足りません。土地からマナを出すか、自動タップをONにしてください。"
  };
}

// Apply an internally computed plan once, to a new draft. All callers validate
// choices and costs first; no game action or cast event is emitted here.
export function payGoldfishPlan(state, plan) {
  const next = cloneGoldfishState(state);
  payGoldfishPlanDraft(next, plan);
  return next;
}
export function payGoldfishPlanDraft(next, plan) {
  if (!plan.payable) throw new Error(plan.reason);
  for (const activation of plan.activations) {
    if (activation.sacrifice) moveGoldfishRuleObject(next, activation.id, "battlefield", "graveyard", "sacrifice");
    else next.battlefield.find(land => land.id === activation.id).tapped = true;
  }
  next.manaPool = { ...plan.remaining };
  next.rules.restrictedMana = structuredClone(plan.restrictedMana || []);
  next.rules.hasteMana = plan.remainingHasteMana || 0;
  next.rules.fireMana = plan.remainingFireMana || 0;
  changeLife(next, -plan.life);
}

export function activateGoldfishLand(state, cardId, optionIndex = 0) {
  assertGoldfishChoiceComplete(state);
  if (state.phase !== "playing") throw new Error("初手をキープしてからマナを出してください。");
  const land = state.battlefield.find((card) => card.id === cardId);
  if (!land || land.tapped) throw new Error("アンタップ状態の土地を選んでください。");
  const option = goldfishLandManaOptions(land, state)[optionIndex];
  if (!option) throw new Error("このマナ能力は手動で処理してください。");
  if (option.life && state.players.self.life < option.life) throw new Error("ライフが不足しています。");
  const next = cloneGoldfishState(state);
  next.battlefield.find((card) => card.id === cardId).tapped = true;
  next.manaPool = add(next.manaPool, option.pool);
  if (option.restriction) (next.rules.restrictedMana ||= []).push({ restriction: option.restriction, pool: option.pool, uncounterable: option.uncounterable });
  changeLife(next, -option.life);
  return next;
}

export function setGoldfishMana(state, color, amount) {
  assertGoldfishChoiceComplete(state);
  if (!COLORS.includes(color)) throw new Error("マナの種類が不正です。");
  const next = cloneGoldfishState(state);
  next.manaPool = normalizeGoldfishMana({ ...next.manaPool, [color]: amount });
  // Explicit pool corrections replace the selected color's restriction record.
  for (const item of next.rules.restrictedMana || []) item.pool[color] = 0;
  if (color === "R") { next.rules.hasteMana = 0; next.rules.fireMana = 0; }
  return next;
}

export function clearGoldfishMana(state) {
  assertGoldfishChoiceComplete(state);
  const next = cloneGoldfishState(state);
  next.manaPool = normalizeGoldfishMana();
  next.rules.restrictedMana = [];
  next.rules.hasteMana = 0;
  next.rules.fireMana = 0;
  return next;
}

export function goldfishFlashbackSacrifices(state, card) {
  return goldfishSpellProgram(card)?.flashback === "mountain" ? state.battlefield.filter((land) => !land.faceDown && /\bLand\b/.test(faceOf(land).typeLine || "") && /\bMountain\b/.test(faceOf(land).typeLine || "")) : [];
}

export function chooseGoldfishCast(state, answer) {
  const choice = state.rules.pendingChoice;
  if (!["cast-target", "cast-sacrifice", "cast-preflight", "land-count"].includes(choice?.type)) throw new Error("唱える前の選択がありません。");
  const next = cloneGoldfishState(state);
  if (!goldfishFindObject(next, choice.card)) throw new Error("選択中のカードが移動しています。戻す操作で確認してください。");
  next.rules.pendingChoice = null;
  if (answer.cancel) {
    const pendingCard = goldfishFindObject(next, choice.card);
    if (pendingCard?.preparedSource) next.hand = next.hand.filter(c => c.id !== pendingCard.id);
    if (next.rules.effectCast) { completeEffectCast(next); continueEngineResolution(next); }
    next.rules.lastAction = "プレイを取り消しました。コストは支払っていません。"; return next;
  }
  const options = { ...(choice.castOptions || choice.options) };
  if (choice.type === "cast-preflight") {
    if (choice.formatField) options.format = { ...options.format, [choice.formatField]: choice.kind === "cards" ? answer.refs : answer.value };
    else if (choice.optionKey) options[choice.optionKey] = choice.kind === "cards" ? answer.refs : answer.value;
    else options.command = { ...options.command, [choice.field]: choice.field === "modes" ? answer.values : choice.kind === "cards" ? answer.refs : answer.value };
  }
  else if (choice.type === "cast-target") options.target = answer.target;
  else if (choice.type === "cast-sacrifice") options.sacrifice = answer.sacrifice;
  else {
    if (!Number.isInteger(answer.count) || answer.count < 0 || answer.count > 99) throw new Error("土地の回数を選んでください。");
    next.rules.landsPlayed = answer.count;
    if (answer.count >= 1) { next.rules.lastAction = "このターンは土地をプレイ済みです。今回は出していません。"; return next; }
  }
  return castGoldfishCard(next, choice.card.id, options);
}

export function castGoldfishCard(state, cardId, { autoTap = true, x = 0, confirmLife = false, manual = false, entry = 0, fromExile = false, fromGraveyard = false, fromSideboard = false, warp = false, dash = false, kicked = false, target, sacrifice, phyrexianLife = false, command, splice, pitch, mode, modeTargets, gravePlayers, replicate, fuse = false, fuseArtifact, fuseEnchantment, extraCost, costCards, delve, harmonizeTap, returnTarget, damageTarget, format = {} } = {}) {
  assertGoldfishChoiceComplete(state);
  if (fromExile && fromGraveyard) throw new Error("唱える領域が不正です。");
  const zone = fromSideboard ? "sideboard" : fromExile ? "exile" : fromGraveyard ? "graveyard" : "hand";
  const card = state[zone].find((item) => item.id === cardId);
  if (card && cardName(card) === "Hogaak, Arisen Necropolis" && verifiedGoldfishCard(card) && !effectCastPermission(state, card)) return castGoldfishAlternative(state, cardId, "hogaak");
  const effect = card && effectCastPermission(state, card);
  if (state.rules.effectCast && !effect) throw new Error("この効果で指定されたカードを唱えてください。");
  if (effect && (x !== 0 || warp || dash || manual || fuse)) throw new Error("この効果ではマナ・コストを払わず、Xは0で唱えます。");
  if (card && !isType(card, "Land")) { const blocked = castBlockReason(state, zone); if (blocked) throw new Error(blocked); }
  if (!card || state.phase !== "playing") throw new Error("初手をキープし、手札のカードを選んでください。");
  const plotted = fromExile && card.playPermission?.kind === "plot";
  if (plotted && !goldfishPlotReady(state, card)) throw new Error("計画したカードは、後の自分のターンのメインでスタックが空のときに唱えられます。");
  const permission = card.playPermission;
  const expired = ["adventure", "airbend"].includes(permission?.kind) ? false : permission?.kind === "warp" ? permission.serial >= state.rules.turnSerial : permission?.expires != null ? permission.expires < state.rules.turnSerial : permission?.serial != null ? permission.serial !== state.rules.turnSerial : permission?.turn !== state.turn || state.rules.activePlayer === "opponent";
  if (fromExile && !plotted && permission && expired) throw new Error("この追放カードをプレイできる期限は終了しています。");
  if (fromSideboard && state.rules.wish !== state.rules.turnSerial) throw new Error("このターンの願いの許可が必要です。");
  if (plotted && x !== 0) throw new Error("計画からマナ・コストを払わず唱える場合、Xは0です。");
  if (fromExile && permission?.free && x !== 0) throw new Error("マナ・コストを支払わずに唱える場合、Xは0です。");
  if (plotted && /(?:As an additional cost to cast|\bKicker\b|\bSpree\b)/i.test(faceOf(card).oracleText || "")) throw new Error("この計画カードの追加コストは本文の操作で確認してください。");
  const definition = goldfishSpellProgram(card);
  const gaea = state.rules.gaeaWillSerial === state.rules.turnSerial || isType(card, "Land") && state.battlefield.some(c => verifiedGoldfishCard(c) && /You may play lands from your graveyard\./.test(faceOf(c).oracleText));
  if (!fromExile && !fromGraveyard && !warp && !dash && x && state.battlefield.some(c => cardName(c) === "Omniscience" && verifiedGoldfishCard(c))) throw new Error("全知でマナ・コストを払わず唱える場合、Xは0です。");
  if (fromGraveyard && !effect && !gaea && !definition?.flashback && !definition?.harmonize && card.grantedCast?.serial !== state.rules.turnSerial) throw new Error("このカードの墓地からの唱え方は手動処理です。");
  const options = { autoTap, x, confirmLife, manual, entry, fromExile, fromGraveyard, fromSideboard, warp, dash, kicked, target, sacrifice, phyrexianLife, command, splice, pitch, mode, modeTargets, gravePlayers, replicate, fuse, fuseArtifact, fuseEnchantment, extraCost, costCards, delve, harmonizeTap, returnTarget, damageTarget, format };
  const requestChoice = (type) => {
    const next = cloneGoldfishState(state);
    next.rules.pendingChoice = { type, card: goldfishReference(card, zone), sourceName: card.name, options: structuredClone(options) };
    next.rules.lastAction = `${card.name}：${type === "cast-target" ? "対象" : type === "cast-sacrifice" ? "生け贄にする山" : "土地のプレイ回数"}を選んでください。`;
    return next;
  };
  const preflight = !manual && (extraCastChoice(state, card, options) || commandCastChoice(state, card, x, command));
  if (preflight) { const next = requestChoice("cast-preflight"); next.rules.pendingChoice.castOptions = next.rules.pendingChoice.options; Object.assign(next.rules.pendingChoice, preflight); next.rules.lastAction = `${card.name}：${preflight.label}`; return next; }
  if (definition?.target && !fuse) {
    if (!goldfishSpellTargets(state, card, options).length) throw new Error("適正な対象がありません。コストは支払っていません。");
    if (!target) return requestChoice("cast-target");
    validateGoldfishSpellTarget(state, card, target, options);
  }
  if (goldfishPlayDestination(card) === "battlefield" && state.rules.landsPlayed == null) return requestChoice("land-count");
  let paidPlan;
  const place = (value) => {
    const next = playGoldfishCard(zone !== "hand" ? moveGoldfishCards(value, [cardId], "hand") : value, cardId, { target, flashback: fromGraveyard && !gaea && (Boolean(definition?.flashback || definition?.harmonize) || card.grantedCast?.flashback), warp, dash, kicked, x, command, spliced: (splice || []).map(r => structuredClone(goldfishFindObject(state, r))), delvedCards: (delve || []).map(r => structuredClone(goldfishFindObject(state, r))), mode, modeTargets, gravePlayers, replicate, fuse, fuseArtifact, fuseEnchantment, returnTarget, damageTarget, format, bargained: cardName(card) === "Beseech the Mirror" && costCards?.length === 1, fromZone: zone, hasteMana: paidPlan?.hasteMana, uncounterable: paidPlan?.uncounterable, serial: value.rules.turnSerial, colorsSpent: paidPlan?.colorsSpent || [], manaSpent: paidPlan?.manaSpent ?? (manual ? null : 0) });
    if (fromSideboard) delete next.rules.wish;
    const spell = next.stack.find(c => c.id === cardId);
    if (effect?.flashback && spell) spell.cast.flashback = true;
    if (spell?.cast) spell.cast.manaByColor = structuredClone(paidPlan?.manaByColor || {});
    if (spell && card.preparedSource) {
      const source = goldfishFindObject(next, card.preparedSource);
      if (!source?.prepared) throw new Error("準備状態が変わりました。");
      source.prepared = false; spell.kind = "copy"; delete spell.preparedSource;
    }
    if (effect) { completeEffectCast(next, true); continueEngineResolution(next); }
    return next;
  };
  if (fromGraveyard && definition?.flashback === "mountain") {
    const mountains = goldfishFlashbackSacrifices(state, card);
    if (!mountains.length) throw new Error("フラッシュバックには生け贄にする山が必要です。");
    if (!sacrifice) return requestChoice("cast-sacrifice");
    if (!mountains.some((land) => land.id === sacrifice.id && (land.incarnation || 0) === sacrifice.incarnation)) throw new Error("生け贄にできる山を選んでください。");
    const draft = cloneGoldfishState(state);
    moveGoldfishRuleObject(draft, sacrifice.id, "battlefield", "graveyard");
    const plan = planGoldfishCastPayment(draft, card, options);
    if (!plan.payable) throw new Error(plan.reason);
    if (plan.life && !confirmLife) throw new Error(`コストの支払いでライフが${plan.life}点減ります。支払いを確認してください。`);
    paidPlan = plan;
    return place(payGoldfishPlan(draft, plan));
  }
  if (manual) return place(state);
  if (goldfishPlayDestination(card) === "battlefield") {
    const choice = goldfishLandEntryOptions(card, state)[entry];
    if (!choice || state.players.self.life < choice.life) throw new Error("土地の出し方とライフを確認してください。");
    const next = place(state);
    const entered = next.battlefield.find((land) => land.id === cardId);
    if (entered) entered.tapped = choice.tapped;
    changeLife(next, -choice.life);
    return next;
  }
  const plan = planGoldfishCastPayment(state, card, options);
  paidPlan = plan;
  if (!plan.payable) throw new Error(plan.reason);
  if (plan.life && !confirmLife) throw new Error(`コストの支払いでライフが${plan.life}点減ります。支払いを確認してください。`);
  const paid = payGoldfishPlan(state, plan);
  if (verifiedGoldfishCard(card)) payFormatExtraCosts(paid, card, format);
  for (const r of harmonizeTap || []) goldfishFindObject(paid, r).tapped = true;
  if (verifiedGoldfishCard(card) && cardName(card) === "Bitter Triumph" && extraCost === "life") { if (paid.players.self.life < 3) throw new Error("追加コストのライフが足りません。"); changeLife(paid, -3); }
  for (const r of costCards || []) moveGoldfishRuleObject(paid, r.id, r.zone || "battlefield", "graveyard", (r.zone || "battlefield") === "battlefield" ? "sacrifice" : "discard");
  for (const r of delve || []) moveGoldfishRuleObject(paid, r.id, "graveyard", "exile");
  for (const r of pitch || []) moveGoldfishRuleObject(paid, r.id, "hand", "exile");
  const next = place(paid);
  if (goldfishManaCost(card).includes("{X}")) next.stack.find((spell) => spell.id === cardId).note = `X=${x}`;
  return next;
}
