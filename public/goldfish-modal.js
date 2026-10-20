import { verifiedGoldfishCard } from "./goldfish-card-programs.js?v=20261021-public30l";
import { cardName, isType, goldfishPlayerTargets } from "./goldfish-events.js?v=20261021-public30l";
import { engineCandidates } from "./goldfish-engine.js?v=20261021-public30l";
import { sameGoldfishReference } from "./goldfish-objects.js?v=20261021-public30l";
import { goldfishCastingCost } from "./goldfish-mana.js?v=20261021-public30l";
import { FORMAT_MODES, formatTargetSpec } from "./goldfish-format-programs.js?v=20261021-public30l";
import { extraFormatCostChoice } from "./goldfish-extra-costs.js?v=20261021-public30l";
import { advancedPreflight } from "./goldfish-advanced-spells.js?v=20261021-public30l";

// Extra text, modes and additional costs are declared before any payment. The
// draft is serializable; cancellation never exiles a card or taps a source.
export function extraCastChoice(state, card, options) {
  if (!verifiedGoldfishCard(card)) return null;
  const name = cardName(card), ctx = { source: { id: card.id }, x: options.x };
  const additional = extraFormatCostChoice(state, card, options.format);
  if (additional) return additional;
  const advanced = advancedPreflight(state, card, options);
  if (advanced) return advanced;
  if (name === "Jeskai Revelation") {
    for (const [key, label, spec] of [
      ["returnTarget", "手札に戻す呪文／パーマネント", { zone: ["stack", "battlefield"], spell: true, virtualOpponent: true }],
      ["damageTarget", "4点ダメージを与える対象", { zone: "battlefield", types: ["Creature", "Planeswalker", "Battle"], players: true, virtualOpponent: true }]
    ]) {
      const candidates = engineCandidates(state, { ...spec, target: true }, ctx).map(({ ref, label }) => ({ ref, label }));
      candidates.unshift({ ref: { player: "opponent", virtual: true }, label: "相手の適正な対象（領域は省略）" });
      if (spec.players) candidates.unshift(...goldfishPlayerTargets(state));
      if (options[key] === undefined) return { optionKey: key, kind: "cards", label, min: 1, max: 1, candidates };
      if (!Array.isArray(options[key]) || options[key].length !== 1 || !candidates.some(c => JSON.stringify(c.ref) === JSON.stringify(options[key][0]))) throw new Error("適正な対象を選び直してください。");
    }
  }
  if (FORMAT_MODES[name]) {
    const modes = FORMAT_MODES[name];
    if (options.mode === undefined) return { optionKey: "mode", kind: "buttons", label: "モードを選ぶ", options: modes };
    if (!modes.some(m => m.value === options.mode)) throw new Error("適正なモードを選んでください。");
  }
  if (name === "Cyclonic Rift" && options.mode === "overload" && (state.rules.effectCast || options.fromGraveyard || options.fromExile && (card.playPermission?.free || card.playPermission?.kind === "plot"))) throw new Error("別の代替コストと超過を同時に使うことはできません。");
  const spec = formatTargetSpec(name, options);
  if (spec) {
    const candidates = engineCandidates(state, { ...spec, target: true }, ctx).map(({ ref, label }) => ({ ref, label }));
    if (spec.virtualOpponent) candidates.unshift({ ref: { player: "opponent", virtual: true }, label: "相手の適正な対象（領域は省略）" });
    if (spec.players) candidates.unshift(...goldfishPlayerTargets(state));
    if (candidates.length < spec.min) throw new Error("このモードの適正な対象がありません。コストは支払っていません。");
    if (options.modeTargets === undefined) return { optionKey: "modeTargets", kind: "cards", label: `対象を${spec.min}〜${spec.max}つ選ぶ`, min: spec.min, max: Math.min(spec.max, candidates.length), candidates };
    const refs = options.modeTargets;
    if (!Array.isArray(refs) || refs.length < spec.min || refs.length > spec.max || new Set(refs.map(r => JSON.stringify(r))).size !== refs.length || refs.some(r => !candidates.some(c => JSON.stringify(c.ref) === JSON.stringify(r)))) throw new Error("異なる適正な対象を選んでください。");
  }
  if (name === "Winternight Stories" && options.fromGraveyard && !card.grantedCast) {
    const candidates = engineCandidates(state, { zone: "battlefield", filter: { types: ["Creature"], untapped: true } }).map(({ ref, label }) => ({ ref, label }));
    if (options.harmonizeTap === undefined && candidates.length) return { optionKey: "harmonizeTap", kind: "cards", label: "調和：タップするクリーチャー（0〜1体・パワー分の不特定マナを軽減）", min: 0, max: 1, candidates };
    const refs = options.harmonizeTap || [];
    if (!Array.isArray(refs) || refs.length > 1 || refs.some(r => !candidates.some(c => sameGoldfishReference(c.ref, r)))) throw new Error("調和でタップするクリーチャーを選び直してください。");
  } else if (options.harmonizeTap?.length) throw new Error("この唱え方では調和のタップを使えません。");
  if (name === "Beseech the Mirror") {
    const candidates = engineCandidates(state, { zone: "battlefield", filter: { bargain: true } }).map(({ ref, label }) => ({ ref, label }));
    if (options.costCards === undefined) return { optionKey: "costCards", kind: "cards", label: "協約：生け贄にするアーティファクト・エンチャント・トークン（任意）", min: 0, max: Math.min(1, candidates.length), candidates };
    if (!Array.isArray(options.costCards) || options.costCards.length > 1 || options.costCards.some(r => !candidates.some(c => sameGoldfishReference(c.ref, r)))) throw new Error("協約の生け贄を選び直してください。");
  } else if (["Bitter Triumph", "Crop Rotation"].includes(name)) {
    if (name === "Bitter Triumph") {
      const modes = [...(state.hand.some(c => c.id !== card.id) ? [{ value: "discard", label: "手札1枚を捨てる" }] : []), ...(state.players.self.life >= 3 ? [{ value: "life", label: "3ライフを支払う" }] : [])];
      if (!modes.length) throw new Error("捨てる手札も、支払う3ライフもありません。");
      if (options.extraCost === undefined) return { optionKey: "extraCost", kind: "buttons", label: "追加コストを選ぶ", options: modes };
      if (!modes.some(m => m.value === options.extraCost)) throw new Error("追加コストを選び直してください。");
    }
    if (name === "Crop Rotation" || options.extraCost === "discard") {
      const zone = name === "Crop Rotation" ? "battlefield" : "hand";
      const candidates = engineCandidates(state, { zone, filter: { ...(zone === "battlefield" ? { types: ["Land"] } : {}), excludeSelf: true } }, ctx).map(({ ref, label }) => ({ ref, label }));
      if (!candidates.length) throw new Error("追加コストに使えるカードがありません。");
      if (options.costCards === undefined) return { optionKey: "costCards", kind: "cards", label: zone === "hand" ? "捨てる手札" : "生け贄にする土地", min: 1, max: 1, candidates };
      if (!Array.isArray(options.costCards) || options.costCards.length !== 1 || !candidates.some(c => sameGoldfishReference(c.ref, options.costCards[0]))) throw new Error("追加コストを選び直してください。");
    } else if (options.costCards?.length) throw new Error("ライフで支払う場合、カードは捨てません。");
  } else if (options.costCards?.length || options.extraCost !== undefined) throw new Error("このカードにはその追加コストを使えません。");
  if (["Murktide Regent", "Treasure Cruise", "Dig Through Time"].includes(name)) {
    const candidates = engineCandidates(state, { zone: "graveyard", filter: { excludeSelf: true } }, ctx).map(({ ref, label }) => ({ ref, label }));
    const generic = Number(goldfishCastingCost(card, { ...options, state, delve: [] }).match(/\{(\d+)\}/)?.[1] || 0);
    if (options.delve === undefined && candidates.length && generic) return { optionKey: "delve", kind: "cards", label: "探査：墓地から追放するカード（1枚で不特定1マナ）", min: 0, max: Math.min(generic, candidates.length), candidates };
    const refs = options.delve || [];
    if (!Array.isArray(refs) || refs.length > generic || new Set(refs.map(r => r.id)).size !== refs.length || refs.some(r => !candidates.some(c => sameGoldfishReference(c.ref, r)))) throw new Error("探査で追放するカードを選び直してください。");
  } else if (options.delve?.length) throw new Error("このカードには探査を使えません。");
  if (options.fuse) {
    if (!["Wear", "Tear"].includes(name) || options.fromExile || options.fromGraveyard) throw new Error("融合は手札の摩耗／損耗だけで使えます。");
    for (const [optionKey, type] of [["fuseArtifact", "Artifact"], ["fuseEnchantment", "Enchantment"]]) {
      const candidates = engineCandidates(state, { zone: "battlefield", filter: { types: [type] }, target: true }).map(({ ref, label }) => ({ ref, label }));
      candidates.unshift({ ref: { id: "virtual", player: "opponent", virtual: true }, label: "相手の適正な対象（領域は省略）" });
      if (options[optionKey] === undefined) return { optionKey, kind: "cards", label: type === "Artifact" ? "摩耗：アーティファクトを選ぶ" : "損耗：エンチャントを選ぶ", min: 1, max: 1, candidates };
      if (options[optionKey].length !== 1 || !candidates.some(c => sameGoldfishReference(c.ref, options[optionKey][0]))) throw new Error("融合の対象を選び直してください。");
    }
  }
  const cards = (field, label, zone, filter) => {
    const candidates = engineCandidates(state, { zone, filter }, ctx).map(({ ref, label }) => ({ ref, label }));
    const selected = options[field];
    if (selected === undefined && candidates.length) return { optionKey: field, kind: "cards", label, min: 0, max: candidates.length, candidates };
    if (selected !== undefined && (!Array.isArray(selected) || new Set(selected.map(r => r.id)).size !== selected.length || selected.some(r => !candidates.some(c => sameGoldfishReference(c.ref, r))))) throw new Error("追加コスト・連繋に使うカードを選び直してください。");
    return null;
  };
  if (isType(card, "Arcane")) {
    const choice = cards("splice", "連繋する捨て身の儀式（手札に残る・各{1}{R}を追加）", "hand", { sameName: "Desperate Ritual", excludeSelf: true });
    if (choice) return choice;
  } else if (options.splice?.length) throw new Error("このカードに秘儀への連繋はできません。");
  if (name === "March of Otherworldly Light") {
    const choice = cards("pitch", "追放する白い手札（1枚ごとに{2}軽減・0枚も可）", "hand", { color: "W", excludeSelf: true });
    if (choice) return choice;
  }
  if (name === "Consign to Memory") {
    if (options.replicate === undefined) return { optionKey: "replicate", kind: "number", label: "複製の回数（1回につき{1}追加）", min: 0, max: 20 };
    if (!Number.isInteger(options.replicate) || options.replicate < 0 || options.replicate > 20) throw new Error("複製回数は0〜20で選んでください。");
  }
  if (["Brotherhood's End", "Warping Wail"].includes(name)) {
    const modes = name === "Brotherhood's End" ? [{ value: "damage", label: "全クリーチャー・PWに3点" }, { value: "artifacts", label: "マナ総量3以下の全アーティファクトを破壊" }] : [{ value: "exile", label: "パワーかタフネス1以下のクリーチャーを追放" }, { value: "counter", label: "ソーサリーを打ち消す" }, { value: "scion", label: "エルドラージ・末裔を生成" }];
    if (options.mode === undefined) return { optionKey: "mode", kind: "buttons", label: "モードを選ぶ", options: modes };
    if (!modes.some(m => m.value === options.mode)) throw new Error("適正なモードを選んでください。");
    if (name === "Warping Wail" && options.mode !== "scion") {
      const candidates = engineCandidates(state, { zone: options.mode === "counter" ? "stack" : "battlefield", filter: { types: [options.mode === "counter" ? "Sorcery" : "Creature"], smallCreature: options.mode === "exile" }, target: true }).map(({ ref, label }) => ({ ref, label }));
      candidates.unshift({ ref: { id: "virtual", player: "opponent", virtual: true }, label: "相手の適正な対象（領域は省略）" });
      if (options.modeTargets === undefined) return { optionKey: "modeTargets", kind: "cards", label: "対象を選ぶ", min: 1, max: 1, candidates };
      if (options.modeTargets.length !== 1 || !candidates.some(c => sameGoldfishReference(c.ref, options.modeTargets[0]))) throw new Error("適正な対象を選んでください。");
    }
  }
  if (name === "Thraben Charm") {
    if (!options.mode) return { optionKey: "mode", kind: "buttons", label: "スレイベンの魔除け：モード", options: [{ value: "damage", label: "クリーチャー数の2倍のダメージ" }, { value: "enchantment", label: "エンチャントを破壊" }, { value: "graveyards", label: "選んだプレイヤーの墓地を追放" }] };
    if (!["damage", "enchantment", "graveyards"].includes(options.mode)) throw new Error("モードが不正です。");
    if (options.mode === "graveyards") {
      if (options.gravePlayers === undefined) return { optionKey: "gravePlayers", kind: "cards", label: "墓地を追放するプレイヤー（0〜2人）", min: 0, max: 2, candidates: [{ ref: { id: "self", player: "self" }, label: "自分" }, { ref: { id: "opponent", player: "opponent" }, label: "相手（仮想）" }] };
      if (!Array.isArray(options.gravePlayers) || options.gravePlayers.length > 2 || new Set(options.gravePlayers.map(r => r.player)).size !== options.gravePlayers.length || options.gravePlayers.some(r => !["self", "opponent"].includes(r.player))) throw new Error("プレイヤーを選んでください。");
    } else {
      const candidates = engineCandidates(state, { zone: "battlefield", filter: { types: [options.mode === "damage" ? "Creature" : "Enchantment"] }, target: true }).map(({ ref, label }) => ({ ref, label }));
      candidates.unshift({ ref: { id: "virtual", player: "opponent", virtual: true }, label: "相手の適正な対象（領域は省略）" });
      if (!candidates.length) throw new Error("このモードの対象がありません。モードを選び直してください。");
      if (options.modeTargets === undefined) return { optionKey: "modeTargets", kind: "cards", label: "対象を選ぶ", min: 1, max: 1, candidates };
      if (options.modeTargets.length !== 1 || !candidates.some(c => sameGoldfishReference(c.ref, options.modeTargets[0]))) throw new Error("適正な対象を選んでください。");
    }
  }
  return null;
}

// A Command's modes and targets are locked before costs and cast triggers.
export function commandCastChoice(state, card, x, command) {
  if (!verifiedGoldfishCard(card) || cardName(card) !== "Kozilek's Command") return null;
  const modes = ["spawn", "scry", "creature", "grave"];
  if (!command?.modes) return { field: "modes", kind: "buttons", label: "モードを2つ選ぶ", multiple: 2, options: [
    { value: "spawn", label: `落とし子${x}体` }, { value: "scry", label: `占術${x}・1枚引く` },
    { value: "creature", label: `マナ総量${x}以下のクリーチャーを追放` }, { value: "grave", label: `墓地から最大${x}枚を追放` }
  ] };
  if (!Array.isArray(command.modes) || command.modes.length !== 2 || new Set(command.modes).size !== 2 || command.modes.some(m => !modes.includes(m))) throw new Error("異なるモードを2つ選んでください。");
  for (const mode of modes.filter(m => command.modes.includes(m))) {
    if (["spawn", "scry"].includes(mode)) {
      if (command[mode] === undefined) return { field: mode, kind: "buttons", label: mode === "spawn" ? "落とし子を出すプレイヤー" : "占術して引くプレイヤー", options: [{ value: "self", label: "自分" }, { value: "opponent", label: "相手（仮想）" }] };
      if (!["self", "opponent"].includes(command[mode])) throw new Error("プレイヤーを選んでください。");
    } else {
      const candidates = engineCandidates(state, { zone: mode === "creature" ? "battlefield" : "graveyard", filter: mode === "creature" ? { types: ["Creature"], maxManaValue: x } : {}, target: true });
      const min = mode === "creature" ? 1 : 0, max = mode === "creature" ? 1 : x;
      if (min && !candidates.length) throw new Error("追放できるクリーチャーがいません。モードを選び直してください。");
      if (command[mode] === undefined) return { field: mode, kind: "cards", label: "追放の対象を選ぶ", min, max, candidates: candidates.map(({ ref, label }) => ({ ref, label })) };
      const selected = command[mode];
      if (!Array.isArray(selected) || selected.length < min || selected.length > max || new Set(selected.map(r => r.id)).size !== selected.length || selected.some(r => !candidates.some(c => sameGoldfishReference(c.ref, r)))) throw new Error("適正な対象を選んでください。");
    }
  }
  return null;
}
