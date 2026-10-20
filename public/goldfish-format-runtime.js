// Stateful effects for the cross-format programs. All entry points are gated by
// the complete Oracle snapshot in the program registry.
import { activeFace as face, cardName as name, isType, changeLife, makeGameToken, addGameCounters, queueGameAbility, shuffleGameLibrary } from "./goldfish-events.js?v=20261020-solo7";
import { goldfishReference as ref, goldfishFindObject as find, moveGoldfishRuleObject as move, sameGoldfishReference } from "./goldfish-objects.js?v=20261020-solo7";
import { engineCandidates, gameManaValue, damage, destroy } from "./goldfish-engine.js?v=20261020-solo7";
import { castGoldfishCard, planGoldfishCastPayment } from "./goldfish-mana.js?v=20261020-solo7";
import { castBlockReason } from "./goldfish-constraints.js?v=20261020-solo7";
import { goldfishKeywords, goldfishCharacteristics } from "./goldfish-rules.js?v=20261020-solo7";
import { TOKENS } from "./goldfish-card-programs.js?v=20261020-solo7";
import { goldfishCardActions } from "./goldfish-action-definitions.js?v=20261020-solo7";
import { activateGoldfishAction, goldfishActionReason } from "./goldfish-actions.js?v=20261020-solo7";
import { advancedStep, advancedChoose } from "./goldfish-advanced-spells.js?v=20261020-solo7";
import { formatPermanentStep, chooseFormatPermanentStep } from "./goldfish-format-permanents.js?v=20261020-solo7";
import { extensionStep, extensionChoose } from "./goldfish-ability-extensions.js?v=20261020-solo7";

const insert = (ctx, ...steps) => ctx.steps.splice(ctx.step + 1, 0, ...steps);
const choice = (state, ctx, data) => { state.rules.pendingChoice = { type: "engine-choice", entryId: ctx.entryId, sourceName: ctx.sourceName, ...data }; };
const notice = (state, text) => (state.rules.notices ||= []).push({ text, serial: state.rules.turnSerial });
export function offerCombatCrew(state) {
  const power = state.battlefield.filter(c => isType(c, "Creature") && !c.tapped).reduce((n, c) => n + Math.max(0, Number(goldfishCharacteristics(state, c).power) + (/crews Vehicles as though its power were 2 greater/.test(c.oracleText) ? 2 : 0)), 0);
  const vehicles = state.battlefield.filter(c => !isType(c, "Creature") && !c.tapped && !(state.rules.offeredCrewIds || []).includes(c.id) && (c.enteredTurn < state.turn || goldfishKeywords(state, c).has("haste")))
    .filter(c => { const action = goldfishCardActions(c).find(a => a.id === "engine:crew"); return action && !goldfishActionReason(state, c, action) && action.costSelect.minPower <= power; });
  if (!vehicles.length) return false;
  state.rules.pendingChoice = { type: "engine-combat-crew", kind: "buttons", sourceName: "攻撃前の搭乗", label: "機体に搭乗してから攻撃しますか？", options: [...vehicles.map(c => ({ value: c.id, label: `${name(c)}に搭乗する` })), { value: "done", label: "このまま攻撃クリーチャーを選ぶ" }] };
  return true;
}
export function chooseCombatCrew(state, answer) {
  const c = state.rules.pendingChoice;
  if (!c.options.some(o => o.value === answer.value)) throw new Error("搭乗する機体を選んでください。");
  state.rules.offeredCrewIds ||= [];
  state.rules.pendingChoice = null;
  if (answer.value === "done") state.rules.offeredCrewIds.push(...c.options.map(o => o.value));
  else {
    state.rules.offeredCrewIds.push(answer.value);
    Object.assign(state, activateGoldfishAction(state, answer.value, "engine:crew"));
  }
  state.rules.resumeCombat = true;
}
const cardTypes = card => (face(card).typeLine || "").match(/\b(?:Artifact|Battle|Creature|Enchantment|Instant|Kindred|Land|Planeswalker|Sorcery)\b/g) || [];
export function distinctCardTypes(cards, used = []) {
  if (!cards.length) return true;
  return cardTypes(cards[0]).some(type => !used.includes(type) && distinctCardTypes(cards.slice(1), [...used, type]));
}
export function effectCastPermission(state, card) {
  const p = state.rules.effectCast;
  return p && p.card.id === card.id && state.rules.automation?.entryId === p.entryId ? p : null;
}
// Declining/canceling returns to the suspended resolving instruction. A child
// spell is put on the stack now, but cannot resolve before its parent finishes.
export function completeEffectCast(state, cast = false) {
  const p = state.rules.effectCast, ctx = state.rules.automation;
  if (!p || !ctx || p.entryId !== ctx.entryId) return;
  if (cast) {
    state.players.self.energy -= p.energy || 0;
    if (p.copy) {
      const spell = state.stack.find(c => c.id === p.card.id);
      if (spell) spell.kind = "copy";
    }
    if (p.budget != null) ctx.vars.copyBudget = p.budget - p.manaValue;
  } else if (p.copy) {
    const c = find(state, p.card);
    if (c) state[p.card.zone] = state[p.card.zone].filter(x => x.id !== c.id);
  } else if (p.declineZone && find(state, p.card)) {
    move(state, p.card.id, p.card.zone, p.declineZone);
  }
  delete state.rules.effectCast;
  state.rules.pendingChoice = null;
  ctx.step++;
}
function offerEffectCast(state, ctx, op) {
  const card = find(state, op.card);
  if (!card || isType(card, "Land")) return;
  const p = { entryId: ctx.entryId, card: ref(card, op.card.zone), energy: op.energy || 0, copy: !!op.copy, budget: op.budget, manaValue: gameManaValue(card), cost: op.cost, declineZone: op.declineZone, flashback: op.flashback };
  state.rules.effectCast = p;
  const plan = planGoldfishCastPayment(state, card, { preview: true });
  const blocked = castBlockReason(state, op.card.zone);
  if (blocked || !plan.payable || state.players.self.energy < p.energy) {
    delete state.rules.effectCast;
    notice(state, `${name(card)}：${blocked || (!plan.payable ? plan.reason : "エネルギーが不足")}。この効果では唱えません。`);
    if (p.copy) state[op.card.zone] = state[op.card.zone].filter(c => c.id !== card.id);
    else if (p.declineZone) move(state, card.id, op.card.zone, p.declineZone);
    return;
  }
  choice(state, ctx, { kind: "buttons", label: `${name(card)}を今唱えますか？${p.cost ? `（${p.cost}）` : p.energy ? `（エネルギー${p.energy}）` : "（マナ・コスト不要）"}`, options: [{ value: "cast", label: "唱える（対象・追加コストを選択）" }, { value: "decline", label: "唱えない" }] });
}

export function runFormatStep(state, ctx, op) {
  if (extensionStep(state, ctx, op)) return true;
  if (advancedStep(state, ctx, op)) return true;
  if (formatPermanentStep(state, ctx, op)) return true;
  const source = find(state, ctx.source);
  switch (op.op) {
    case "requiting-life": if (ctx.cast.format?.cards?.length) changeLife(state, 2); return true;
    case "teamwork-counter": insert(ctx, { op: "counter-unless", cost: ctx.cast.format?.cards?.length ? "{4}" : "{2}" }); return true;
    case "vicious-rivalry": insert(ctx, { op: "sweep", filter: { types: ["Artifact", "Creature"], maxManaValue: ctx.cast.format?.life || 0 } }); return true;
    case "deluge-x": insert(ctx, { op: "shrink-all", amount: ctx.cast.format?.life || 0 }); return true;
    case "cover-up":
      if (ctx.cast.format?.cards?.length) notice(state, "証拠収集済み：相手の墓地のカードを追放し、同名を手札・墓地・山札から任意に追放。相手はシャッフルし、手札から追放した枚数分引く（相手側の領域は省略）");
      return true;
    case "black-sun": {
      const cards = state.battlefield.filter(c => isType(c, "Creature") && gameManaValue(c) <= ctx.x);
      for (const c of cards) { c.lostAbilitiesOriginal = c.automaticAbilities; c.automaticAbilities = false; c.suppressedKeywords = true; }
      for (const c of cards) destroy(state, c);
      return true;
    }
    case "format-modal": {
      const n = ctx.sourceName, m = ctx.cast.mode;
      if (["Abrade", "Hydroblast", "Pyroblast", "Warg Tactics", "Change the Equation"].includes(n) || n === "Boros Charm" && m !== "protect" || ["Iroh's Demonstration", "Witherbloom Charm"].includes(n) && m === "destroy" || n === "Iroh's Demonstration" && m === "damage") insert(ctx, { op: "format-targets" });
      else if (n === "Boros Charm") for (const c of state.battlefield) c.temporaryEffects.push({ keywords: ["indestructible"], turn: state.turn, label: n });
      else if (n === "Witherbloom Charm" && m === "life") changeLife(state, 5);
      else if (n === "Witherbloom Charm") insert(ctx, { op: "select", label: "生け贄にするパーマネント（任意）", zone: "battlefield", filter: { permanent: true }, min: 0, max: 1, destination: "graveyard", reason: "effect-sacrifice" }, { op: "draw-if-selected", count: 2 });
      else if (n === "Split Up") for (const c of [...state.battlefield].filter(c => isType(c, "Creature") && c.tapped === (m === "tapped"))) destroy(state, c);
      else if (n === "Fire Magic") insert(ctx, { op: "damage-sweep", amount: m === "firaga" ? 3 : m === "fira" ? 2 : 1, filter: { types: ["Creature"] } });
      else if (n === "Path of Peril") insert(ctx, { op: "sweep", filter: { types: ["Creature"], ...(m === "cleave" ? {} : { maxManaValue: 2 }) } });
      else notice(state, `${n}：${ctx.cast.mode}のモードを相手側へ適用（相手の領域は省略）`);
      return true;
    }
    case "draw-if-selected": if (ctx.vars.selected?.length) insert(ctx, { op: "draw", count: op.count }); return true;
    case "shrink-all":
      for (const c of state.battlefield.filter(c => isType(c, "Creature"))) c.temporaryEffects.push({ power: -op.amount, toughness: -op.amount, turn: state.turn, label: ctx.sourceName });
      return true;
    case "target-keyword": {
      const c = find(state, ctx.target);
      if (c) c.temporaryEffects.push({ keywords: op.keywords, turn: state.turn, label: ctx.sourceName });
      return true;
    }
    case "fading-hope": {
      const c = find(state, ctx.target);
      if (c) { const small = gameManaValue(c) <= 3; move(state, c.id, "battlefield", "hand"); if (small) insert(ctx, { op: "format-scry", count: 1 }); }
      else if (ctx.target?.virtual) choice(state, ctx, { kind: "buttons", label: "戻した相手のクリーチャーのマナ総量は3以下ですか？", options: [{ value: "yes", label: "はい：占術1" }, { value: "no", label: "いいえ" }] });
      return true;
    }
    case "trollshaws-draw": insert(ctx, { op: "draw", count: ctx.cast.fromZone === "graveyard" ? 2 : 1 }); return true;
    case "tutor-on-top":
      for (const c of ctx.vars.tutored || []) if (find(state, c.ref)) move(state, c.id, c.ref.zone, "libraryTop");
      return true;
    case "edge-search":
      if (state.battlefield.filter(c => isType(c, "Land")).length <= 4) insert(ctx, { op: "select", label: "基本土地をタップ状態で出す", zone: "library", filter: { basicLand: true }, min: 0, max: 1, destination: "battlefield", tapped: true, shuffle: true });
      return true;
    case "seedship-impact": {
      const c = find(state, ctx.target);
      if (c) { const small = gameManaValue(c) <= 2; destroy(state, c); if (small) makeGameToken(state, TOKENS.lander); }
      else if (ctx.target?.virtual) choice(state, ctx, { kind: "buttons", label: "対象のマナ総量は2以下ですか？", options: [{ value: "yes", label: "はい：着陸船を生成" }, { value: "no", label: "いいえ" }] });
      return true;
    }
    case "peer-abyss":
      if (ctx.target?.player === "self") insert(ctx, { op: "draw", count: Math.ceil(state.library.length / 2) }, { op: "lose-half-life" });
      else { changeLife(state, -Math.ceil(state.players.opponent.life / 2), "opponent"); notice(state, "相手は山札の半分（端数切り上げ）を引く（相手の手札は省略）"); }
      return true;
    case "accumulate":
      insert(ctx, { op: "select", label: "上3枚から手札へ", zone: "library", top: 3, filter: {}, min: state.graveyard.filter(c => isType(c, "Lesson")).length >= 3 ? 3 : 1, max: state.graveyard.filter(c => isType(c, "Lesson")).length >= 3 ? 3 : 1, destination: "hand", remainder: "libraryBottom" }); return true;
    case "progress-damage":
      damage(state, { player: "self" }, 2 * state.battlefield.filter(c => isType(c, "Land") && !isType(c, "Basic")).length);
      choice(state, ctx, { kind: "number", label: "相手の基本でない土地の数", min: 0, max: 99 }); return true;
    case "culling-ritual":
      ctx.vars.ritualDestroyed = 0;
      for (const { card: c } of engineCandidates(state, { zone: "battlefield", filter: { permanent: true, notTypes: ["Land"], maxManaValue: 2 } })) { destroy(state, c); if (!state.battlefield.includes(c)) ctx.vars.ritualDestroyed++; }
      choice(state, ctx, { kind: "number", label: "相手側で破壊できたマナ総量2以下のパーマネント数", min: 0, max: 99 }); return true;
    case "go-blank":
      if (ctx.target?.player === "self") insert(ctx, { op: "select", zone: "hand", filter: {}, label: "捨てる手札2枚", min: 2, max: 2, destination: "graveyard" }, { op: "exile-graveyard" });
      else notice(state, "相手は2枚捨て、墓地をすべて追放（相手側の領域は省略）");
      return true;
    case "settle-wreckage":
      if (ctx.target?.player === "self") {
        const attackers = (state.rules.combat?.attackers || []).map(r => find(state, r)).filter(Boolean);
        for (const c of attackers) move(state, c.id, "battlefield", "exile");
        insert(ctx, { op: "select", zone: "library", label: "追放した攻撃クリーチャー数まで基本土地を出す", filter: { basicLand: true }, min: 0, max: attackers.length, destination: "battlefield", tapped: true, shuffle: true });
      } else notice(state, "相手の攻撃クリーチャーをすべて追放。相手はその数まで基本土地をタップ状態で探せる（相手側の領域は省略）");
      return true;
    case "ultima":
      ctx.finishZone = "exile"; state.rules.endTurnEffect = true;
      for (const c of [...state.stack]) if (c.id !== ctx.entryId && c.kind !== "ability") move(state, c.id, "stack", "exile");
      state.stack = state.stack.filter(c => c.id === ctx.entryId);
      state.rules.events = []; state.rules.waitingCastTriggers = []; state.rules.resumeCombat = false; delete state.rules.afterEndStep;
      return true;
    case "salvation":
      state.rules.salvationSerial = state.rules.turnSerial;
      for (const c of state.battlefield) c.temporaryEffects.push({ keywords: ["hexproof"], turn: state.turn, label: ctx.sourceName });
      return true;
    case "no-prevention":
      state.rules.noPreventionSerial = state.rules.turnSerial; return true;
    case "monument": {
      const used = source?.monumentSerial === state.rules.turnSerial ? source.monumentModes || [] : [];
      const options = [{ value: "draw", label: "1枚引く" }, { value: "treasure", label: "宝物を生成" }, { value: "drain", label: "相手は3点失う" }].filter(o => !used.includes(o.value));
      if (options.length) choice(state, ctx, { kind: "buttons", label: "耐久の記念碑：未選択のモード", options });
      return true;
    }
    case "spirit-blink":
      if (source) { const exiled = move(state, source.id, "battlefield", "exile"); if (state.exile.includes(exiled)) (state.rules.delayedSpiritReturns ||= []).push(ref(exiled, "exile")); }
      return true;
    case "theorist-token":
      makeGameToken(state, { name: "Illusion", colors: ["U"], typeLine: "Token Creature — Illusion", power: "1", toughness: "1" }); return true;
    case "theorist-counters":
      for (const c of state.battlefield.filter(c => isType(c, "Creature"))) addGameCounters(state, c, "+1/+1", state.hand.length);
      return true;
    case "empower-jace": {
      if (op.instant) state.rules.jaceInstantSerial = state.rules.turnSerial;
      const tokens = state.battlefield.filter(c => c.kind === "token" && isType(c, "Jace"));
      if (tokens.length > 1) choice(state, ctx, { kind: "cards", label: `忠誠度を${op.count}個置くジェイス・トークン`, min: 1, max: 1, candidates: tokens.map(c => ({ ref: ref(c), label: name(c) })) });
      else addGameCounters(state, tokens[0] || makeGameToken(state, TOKENS.jace)[0], "loyalty", op.count);
      return true;
    }
    case "fatehold":
      if (ctx.cast.mode === "draw") insert(ctx, { op: "draw", count: 1 }, { op: "empower-jace", count: 2 });
      else if (ctx.cast.mode === "return") insert(ctx, { op: "format-targets" });
      else for (const c of state.battlefield.filter(c => isType(c, "Creature"))) c.temporaryEffects.push({ power: 1, toughness: 2, turn: state.turn, label: ctx.sourceName });
      return true;
    case "forth-monarch": state.rules.forthSerial = state.rules.turnSerial; return true;
    case "random-discard":
      if (state.hand.length) move(state, state.hand[Math.floor(Math.random() * state.hand.length)].id, "hand", "graveyard", "discard");
      return true;
    case "shuffle-library": shuffleGameLibrary(state); return true;
    case "echo-eons":
      for (const z of ["hand", "graveyard"]) for (const c of [...state[z]]) move(state, c.id, z, "library");
      shuffleGameLibrary(state); notice(state, "相手も手札と墓地を山札に加えてシャッフルし、7枚引く（相手側の領域は省略）"); return true;
    case "gaea-will": state.rules.gaeaWillSerial = state.rules.turnSerial; return true;
    case "excruciator":
      if (ctx.snapshot.wasCast) {
        for (const c of state.library.slice(6)) { const exiled = move(state, c.id, "library", "exile"); exiled.faceDown = true; }
        state.rules.opponentLibrary = 6;
        notice(state, "相手の山札も下6枚を残して追放。以後、相手ターン開始の通常ドローを追跡");
      }
      return true;
    case "nursery-protection":
      for (const c of state.battlefield.filter(c => isType(c, "Treefolk|Forest"))) c.temporaryEffects.push({ keywords: ["indestructible"], turn: state.turn, label: ctx.sourceName });
      return true;
    case "cavalier-death":
      if (find(state, op.dead) && find(state, ctx.target)) choice(state, ctx, { kind: "buttons", label: "茨の騎兵を追放して、対象を山札の上へ戻しますか？", options: [{ value: "yes", label: "追放して戻す" }, { value: "no", label: "戻さない" }] });
      return true;
    case "greasefang": {
      const c = find(state, ctx.target);
      if (c) {
        const returned = move(state, c.id, "graveyard", "battlefield");
        if (state.battlefield.includes(returned)) {
          returned.temporaryEffects.push({ keywords: ["haste"], turn: state.turn, label: ctx.sourceName });
          (state.rules.delayedVehicleReturns ||= []).push(ref(returned));
        }
      }
      return true;
    }
    case "crew":
      if (source && isType(source, "Vehicle")) {
        source.originalTypeLine ||= source.typeLine;
        source.animated = { serial: state.rules.turnSerial, originalTypeLine: source.typeLine };
        source.typeLine = source.typeLine.replace(/\sCreature\b/, "") + " Creature";
        source.lane = "creature";
      }
      return true;
    case "parhelion-attack":
      for (const c of makeGameToken(state, TOKENS.angel, 2)) state.rules.combat?.attackers.push(ref(c));
      return true;
    case "ninjutsu": {
      const c = find(state, ctx.source);
      if (c) { const entered = move(state, c.id, "hand", "battlefield"); entered.tapped = true; state.rules.combat.attackers.push(ref(entered)); }
      return true;
    }
    case "jeskai-revelation": {
      const r = ctx.cast.returnTarget?.[0], d = ctx.cast.damageTarget?.[0];
      const returned = find(state, r), damaged = find(state, d);
      const validReturn = r?.virtual || returned && (r.zone === "stack" ? returned.kind !== "ability" : !goldfishKeywords(state, returned).has("shroud"));
      const validDamage = d?.player || damaged && isType(damaged, "Creature|Planeswalker|Battle") && !goldfishKeywords(state, damaged).has("shroud");
      if (!validReturn && !validDamage) return true;
      if (validReturn) {
        if (r.virtual) notice(state, "ジェスカイの啓示：相手の対象の呪文／パーマネントを手札へ（相手側の領域は省略）");
        else move(state, r.id, r.zone || "battlefield", "hand");
      }
      if (validDamage) damage(state, d, 4);
      insert(ctx, { op: "token", name: "monk", count: 2 }, { op: "draw", count: 2 }, { op: "life", amount: 4 });
      return true;
    }
    case "ascension-earthbend": {
      const targets = engineCandidates(state, { zone: "battlefield", filter: { types: ["Land"] }, target: true });
      if (targets.length) choice(state, ctx, { kind: "cards", label: "土の技2：クリーチャーにする土地", min: 1, max: 1, candidates: targets.map(({ ref, label }) => ({ ref, label })) });
      return true;
    }
    case "ascension-quest":
      if (source) {
        addGameCounters(state, source, "quest", 1);
        if (source.counters.quest >= 4) queueGameAbility(state, source, "探索4個以上：＋1/＋1・トランプル", [{ op: "ascension-boost" }], { targetSpec: { zone: "battlefield", types: ["Creature"] } });
      }
      return true;
    case "ascension-boost": {
      const target = find(state, ctx.target);
      if (target) { addGameCounters(state, target, "+1/+1", 1); target.temporaryEffects.push({ keywords: ["trample"], turn: state.turn, label: ctx.sourceName }); }
      return true;
    }
    case "raptor-exile":
      if (ctx.snapshot.castFrom === "hand") {
        let card;
        while (state.library.length) { card = move(state, state.library.at(-1).id, "library", "exile"); if (!isType(card, "Land")) break; }
        if (card && !isType(card, "Land")) insert(ctx, { op: "effect-cast", card: ref(card, "exile"), energy: gameManaValue(card) });
      }
      return true;
    case "beseech-cast": {
      const r = ctx.vars.beseech?.[0]?.ref, card = find(state, r);
      if (card && ctx.cast.bargained && !isType(card, "Land") && gameManaValue(card) <= 4) insert(ctx, { op: "effect-cast", card: r });
      return true;
    }
    case "beseech-hand":
      for (const c of ctx.vars.beseech || []) if (find(state, c.ref)) move(state, c.ref.id, c.ref.zone, "hand");
      return true;
    case "effect-cast":
      offerEffectCast(state, ctx, op); return true;
    case "uldaros": {
      const legal = engineCandidates(state, { zone: "graveyard", filter: { notTypes: ["Land"] }, target: true });
      ctx.vars.uldaros = [];
      for (const r of ctx.targets || []) {
        const card = find(state, r);
        if (card && legal.some(c => sameGoldfishReference(c.ref, r))) {
          const exiled = move(state, card.id, "graveyard", "exile");
          const copy = { ...structuredClone(exiled), id: `extra-${state.nextId++}`, kind: "card", incarnation: 0, counters: {}, temporaryEffects: [] };
          state.exile.push(copy); ctx.vars.uldaros.push(ref(copy, "exile"));
        }
      }
      ctx.vars.copyBudget = 6;
      insert(ctx, { op: "uldaros-next" }); return true;
    }
    case "uldaros-next": {
      const candidates = (ctx.vars.uldaros || []).map(r => ({ card: find(state, r), ref: r })).filter(c => c.card && gameManaValue(c.card) <= ctx.vars.copyBudget);
      if (candidates.length) choice(state, ctx, { kind: "buttons", label: `コピーを唱える順番（残りマナ総量${ctx.vars.copyBudget}）`, options: [...candidates.map(c => ({ value: c.card.id, label: `${name(c.card)}（${gameManaValue(c.card)}）` })), { value: "done", label: "残りを唱えず終了" }] });
      else for (const r of ctx.vars.uldaros || []) if (find(state, r)) state.exile = state.exile.filter(c => c.id !== r.id);
      return true;
    }
    default: return false;
  }
}

export function chooseFormatStep(state, ctx, op, answer) {
  if (extensionChoose(state, ctx, op, answer)) return true;
  if (advancedChoose(state, ctx, op, answer)) return true;
  if (chooseFormatPermanentStep(state, ctx, op, answer)) return true;
  if (op.op === "fading-hope") { if (answer.value === "yes") insert(ctx, { op: "format-scry", count: 1 }); return true; }
  if (op.op === "seedship-impact") { if (answer.value === "yes") makeGameToken(state, TOKENS.lander); return true; }
  if (op.op === "progress-damage") { damage(state, { player: "opponent" }, answer.value * 2); return true; }
  if (op.op === "culling-ritual") { const count = ctx.vars.ritualDestroyed + answer.value; if (count) insert(ctx, { op: "mana-choice", colors: ["B", "G"], count }); return true; }
  if (op.op === "monument") {
    const source = find(state, ctx.source);
    if (source) {
      if (source.monumentSerial !== state.rules.turnSerial) { source.monumentSerial = state.rules.turnSerial; source.monumentModes = []; }
      source.monumentModes.push(answer.value);
    }
    if (answer.value === "draw") insert(ctx, { op: "draw", count: 1 });
    if (answer.value === "treasure") makeGameToken(state, TOKENS.treasure);
    if (answer.value === "drain") changeLife(state, -3, "opponent");
    return true;
  }
  if (op.op === "effect-cast") {
    const permission = state.rules.effectCast;
    if (!permission) throw new Error("この効果の詠唱許可がありません。");
    if (answer.value === "decline") { completeEffectCast(state); return "resumed"; }
    if (answer.value !== "cast") throw new Error("唱えるか、唱えないかを選んでください。");
    state.rules.pendingChoice = null;
    const next = castGoldfishCard(state, permission.card.id, { fromExile: permission.card.zone === "exile", fromGraveyard: permission.card.zone === "graveyard", confirmLife: true });
    Object.assign(state, next);
    return "resumed";
  }
  if (op.op === "uldaros-next") {
    if (answer.value === "done") for (const r of ctx.vars.uldaros || []) { if (find(state, r)) state.exile = state.exile.filter(c => c.id !== r.id); }
    else {
      const r = ctx.vars.uldaros.find(r => r.id === answer.value), card = find(state, r);
      if (!card || gameManaValue(card) > ctx.vars.copyBudget) throw new Error("合計マナ総量を6以下にしてください。");
      ctx.vars.uldaros = ctx.vars.uldaros.filter(x => x.id !== r.id);
      insert(ctx, { op: "effect-cast", card: r, copy: true, budget: ctx.vars.copyBudget }, { op: "uldaros-next" });
    }
    return true;
  }
  if (op.op === "empower-jace") { addGameCounters(state, find(state, answer.refs[0]), "loyalty", op.count); return true; }
  if (op.op === "ascension-earthbend") { ctx.target = answer.refs[0]; insert(ctx, { op: "earthbend", count: 2 }); return true; }
  if (op.op === "cavalier-death") { if (answer.value === "yes") { move(state, op.dead.id, "graveyard", "exile"); if (find(state, ctx.target)) move(state, ctx.target.id, "graveyard", "libraryTop"); } return true; }
  return false;
}
