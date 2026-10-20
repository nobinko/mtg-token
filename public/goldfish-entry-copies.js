import { cardName, activeFace, copiableGoldfishValues, queueGameAbility } from "./goldfish-events.js?v=20261021-public30h";
import { verifiedGoldfishCard } from "./goldfish-card-programs.js?v=20261021-public30h";
import { engineCandidates, gameManaValue } from "./goldfish-engine.js?v=20261021-public30h";
import { goldfishReference as ref, goldfishFindObject as find, sameGoldfishReference as same } from "./goldfish-objects.js?v=20261021-public30h";

// Replacement choice: complete before entry counters and any ETB observers.
export function offerEntryCopy(s, c) {
  const n = cardName(c);
  if (c.copyEntryChosen || !verifiedGoldfishCard(c) || !["Superior Spider-Man", "Mockingbird"].includes(n)) return false;
  const zone = n === "Mockingbird" ? "battlefield" : "graveyard";
  const candidates = engineCandidates(s, { zone, filter: { types: ["Creature"] } }).filter(v => v.card.id !== c.id && (n !== "Mockingbird" || gameManaValue(v.card) <= (c.manaSpent || 0)));
  const choice = { type: "engine-copy-entry", sourceName: n, card: ref(c), kind: "cards", label: n === "Mockingbird" ? "支払ったマナ以下のクリーチャーをコピー（任意）" : "墓地のクリーチャーをコピー（任意・4/4）", min: 0, max: 1, candidates: candidates.map(({ref,label})=>({ref,label})) };
  if (s.rules.pendingChoice) (s.rules.entryChoices ||= []).push(choice); else s.rules.pendingChoice = choice;
  return true;
}
export function chooseEntryCopy(s, a) {
  const choice = s.rules.pendingChoice, c = find(s, choice.card), refs = a.refs;
  if (!c || !Array.isArray(refs) || refs.length > 1 || refs.some(r => !choice.candidates.some(v => same(v.ref, r)) || !find(s, r))) throw new Error("コピーするカードを選び直してください。");
  c.copyEntryChosen = true;
  if (refs.length) {
    const target = find(s, refs[0]), n = cardName(c);
    c.copyBase = { ...copiableGoldfishValues(c), faces: structuredClone(c.faces || []), faceIndex: c.faceIndex || 0 };
    Object.assign(c, copiableGoldfishValues(target), { faces: [], faceIndex: 0, permanentCopy: true });
    if (n === "Superior Spider-Man") {
      c.copyRuleName = cardName(target); c.name = c.printedName = n; c.power = c.toughness = "4";
      c.typeLine = c.typeLine.includes("—") ? c.typeLine + " Spider Human Hero" : c.typeLine + " — Spider Human Hero";
      queueGameAbility(s, c, "精神交換：コピーした墓地のカードを追放", [{ op: "move-target", destination: "exile" }], { target: refs[0] });
    } else {
      c.typeLine = c.typeLine.includes("—") ? c.typeLine + " Bird" : c.typeLine + " — Bird";
      c.copiedFlying = true;
    }
  }
  s.rules.pendingChoice = null;
  return c;
}
