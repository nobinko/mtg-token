import { GOLD_FISH_CATALOG } from "./goldfish-catalog.js?v=20261019-formats5";
const face = c => c.faces?.[c.faceIndex || 0] || c;
const type = (c, t) => new RegExp(`\\b(?:${t})\\b`).test(face(c).typeLine || "");
const normalized = text => String(text || "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
export function hasRuleCard(state, name) { return state.battlefield.some(c => !c.faceDown && c.automaticAbilities !== false && face(c).name === name && normalized(face(c).oracleText) === normalized(GOLD_FISH_CATALOG[name]?.oracleText)); }
export function entryTriggersBlocked(state, card) { return type(card, "Creature") && hasRuleCard(state, "Torpor Orb") || type(card, "Artifact|Creature") && hasRuleCard(state, "Karn, Argent Defender"); }
export function abilityBlockReason(state, card, { zone = "battlefield", manaAbility = false } = {}) {
  if (zone === "battlefield" && type(card, "Land") && !type(card, "Basic") && hasRuleCard(state, "Blood Moon")) return "血染めの月により、この土地の能力は失われています。";
  if (zone === "battlefield" && type(card, "Creature") && hasRuleCard(state, "Cursed Totem")) return "呪われたトーテム像がクリーチャーの起動を禁止しています。";
  if (!manaAbility && state.battlefield.some(c => !c.faceDown && c.automaticAbilities !== false && ["Pithing Needle", "Disruptor Flute"].includes(face(c).name) && c.chosenName === face(card).name)) return "真髄の針／攪乱のフルートで、この名前の起動は禁止されています。";
  return "";
}
export function castBlockReason(state, zone = "hand") {
  if (state.rules.selfNoCastSerial === state.rules.turnSerial) return "オアリムの詠唱により、このターンは呪文を唱えられません。";
  if (["graveyard", "library"].includes(zone) && hasRuleCard(state, "Grafdigger's Cage")) return "墓掘りの檻により、その領域から唱えられません。";
  if (hasRuleCard(state, "High Noon") && state.rules.spellsCast >= 1) return "High Noonにより、このターンは2つ目の呪文を唱えられません。";
  return "";
}
