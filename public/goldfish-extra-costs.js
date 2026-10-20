import { cardName, isType, addGameCounters, changeLife } from "./goldfish-events.js?v=20261021-public30g";
import { engineCandidates, gameManaValue, gameLandTypes } from "./goldfish-engine.js?v=20261021-public30g";
import { goldfishFindObject as find, moveGoldfishRuleObject as move, sameGoldfishReference } from "./goldfish-objects.js?v=20261021-public30g";
import { goldfishCharacteristics } from "./goldfish-rules.js?v=20261021-public30g";

export const EXTRA_COST_SPELLS = new Set(["Demand Answers", "Requiting Hex", "We Say Thee Nay!", "Countersculpt", "Fanatical Offering", "Deadly Dispute", "Stir Up Trouble", "Deadly Precision", "Vicious Rivalry", "Toxic Deluge", "Deadly Cover-Up", "Torch the Tower", "Rottenmouth Viper"]);
export function extraFormatCostChoice(state, card, format = {}) {
  const name = cardName(card);
  if (format.freeCast === "yes" && (!state.hand.some(c=>c.id===card.id) || state.rules.effectCast)) throw new Error("この唱え方に代替コストを重ねて支払うことはできません。");
  if (["Snuff Out", "Massacre", "Force of Vigor"].includes(name) && state.hand.some(c=>c.id===card.id) && !state.rules.effectCast) {
    const swamp = state.battlefield.some(c=>gameLandTypes(state,c).includes("Swamp"));
    const green = engineCandidates(state,{zone:"hand",filter:{color:"G"}}).filter(c=>c.card.id!==card.id).map(({ref,label})=>({ref,label}));
    const available = name === "Force of Vigor" ? state.rules.activePlayer === "opponent" && green.length : swamp;
    if (format.freeCast === undefined && available) return {optionKey:"format",formatField:"freeCast",kind:"buttons",label:"通常か代替コストを選ぶ",options:[{value:"no",label:"通常のマナで唱える"},{value:"yes",label:name==="Snuff Out"?"沼をコントロール：4ライフ":name==="Massacre"?"相手に平地がある：マナを払わず唱える":"相手ターン：緑の手札1枚を追放"}]};
    if (format.freeCast === "yes") {
      if (!available) throw new Error("この代替コストの条件を満たしていません。");
      if (name === "Snuff Out" && state.players.self.life < 4) throw new Error("4ライフを支払えません。");
      if (name === "Force of Vigor") {
        if (format.pitch === undefined) return {optionKey:"format",formatField:"pitch",kind:"cards",label:"追放する緑の手札",min:1,max:1,candidates:green};
        if (!Array.isArray(format.pitch)||format.pitch.length!==1||!green.some(c=>sameGoldfishReference(c.ref,format.pitch[0]))) throw new Error("別の緑の手札1枚を選んでください。");
      }
    }
    return null;
  }
  const extras = {
    "Overlord of the Balemurk": ["impending", "兆候5で唱える {1}{B}", "通常のコスト {3}{B}{B}"],
    "Starscape Cleric": ["offspring", "新生の追加{2}{B}を払う", "新生を使わない"],
    "Scrapshooter": ["gift", "相手にカード1枚を贈り、登場時に破壊", "贈り物を約束しない"]
  };
  if (extras[name]) {
    const [key, yes, no] = extras[name];
    if (format[key] === undefined) return { optionKey: "format", formatField: key, kind: "buttons", label: "唱え方を選ぶ", options: [{ value: "no", label: no }, { value: "yes", label: yes }] };
    if (!["yes", "no"].includes(format[key])) throw new Error("唱え方を選び直してください。");
  }
  if (!EXTRA_COST_SPELLS.has(name)) return null;
  if (["Vicious Rivalry", "Toxic Deluge"].includes(name)) {
    if (format.life === undefined) return { optionKey: "format", formatField: "life", kind: "number", label: "追加コスト：支払うライフ（X）", min: 0, max: Math.min(99, state.players.self.life) };
    if (!Number.isInteger(format.life) || format.life < 0 || format.life > state.players.self.life || format.life > 99) throw new Error("支払うライフを選び直してください。");
    return null;
  }
  const definitions = {
    "Demand Answers": { zone: ["hand", "battlefield"], filter: {}, min: 1, label: "追加コスト：捨てる手札1枚、または生け贄にするアーティファクト1つ" },
    "Requiting Hex": { zone: "battlefield", filter: { types: ["Creature"] }, label: "枯朽1：−1/−1カウンターを置くクリーチャー（任意）", min: 0, max: 1 },
    "We Say Thee Nay!": { zone: "battlefield", filter: { types: ["Creature"], untapped: true }, label: "協力2：タップするクリーチャー（任意・合計パワー2以上）", min: 0, max: 99 },
    Countersculpt: { zone: ["hand", "battlefield"], filter: { types: ["Jace"] }, label: "目撃：ジェイスを選ぶ（選ばない場合は追加{1}）", min: 0, max: 1 },
    "Deadly Cover-Up": { zone: "graveyard", filter: {}, label: "証拠収集6：追放する墓地のカード（任意）", min: 0, max: 99 },
    "Torch the Tower": { zone: "battlefield", filter: { bargain: true }, label: "協約：生け贄にするカード（任意）", min: 0, max: 1 },
    "Rottenmouth Viper": { zone: "battlefield", filter: { permanent: true, notTypes: ["Land"] }, label: "生け贄にする非土地（1つにつき{1}軽減・任意）", min: 0, max: 99 },
    "Fanatical Offering": { min: 1 }, "Deadly Dispute": { min: 1 }, "Stir Up Trouble": { min: 0 }, "Deadly Precision": { min: 0 }
  };
  const d = { zone: "battlefield", filter: { types: ["Artifact", "Creature"] }, max: 1, label: ["Stir Up Trouble", "Deadly Precision"].includes(name) ? "生け贄（選ばない場合は追加{4}）" : "追加コスト：生け贄にするアーティファクト／クリーチャー", ...definitions[name] };
  const candidates = engineCandidates(state, d).filter(c => c.card.id !== card.id)
    .filter(c => name !== "Demand Answers" || c.ref.zone === "hand" || isType(c.card, "Artifact"))
    .map(({ ref, label }) => ({ ref, label: name === "Demand Answers" ? `${ref.zone === "hand" ? "捨てる" : "生け贄"}：${label}` : label }));
  if (candidates.length < d.min) throw new Error("追加コストに使えるカードがありません。");
  if (format.cards === undefined) return { optionKey: "format", formatField: "cards", kind: "cards", label: d.label, min: d.min, max: Math.min(d.max, candidates.length), candidates };
  const refs = format.cards;
  if (!Array.isArray(refs) || refs.length < d.min || refs.length > d.max || new Set(refs.map(r => r.id)).size !== refs.length || refs.some(r => !candidates.some(c => sameGoldfishReference(c.ref, r)))) throw new Error("追加コストのカードを選び直してください。");
  if (name === "We Say Thee Nay!" && refs.length && refs.reduce((n, r) => n + Number(goldfishCharacteristics(state, find(state, r)).power), 0) < 2) throw new Error("協力2は合計パワー2以上で支払います。");
  if (name === "Deadly Cover-Up" && refs.length && refs.reduce((n, r) => n + gameManaValue(find(state, r)), 0) < 6) throw new Error("証拠収集6には合計マナ総量6以上が必要です。");
  return null;
}
export function formatAdditionalMana(card, format = {}) {
  const name = cardName(card);
  if (name === "Starscape Cleric" && format.offspring === "yes") return "{2}{B}";
  if (name === "Countersculpt" && !format.cards?.length) return "{1}";
  if (["Stir Up Trouble", "Deadly Precision"].includes(name) && !format.cards?.length) return "{4}";
  return "";
}
export function payFormatExtraCosts(state, card, format = {}) {
  const name = cardName(card);
  if (format.freeCast === "yes" && name === "Snuff Out") { if(state.players.self.life < 4) throw new Error("マナと4ライフを支払えません。"); changeLife(state,-4); }
  if (format.freeCast === "yes" && name === "Force of Vigor") for(const r of format.pitch || []) move(state,r.id,"hand","exile");
  if (!EXTRA_COST_SPELLS.has(name)) return;
  if (format.life) {
    if (format.life > state.players.self.life) throw new Error("マナの支払い後のライフが不足します。");
    changeLife(state, -format.life);
  }
  for (const r of format.cards || []) {
    if (name === "Demand Answers") move(state, r.id, r.zone || "battlefield", "graveyard", r.zone === "hand" ? "discard" : "sacrifice");
    else if (name === "Requiting Hex") addGameCounters(state, find(state, r), "-1/-1", 1);
    else if (name === "We Say Thee Nay!") find(state, r).tapped = true;
    else if (name === "Deadly Cover-Up") move(state, r.id, "graveyard", "exile");
    else if (name !== "Countersculpt") move(state, r.id, "battlefield", "graveyard", "sacrifice");
  }
}
