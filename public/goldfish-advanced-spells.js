import { activeFace as face, cardName as name, isType, changeLife, makeGameToken, addGameCounters, queueGameAbility, copiableGoldfishValues, goldfishPlayerTargets } from "./goldfish-events.js?v=20261021-public30h";
import { goldfishReference as ref, goldfishFindObject as find, moveGoldfishRuleObject as move } from "./goldfish-objects.js?v=20261021-public30h";
import { engineCandidates, damage, destroy, gameManaValue, gameColors } from "./goldfish-engine.js?v=20261021-public30h";
import { goldfishCharacteristics } from "./goldfish-rules.js?v=20261021-public30h";
import { goldfishSpellTargets } from "./goldfish-spells.js?v=20261021-public30h";
import { TOKENS } from "./goldfish-card-programs.js?v=20261021-public30h";

const put = (ctx, ...ops) => ctx.steps.splice(ctx.step + 1, 0, ...ops);
const ask = (s, c, data) => { s.rules.pendingChoice = { type: "engine-choice", entryId: c.entryId, sourceName: c.sourceName, ...data }; };
const note = (s, text) => (s.rules.notices ||= []).push({ text, serial: s.rules.turnSerial });
const creature = { zone: "battlefield", types: ["Creature"], virtualOpponent: true };
const spell = { zone: "stack", spell: true, virtualOpponent: true };
const damageTarget = { ...creature, types: ["Creature", "Planeswalker", "Battle"], players: true };
const player = { zone: "none", players: true };
const spree = {
  "Avengers Disassembled": [
    { label: "全クリーチャーに3点", cost: "", effect: "avengers-sweep" },
    { label: "土地を破壊・基本土地をタップ状態で探してもよい", cost: "", spec: { zone: "battlefield", types: ["Land"], virtualOpponent: true }, effect: "avengers-land" }
  ],
  "Three Steps Ahead": [
    { label: "打ち消し {1}{U}", cost: "{1}{U}", spec: spell, effect: "counter" },
    { label: "自分のアーティファクト／クリーチャーをコピー {3}", cost: "{3}", spec: { zone: "battlefield", types: ["Artifact", "Creature"] }, effect: "copy-permanent" },
    { label: "2枚引いて1枚捨てる {2}", cost: "{2}", effect: "loot" }
  ],
  "Requisition Raid": [
    { label: "アーティファクト破壊 {1}", cost: "{1}", spec: { ...creature, types: ["Artifact"] }, effect: "destroy" },
    { label: "エンチャント破壊 {1}", cost: "{1}", spec: { ...creature, types: ["Enchantment"] }, effect: "destroy" },
    { label: "クリーチャー全体に＋1/＋1 {1}", cost: "{1}", spec: player, effect: "team-counters" }
  ],
  "Return the Favor": [
    { label: "呪文／能力をコピー {1}", cost: "{1}", spec: { zone: "stack", copyable: true, virtualOpponent: true }, effect: "copy-stack" },
    { label: "単一の対象を変更 {1}", cost: "{1}", spec: { zone: "stack", singleTarget: true, virtualOpponent: true }, effect: "retarget" }
  ]
};
const confluence = [
  { label: "クリーチャーに＋3/−3", spec: creature, effect: "confluence-pump" },
  { label: "非土地パーマネントを追放してタップ状態で戻す", spec: { ...creature, permanent: true, types: undefined, notTypes: ["Land"] }, effect: "blink" },
  { label: "エルドラージ・末裔を生成", effect: "scion" }
];
function targets(s, spec, card) {
  const result = engineCandidates(s, { ...spec, target: true }, { source: ref(card) }).filter(c => c.card.id !== card.id);
  if (spec.copyable) for (let i = result.length - 1; i >= 0; i--) if (result[i].card.kind !== "ability" && !isType(result[i].card, "Instant|Sorcery")) result.splice(i, 1);
  if (spec.singleTarget) for (let i = result.length - 1; i >= 0; i--) if (!singleTarget(result[i].card)) result.splice(i, 1);
  if (spec.players) result.unshift(...goldfishPlayerTargets(s));
  if (spec.virtualOpponent) result.unshift({ ref: { player: "opponent", virtual: true }, label: "相手の適正な対象（相手側の領域は省略）" });
  return result.map(({ ref, label }) => ({ ref, label }));
}
function singleTarget(c) {
  const data = c.ability || c.cast || {}, refs = [data.target, ...(data.targets || []), ...(data.modeTargets || []), ...(data.returnTarget || []), ...(data.damageTarget || [])].filter(Boolean);
  return refs.length === 1 ? refs[0] : null;
}
export function advancedMana(card, f = {}) {
  return (spree[name(card)] || []).filter((_, i) => f.modes & (1 << i)).map(m => m.cost).join("");
}
export function advancedModes(card, f = {}) {
  if (spree[name(card)]) return spree[name(card)].map((m, i) => ({ ...m, key: `target${i}` })).filter((_, i) => f.modes & (1 << i));
  if (name(card) === "Eldrazi Confluence") return [0, 1, 2].map(i => ({ ...confluence[f[`mode${i}`]], key: `target${i}` }));
  if (name(card) === "Together as One") return [{ spec: player, effect: "converge-draw", key: "player" }, { spec: damageTarget, effect: "converge-damage", key: "damage" }];
  if (["Hard-Hitting Question", "Tail Swipe", "Reckless Rage"].includes(name(card)) || name(card) === "Bushwhack" && f.bushwhack === "fight") return [
    { spec: { ...creature, virtualOpponent: false }, effect: "fight-own", key: "own" },
    { spec: { ...creature, opposingPermanent: true, types: name(card) === "Hard-Hitting Question" ? ["Creature", "Planeswalker"] : ["Creature"] }, effect: "fight-other", key: "other" }
  ];
  return [];
}
export function advancedPreflight(s, card, options) {
  const n = name(card), f = options.format || {};
  if (n === "Bushwhack") {
    if (!f.bushwhack) return { optionKey: "format", formatField: "bushwhack", kind: "buttons", label: "薮打ち：モード", options: [{ value: "land", label: "基本土地を手札へ" }, { value: "fight", label: "自分と相手のクリーチャーを格闘" }] };
    if (!["land", "fight"].includes(f.bushwhack)) throw new Error("薮打ちのモードを選び直してください。");
  }
  if (spree[n]) {
    const list = spree[n], max = (1 << list.length) - 1;
    if (f.modes === undefined) return { optionKey: "format", formatField: "modes", kind: "buttons", label: n === "Avengers Disassembled" ? "1つまたは両方のモードを選ぶ" : "放題：使うモードを選ぶ（表示の追加コストを支払う）", options: Array.from({ length: max }, (_, i) => ({ value: String(i + 1), label: list.filter((_, bit) => (i + 1) & (1 << bit)).map(m => m.label).join(" ＋ ") })) };
    if (!/^[1-7]$/.test(String(f.modes)) || Number(f.modes) > max) throw new Error("放題のモードを選び直してください。");
  }
  if (n === "Eldrazi Confluence") for (let i = 0; i < 3; i++) {
    if (f[`mode${i}`] === undefined) return { optionKey: "format", formatField: `mode${i}`, kind: "buttons", label: `${i + 1}つ目のモード（同じモードも選べる）`, options: confluence.map((m, k) => ({ value: String(k), label: m.label })) };
    if (!/^[0-2]$/.test(String(f[`mode${i}`]))) throw new Error("モードを選び直してください。");
  }
  if (n === "Force of Vigor") {
    const candidates = targets(s, { zone: "battlefield", types: ["Artifact", "Enchantment"], virtualOpponent: true }, card);
    candidates.unshift({ ref: { id: "virtual2", player: "opponent", virtual: true }, label: "相手の2つ目の対象" });
    if (f.vigorTargets === undefined) return { optionKey: "format", formatField: "vigorTargets", kind: "cards", label: "破壊するアーティファクト／エンチャント（0〜2つ）", min: 0, max: 2, candidates };
    if (!Array.isArray(f.vigorTargets) || f.vigorTargets.length > 2 || new Set(f.vigorTargets.map(r => JSON.stringify(r))).size !== f.vigorTargets.length || f.vigorTargets.some(r => !candidates.some(x => JSON.stringify(x.ref) === JSON.stringify(r)))) throw new Error("活性の力の対象を選び直してください。");
  }
  for (const m of advancedModes(card, f)) {
    if (!m.spec) continue;
    const candidates = targets(s, m.spec, card);
    if (!candidates.length) throw new Error("選んだモードの適正な対象がありません。");
    if (f[m.key] === undefined) return { optionKey: "format", formatField: m.key, kind: "cards", label: m.label || m.key === "own" ? m.label || "自分のクリーチャー" : "対象を選ぶ", min: 1, max: 1, candidates };
    if (!Array.isArray(f[m.key]) || f[m.key].length !== 1 || !candidates.some(c => JSON.stringify(c.ref) === JSON.stringify(f[m.key][0]))) throw new Error("対象を選び直してください。");
  }
  return null;
}
const discard = (min, max = min, remember = "selected") => ({ op: "select", label: `捨てる手札（${min}〜${max}枚）`, zone: "hand", filter: {}, min, max, destination: "graveyard", remember });
export const ADVANCED_SPELLS = Object.fromEntries([...Object.keys(spree), "Eldrazi Confluence", "Together as One", "Hard-Hitting Question", "Tail Swipe", "Reckless Rage"].map(n => [n, { steps: [{ op: "advanced-modal" }] }]));
Object.assign(ADVANCED_SPELLS, {
  Bushwhack: { steps: [{ op: "bushwhack" }] },
  "Ancestral Recall": { steps: [{ op: "recall" }], target: player },
  "Stoke Genius": { steps: [{ op: "discard-hand" }, { op: "draw", count: 2 }, { op: "adventure-end" }] },
  "Petty Theft": { steps: [{ op: "bounce" }, { op: "adventure-end" }], target: { zone: "battlefield", permanent: true, notTypes: ["Land"], opposingPermanent: true, virtualOpponent: true } },
  "Charring Bite": { steps: [{ op: "damage", amount: 5 }, { op: "finish-zone", zone: "library" }], target: { ...creature, withoutFlying: true } },
  Rough: { steps: [{ op: "damage-sweep", amount: 2, filter: { types: ["Creature"], withoutFlying: true } }] },
  Tumble: { steps: [{ op: "damage-sweep", amount: 6, filter: { types: ["Creature"], keywords: ["flying"] } }] },
  "All Aboard": { steps: [{ op: "all-aboard" }], target: { ...creature, virtualOpponent: false, notSubtypes: ["Pilot"] } },
  "Force of Vigor": { steps: [{ op: "vigor" }] },
  "Knockout Blow": { steps: [{ op: "damage", amount: 4 }, { op: "life", amount: 2 }], target: { ...creature, attackingOrBlocking: true } },
  "Ill-Timed Explosion": { steps: [{ op: "draw", count: 2 }, { op: "explosion-choice" }] },
  "Decorum Dissertation": { steps: [{ op: "dissertation" }], target: player },
  "Desolation of Smaug": { steps: [{ op: "damage-sweep", amount: 3, filter: { types: ["Creature"], notTypes: ["Dragon"] } }, { op: "dragon-mana" }] },
  "Vision of Love": { steps: [{ op: "vision-love" }] },
  "Invoke Despair": { steps: ["Creature", "Enchantment", "Planeswalker"].map(type => ({ op: "despair", type })), target: { zone: "none", opponentOnly: true } },
  "Academic Dispute": { steps: [{ op: "dispute" }, { op: "learn" }], target: creature },
  "Redcap Melee": { steps: [{ op: "redcap" }], target: { ...creature, types: ["Creature", "Planeswalker"] } },
  "Torch the Tower": { steps: [{ op: "torch" }], target: { ...creature, types: ["Creature", "Planeswalker"] } },
  "Snuff Out": { steps: [{ op: "snuff" }], target: { ...creature, notColors: ["B"] } },
  Massacre: { steps: [{ op: "shrink-all", amount: 2 }] }
});
export function advancedStep(s, c, op) {
  const source = find(s, c.source);
  if (op.op === "bushwhack") {
    put(c, c.cast.format?.bushwhack === "fight" ? { op: "advanced-modal" } : { op: "select", label: "基本土地を手札へ", zone: "library", filter: { basicLand: true }, min: 0, max: 1, destination: "hand", shuffle: true });
    return true;
  }
  if (op.op === "recall") { if (c.target.player === "self") put(c, { op: "draw", count: 3 }); else note(s, "相手は3枚引く"); return true; }
  if (op.op === "discard-hand") { put(c, discard(s.hand.length)); return true; }
  if (op.op === "adventure-end") { c.finishZone = "exile"; c.vars.adventure = true; return true; }
  if (op.op === "all-aboard") { const t = find(s, c.target); if (t) { const ex = move(s, t.id, "battlefield", "exile"); move(s, ex.id, "exile", "battlefield"); } return true; }
  if (op.op === "vigor") { for (const r of c.cast.format?.vigorTargets || []) { const t = find(s, r); if (t && isType(t, "Artifact|Enchantment")) destroy(s, t); } return true; }
  if (op.op === "advanced-modal") {
    const modes = advancedModes(c.snapshot, c.cast.format);
    const targeted = modes.filter(m => m.spec);
    const legal = m => targets(s, m.spec, c.snapshot).some(x => JSON.stringify(x.ref) === JSON.stringify(c.cast.format[m.key]?.[0]));
    if (targeted.length && !targeted.some(legal)) return true;
    put(c, ...modes.filter(m => !m.spec || legal(m)).map(m => ({ op: "advanced-effect", ...m, target: c.cast.format[m.key]?.[0] })), ...(c.sourceName === "Together as One" ? [{ op: "life", amount: (c.cast.colorsSpent || []).length }] : []));
    return true;
  }
  if (op.op === "advanced-effect") {
    const r = op.target, t = find(s, r), effect = op.effect;
    if (effect === "avengers-sweep") put(c, { op: "damage-sweep", amount: 3, filter: { types: ["Creature"] } });
    if (effect === "avengers-land") {
      if (t) {
        destroy(s, t);
        put(c, { op: "select", label: "基本土地をタップ状態で探す（任意）", zone: "library", filter: { basicLand: true }, min: 0, max: 1, destination: "battlefield", tapped: true, shuffle: true });
      } else if (r?.virtual) note(s, "相手の土地を破壊。相手は基本土地を探してタップ状態で出し、山札を切り直してもよい");
    }
    if (effect === "scion") makeGameToken(s, TOKENS.scion);
    if (effect === "loot") put(c, { op: "draw", count: 2 }, discard(1));
    if (effect === "counter") { c.target = r; put(c, { op: "counter-target" }); }
    if (effect === "destroy" && t) destroy(s, t);
    if (effect === "copy-permanent" && t) {
      makeGameToken(s, copiableGoldfishValues(t));
    }
    if (effect === "team-counters" && r.player === "self") for (const creature of s.battlefield.filter(x => isType(x, "Creature"))) addGameCounters(s, creature, "+1/+1", 1);
    if (effect === "confluence-pump" && t) t.temporaryEffects.push({ power: 3, toughness: -3, turn: s.turn, label: c.sourceName });
    if (effect === "blink" && t) { const exiled = move(s, t.id, "battlefield", "exile"); const entered = move(s, exiled.id, "exile", "battlefield"); entered.tapped = true; }
    if (effect === "converge-draw") { if (r.player === "self") put(c, { op: "draw", count: (c.cast.colorsSpent || []).length }); else note(s, `相手は${(c.cast.colorsSpent || []).length}枚引く`); }
    if (effect === "converge-damage") damage(s, r, (c.cast.colorsSpent || []).length);
    if (effect === "fight-own") {
      if (t && c.sourceName === "Tail Swipe" && s.rules.activePlayer === "self" && (!s.rules.combat || s.rules.combat.stage === "done")) t.temporaryEffects.push({ power: 1, toughness: 1, turn: s.turn, label: c.sourceName });
      if (t) c.vars.fighter = r;
    }
    if (effect === "fight-other" && find(s, c.vars.fighter)) {
      const own = find(s, c.vars.fighter), power = Number(goldfishCharacteristics(s, own).power);
      damage(s, r, c.sourceName === "Reckless Rage" ? 4 : power);
      if (c.sourceName === "Reckless Rage") damage(s, c.vars.fighter, 2);
      if (["Tail Swipe", "Bushwhack"].includes(c.sourceName)) {
        if (t) damage(s, c.vars.fighter, Number(goldfishCharacteristics(s, t).power));
        else if (r?.virtual) ask(s, c, { kind: "number", label: "格闘する相手クリーチャーのパワー", min: 0, max: 999 });
      }
    }
    if (effect === "copy-stack" || effect === "retarget") {
      if (t) {
        const copy = effect === "copy-stack" ? { ...structuredClone(t), id: `copy-${s.nextId++}`, kind: t.kind === "ability" ? "ability" : "copy" } : t;
        if (effect === "copy-stack") (c.vars.stormCopies ||= []).push(copy);
        c.vars.retarget = effect === "copy-stack" ? { copyId: copy.id } : ref(t, "stack");
        const opts = copy.kind === "ability" ? (copy.ability.targetSpec ? targets(s, copy.ability.targetSpec, c.snapshot) : []) : goldfishSpellTargets(s, copy);
        if (singleTarget(copy) && opts.length) ask(s, c, { kind: "copy-target", label: effect === "copy-stack" ? "コピーの対象（元の対象も選べる）" : "変更する対象", candidates: opts.map(({ ref, label }) => ({ ref, label })) });
      } else note(s, "相手の呪文／能力のコピーや対象変更には、そのスタックの情報が必要です。相手のスタックは省略中です。");
    }
    return true;
  }
  if (op.op === "explosion-choice") {
    if (s.hand.length >= 2) ask(s, c, { kind: "buttons", label: "手札を2枚捨てて全体ダメージを誘発させますか？", options: [{ value: "yes", label: "2枚捨てる" }, { value: "no", label: "捨てない" }] });
    return true;
  }
  if (op.op === "explosion-trigger") {
    if (c.vars.explosion.length === 2) queueGameAbility(s, c.snapshot, "捨てた最大マナ総量の全体ダメージ", [{ op: "damage-sweep", amount: Math.max(...c.vars.explosion.map(gameManaValue)), filter: { types: ["Creature"] } }]);
    return true;
  }
  if (op.op === "dissertation") {
    if (c.target.player === "self") put(c, { op: "draw", count: 2 }, { op: "life", amount: -2 });
    else { changeLife(s, -2, "opponent"); note(s, "相手は2枚引く"); }
    c.finishZone = "exile"; s.rules.paradigms ||= {}; s.rules.paradigms[c.sourceName] ||= structuredClone(c.snapshot);
    return true;
  }
  if (op.op === "paradigm-copy") {
    const copy = { ...structuredClone(op.card), id: `extra-${s.nextId++}`, kind: "card", incarnation: 0 };
    delete copy.cast; s.exile.push(copy); put(c, { op: "effect-cast", card: ref(copy, "exile"), copy: true }); return true;
  }
  if (op.op === "dragon-mana") { ask(s, c, { kind: "mana", label: "ドラゴン呪文専用の4マナ", count: 4 }); return true; }
  if (op.op === "vision-love") {
    ask(s, c, { kind: "buttons", label: "生け贄か手札を捨てて2枚引く", options: [{ value: "no", label: "何もしない" }, ...(s.hand.length ? [{ value: "discard", label: "手札1枚を捨てる" }] : []), ...(s.battlefield.some(x => isType(x, "Artifact")) ? [{ value: "sacrifice", label: "アーティファクトを生け贄" }] : [])] }); return true;
  }
  if (op.op === "despair") { ask(s, c, { kind: "buttons", label: `相手は${op.type}を生け贄にできますか？`, options: [{ value: "no", label: "できない：2点失い、自分は1枚引く" }, { value: "yes", label: "生け贄にした" }] }); return true; }
  if (op.op === "dispute") { if (find(s, c.target)) ask(s, c, { kind: "buttons", label: "対象に到達を与えますか？", options: [{ value: "yes", label: "到達を与える" }, { value: "no", label: "与えない" }] }); return true; }
  if (op.op === "learn") {
    ask(s, c, { kind: "buttons", label: "履修", options: [{ value: "no", label: "何もしない" }, ...(s.sideboard.some(x => isType(x, "Lesson")) ? [{ value: "lesson", label: "サイドボードから講義を手札へ" }] : []), ...(s.hand.length ? [{ value: "loot", label: "1枚捨てて1枚引く" }] : [])] }); return true;
  }
  if (op.op === "redcap") {
    const t = find(s, c.target);
    damage(s, c.target, 4);
    if (t && !gameColors(t, s).includes("R")) put(c, { op: "redcap-land" });
    else if (c.target.virtual) ask(s, c, { kind: "buttons", label: "ダメージを与えた相手のパーマネントは赤ですか？", options: [{ value: "red", label: "赤" }, { value: "nonred", label: "赤ではない：土地を生け贄" }] });
    return true;
  }
  if (op.op === "redcap-land") { put(c, { op: "select", label: "生け贄にする土地", zone: "battlefield", filter: { types: ["Land"] }, min: 1, max: 1, destination: "graveyard", reason: "effect-sacrifice" }); return true; }
  if (op.op === "torch") {
    const t = find(s, c.target);
    if (t) t.exileOnDeathSerial = s.rules.turnSerial;
    damage(s, c.target, c.cast.format?.cards?.length ? 3 : 2);
    if (c.cast.format?.cards?.length) put(c, { op: "format-scry", count: 1 });
    return true;
  }
  if (op.op === "snuff") { const t = find(s, c.target); if (t) { t.regeneration = 0; destroy(s, t); } return true; }
  return false;
}
export function advancedChoose(s, c, op, a) {
  if (op.op === "advanced-effect" && op.effect === "fight-other") { damage(s, c.vars.fighter, a.value); return true; }
  if (op.op === "advanced-effect" && ["copy-stack", "retarget"].includes(op.effect)) {
    const t = c.vars.retarget.copyId ? c.vars.stormCopies.find(x => x.id === c.vars.retarget.copyId) : find(s, c.vars.retarget);
    if (t) {
      const data = t.ability || t.cast;
      if (data.target) data.target = a.target;
      else for (const key of ["targets", "modeTargets", "returnTarget", "damageTarget"]) if (data[key]?.length) data[key] = [a.target];
    }
    return true;
  }
  if (op.op === "explosion-choice") { if (a.value === "yes") put(c, discard(2, 2, "explosion"), { op: "explosion-trigger" }); return true; }
  if (op.op === "vision-love") { if (a.value !== "no") put(c, a.value === "discard" ? discard(1) : { op: "select", label: "生け贄にするアーティファクト", zone: "battlefield", filter: { types: ["Artifact"] }, min: 1, max: 1, destination: "graveyard", reason: "effect-sacrifice" }, { op: "draw", count: 2 }); return true; }
  if (op.op === "despair") { if (a.value === "no") { changeLife(s, -2, "opponent"); put(c, { op: "draw", count: 1 }); } return true; }
  if (op.op === "dispute") { const t = find(s, c.target); if (t && a.value === "yes") t.temporaryEffects.push({ keywords: ["reach"], turn: s.turn, label: c.sourceName }); return true; }
  if (op.op === "learn") { if (a.value === "lesson") put(c, { op: "select", label: "講義を手札へ", zone: "sideboard", filter: { types: ["Lesson"] }, min: 1, max: 1, destination: "hand" }); if (a.value === "loot") put(c, discard(1), { op: "draw", count: 1 }); return true; }
  if (op.op === "redcap") { if (a.value === "nonred") put(c, { op: "redcap-land" }); return true; }
  if (op.op === "dragon-mana") { for (const color of a.colors) (s.rules.restrictedMana ||= []).push({ restriction: "creature:Dragon", pool: { [color]: 1 } }); return true; }
  return false;
}
