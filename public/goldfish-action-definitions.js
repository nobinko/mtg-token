// Complete, bounded ability clauses. Parsing a cost never implies that every
// other ability on the card is supported.
import { engineCardActions } from "./goldfish-card-programs.js?v=20261019-formats5";
const face = (card) => card.faces?.[card.faceIndex || 0] || card;
const type = (card) => card.faceDown ? "Creature" : String(face(card).typeLine || "");
const text = (card) => String(face(card).oracleText || "").replace(/\([^)]*\)/g, "");
const mana = "((?:\\{(?:\\d+|[WUBRGC]|[WUBRG]/[WUBRG])\\})+)";
export const goldfishMainTiming = (state) => state.phase === "playing" && state.rules.activePlayer !== "opponent" && !state.stack.length &&
  !state.rules.pendingTurnDraw && !state.rules.resumeNextTurn && !(state.rules.combat && state.rules.combat.stage !== "done");
export const goldfishPlotReady = (state, card) => card.playPermission?.kind === "plot" && card.playPermission.serial < state.rules.turnSerial && goldfishMainTiming(state);

export function goldfishCardActions(card) {
  if (!card || card.faceDown || card.automaticAbilities === false) return [];
  const result = engineCardActions(card), oracle = text(card), lines = oracle.split("\n").map((line) => line.trim());
  const plot = lines.map((line) => line.match(new RegExp(`^Plot ${mana}$`))).find(Boolean);
  if (plot) result.push({ id: "plot", zone: "hand", cost: plot[1], main: true, label: `計画 ${plot[1]}`, description: "手札から計画して追放。次のターン以降、自分のメインでマナ・コストを払わずに唱えられます。" });
  const cycling = lines.map((line) => line.match(new RegExp(`^Cycling ${mana}$`))).find(Boolean);
  if (cycling) result.push({ id: "cycling", zone: "hand", cost: cycling[1], discardSelf: true, label: `サイクリング ${cycling[1]}`, description: "このカードを捨てて起動。能力の解決時に1枚引きます。" });
  const equip = lines.map((line) => line.match(new RegExp(`^Equip ${mana}$`))).find(Boolean);
  if (equip && /\bEquipment\b/.test(type(card)) && !/\bCreature\b/.test(type(card))) result.push({ id: "equip", zone: "battlefield", cost: equip[1], main: true, target: true, label: `装備 ${equip[1]}`, description: "自分のクリーチャーを選んで装備。解決するまで、現在の装着先は変わりません。" });
  if (/\bLand\b/.test(type(card)) && lines.includes("{1}, {T}, Sacrifice this land: Draw a card.")) result.push({ id: "land-draw", zone: "battlefield", cost: "{1}", tap: true, sacrifice: true, label: "生け贄にして1枚引く {1}", description: "この土地をタップして生け贄にします。能力の解決時に1枚引きます。" });
  if (face(card).name === "Psychic Frog") {
    if (lines.includes("Discard a card: Put a +1/+1 counter on this creature.")) result.push({ id: "frog-counter", zone: "battlefield", cost: "{0}", cards: { zone: "hand", count: 1 }, label: "1枚捨てて +1/+1", description: "捨てる手札を選びます。能力の解決時に+1/+1カウンターを置きます。" });
    if (lines.includes("Exile three cards from your graveyard: This creature gains flying until end of turn.")) result.push({ id: "frog-flying", zone: "battlefield", cost: "{0}", cards: { zone: "graveyard", count: 3 }, label: "墓地3枚を追放して飛行", description: "墓地から3枚を選びます。能力の解決時からターン終了まで飛行を得ます。" });
  }
  return result;
}

export function goldfishEquipmentBonus(card) {
  const bonus = { power: 0, toughness: 0, keywords: [] };
  if (card.faceDown || card.automaticAbilities === false || !/\bEquipment\b/.test(type(card)) || /\bCreature\b/.test(type(card))) return bonus;
  for (const line of text(card).split("\n")) {
    const match = line.trim().match(/^Equipped creature (?:gets ([+-]\d+)\/([+-]\d+)(?: and has (.+))?|has (.+))\.$/);
    if (!match) continue;
    const keywords = (match[3] || match[4] || "").split(/,? and |, /).filter(Boolean);
    if (keywords.some((word) => !["haste", "trample", "flying", "vigilance", "lifelink", "first strike", "double strike", "hexproof", "shroud", "deathtouch", "reach", "indestructible"].includes(word))) continue;
    bonus.power += Number(match[1] || 0); bonus.toughness += Number(match[2] || 0); bonus.keywords.push(...keywords);
  }
  return bonus;
}

export function goldfishCanEquip(state, equipment, target) {
  if (!equipment || !target || equipment.id === target.id || equipment.faceDown || !/\bEquipment\b/.test(type(equipment)) || /\bCreature\b/.test(type(equipment)) || !/\bCreature\b/.test(type(target))) return false;
  const oracle = target.faceDown || target.automaticAbilities === false ? "" : text(target);
  // Protection and conditional targeting restrictions need their own adapters.
  // Refuse the automated target instead of silently bypassing them.
  if (/\bshroud\b|\bprotection from\b|can't be (?:equipped|the target)/i.test(oracle)) return false;
  return !state.battlefield.some((item) => item.attachedTo?.id === target.id && item.attachedTo.incarnation === (target.incarnation || 0) && goldfishEquipmentBonus(item).keywords.includes("shroud"));
}
