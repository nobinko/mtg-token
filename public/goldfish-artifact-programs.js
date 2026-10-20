// Adapters for the actual public UW artifact list. Callers verify full Oracle
// text; costs, zone changes and triggers still use the shared rules engine.
import { activeFace as face, cardName as name, isType, queueGameAbility as queue, makeGameToken, copiableGoldfishValues } from "./goldfish-events.js?v=20261021-public30g";
import { goldfishReference as ref, goldfishFindObject as find, moveGoldfishRuleObject as move } from "./goldfish-objects.js?v=20261021-public30g";
import { verifiedGoldfishCard, draw, tutor } from "./goldfish-card-programs.js?v=20261021-public30g";
import { gameManaValue } from "./goldfish-engine.js?v=20261021-public30g";

const active = c => c && verifiedGoldfishCard(c);
const live = s => s.battlefield.filter(active);
const note = (s, text) => (s.rules.notices ||= []).push({ text, serial: s.rules.turnSerial });
const add = (s, c, label, steps, extra = {}) => queue(s, c, label, steps, extra);
const insert = (c, ...steps) => c.steps.splice(c.step + 1, 0, ...steps);
const targetNonlandOpponent = { zone: "battlefield", permanent: true, notTypes: ["Land"], opposingPermanent: true, virtualOpponent: true };
const gnome = { name: "Gnome", typeLine: "Token Artifact Creature — Gnome", power: "1", toughness: "1", colors: [], oracleText: "" };
const doombot = { name: "Doombot", typeLine: "Token Artifact Creature — Robot Villain", power: "3", toughness: "3", colors: [], oracleText: "" };
export const ARTIFACT_NOTES = {
  "Simulacrum Synthesizer": "占術2・別のマナ総量3以上のアーティファクトの登場で構築物",
  "Repurposing Bay": "別のアーティファクトを生け贄にし、マナ総量が1大きいものを戦場へ",
  "Candy Trail": "占術2・生け贄で3点回復と1枚ドロー",
  "Clay-Fired Bricks": "基本平地の探索・2点回復・アーティファクトで作製",
  "Cosmium Kiln": "登場時にノーム2体・自軍クリーチャーを＋1/＋1",
  "Cryogen Relic": "登場と退場で各1枚ドロー・生け贄で麻痺",
  "Perilous Snare": "エンジン始動・退場まで相手の非土地を追放・最高速度でカウンター",
  "White Auracite": "退場まで相手の非土地を追放・白マナ",
  "Braided Net": "網カウンター3個・タップと起動制限・アーティファクトで作製",
  "Braided Quipu": "アーティファクト数をドローし、自身を山札の上から3番目へ",
  "Spring-Loaded Sawblades": "相手のタップ状態のクリーチャーへ5点・アーティファクトで作製",
  "Bladewheel Chariot": "他のアーティファクト2つをタップしてクリーチャー化・搭乗1",
  "The Fire Crystal": "赤呪文の軽減・速攻付与・終了時に生け贄にするクリーチャーのコピー",
  "The Irencrag": "無色マナ・伝説のクリーチャーの登場で任意に装備品化",
  "The Mind Stone": "白マナ・Harness後は自分の終了時に別の非土地を明滅",
  "Castle Doom": "アーティファクト呪文専用の色マナ・生け贄でドゥームボット",
};
export function hasArtifactProgram(c) { return active(c) && Boolean(ARTIFACT_NOTES[name(c)]); }
export function artifactEntryState(s, c) {
  if (!active(c)) return;
  if (name(c) === "Braided Net") c.counters.net = 3;
  if (name(c) === "Perilous Snare" && !s.rules.speed) s.rules.speed = 1;
}
export function artifactEnter(s, c) {
  if (!hasArtifactProgram(c)) return false;
  const n = name(c);
  if (["Simulacrum Synthesizer", "Candy Trail"].includes(n)) add(s, c, "占術2", [{ op: "format-scry", count: 2 }]);
  if (n === "Clay-Fired Bricks") add(s, c, "基本平地を手札へ・2点回復", [tutor({ basicLand: true, subtypes: ["Plains"] }), { op: "life", amount: 2 }]);
  if (n === "Cosmium Kiln") add(s, c, "1/1ノームを2体", [{ op: "artifact-gnomes" }]);
  if (n === "Cryogen Relic") add(s, c, "登場：1枚引く", [draw()]);
  if (["Perilous Snare", "White Auracite"].includes(n)) add(s, c, "このカードが離れるまで相手の非土地を追放", [{ op: "artifact-exile-opponent" }], { targetSpec: targetNonlandOpponent });
  if (n === "Spring-Loaded Sawblades") add(s, c, "相手のタップ状態のクリーチャーに5点", [{ op: "damage", amount: 5 }], { targetSpec: { zone: "battlefield", types: ["Creature"], tapped: true, opposingPermanent: true, virtualOpponent: true } });
  return true;
}
export function artifactEvent(s, e) {
  if (e.kind === "entered") {
    for (const c of live(s)) {
      if (name(c) === "Simulacrum Synthesizer" && c.id !== e.card.id && isType(e.card, "Artifact") && gameManaValue(e.card) >= 3)
        add(s, c, "マナ総量3以上の別のアーティファクト：構築物", [{ op: "token", name: "construct", count: 1 }]);
      if (name(c) === "The Irencrag" && isType(e.card, "Legendary") && isType(e.card, "Creature"))
        add(s, c, "装備品に変えてもよい", [{ op: "artifact-irencrag" }]);
    }
  }
  if (e.kind === "move" && e.from === "battlefield") {
    if (name(e.original) === "Cryogen Relic" && active(e.original)) add(s, e.original, "退場：1枚引く", [draw()]);
    // Opposing objects are intentionally abstract in solo play, but the duration
    // still ends when this exact object leaves, including when used as a cost.
    if (e.original.artifactExiledOpponent) note(s, `${name(e.original)}が離れた：追放していた相手のパーマネントを戻します。`);
  }
  if (e.kind === "life" && e.player === "opponent" && e.amount < 0 && s.rules.activePlayer === "self" && s.rules.speed > 0 && s.rules.speed < 4 && s.rules.speedIncreasedSerial !== s.rules.turnSerial) {
    s.rules.speed++;
    s.rules.speedIncreasedSerial = s.rules.turnSerial;
    note(s, `速度が${s.rules.speed}になりました${s.rules.speed === 4 ? "（最高速度）" : ""}。`);
  }
}
export function artifactEnd(s) {
  if (s.rules.activePlayer === "self") for (const c of live(s)) if (name(c) === "The Mind Stone" && c.harnessed)
    add(s, c, "∞：別の非土地を1つまで明滅", [{ op: "artifact-blink" }], { targetSpec: { zone: "battlefield", permanent: true, notTypes: ["Land"], excludeSelf: true, optional: true } });
  for (const r of s.rules.fireCrystalCopies || []) if (find(s, r)) add(s, find(s, r), "次の終了ステップ：コピーを生け贄", [{ op: "sacrifice-source" }]);
  s.rules.fireCrystalCopies = [];
}
export function artifactActions(c) {
  if (!active(c)) return [];
  const n = name(c), a = [], act = (id, label, cost, steps, extra = {}) => a.push({ id: `engine:artifact-${id}`, zone: "battlefield", cost, label, description: label, steps, ...extra });
  const craftCost = { "Braided Net": "{1}{U}", "Clay-Fired Bricks": "{5}{W}{W}", "Spring-Loaded Sawblades": "{3}{W}" }[n];
  if (craftCost) act("craft", `作製 ${craftCost}：別のアーティファクトを追放`, craftCost, [{ op: "artifact-craft" }], { main: true, exileSelf: true, craft: true, costSelect: { zone: ["battlefield", "graveyard"], filter: { types: ["Artifact"], excludeSelf: true }, count: 1, destination: "exile" } });
  if (n === "Repurposing Bay") act("bay", "{2},{T}：生け贄よりマナ総量が1大きいアーティファクトを戦場へ", "{2}", [{ op: "artifact-bay" }], { main: true, tap: true, costSelect: { zone: "battlefield", filter: { types: ["Artifact"], excludeSelf: true }, count: 1, destination: "graveyard" } });
  if (n === "Candy Trail") act("candy", "{2},{T},生け贄：3点回復・1枚引く", "{2}", [{ op: "life", amount: 3 }, draw()], { tap: true, sacrifice: true });
  if (n === "Cryogen Relic") act("cryogen", "{1}{U},生け贄：タップしたクリーチャーに麻痺", "{1}{U}", [{ op: "target-counter", name: "stun", count: 1 }], { sacrifice: true, targetSpec: { zone: "battlefield", types: ["Creature"], tapped: true, optional: true, virtualOpponent: true } });
  if (n === "Perilous Snare") act("snare", "最高速度 — {T}：＋1/＋1カウンター", "{0}", [{ op: "target-counter", name: "+1/+1", count: 1 }], { tap: true, main: true, minSpeed: 4, targetSpec: { zone: "battlefield", types: ["Creature", "Vehicle"] } });
  if (n === "Braided Net") act("net", "{T},網1個：他の非土地をタップ・起動を制限", "{0}", [{ op: "artifact-net" }], { tap: true, counterCost: { name: "net", amount: -1 }, targetSpec: { zone: "battlefield", permanent: true, notTypes: ["Land"], excludeSelf: true, virtualOpponent: true } });
  if (n === "Braided Quipu") act("quipu", "{3}{U},{T}：アーティファクト数ドロー・上から3番目へ", "{3}{U}", [{ op: "artifact-quipu" }], { tap: true });
  if (n === "Bladewheel Chariot") act("chariot", "他のアーティファクト2つをタップ：クリーチャー化", "{0}", [{ op: "crew" }], { costSelect: { zone: "battlefield", filter: { types: ["Artifact"], excludeSelf: true, untapped: true }, count: 2, destination: "tap" } });
  if (n === "The Fire Crystal") act("fire-copy", "{4}{R}{R},{T}：クリーチャーのコピー", "{4}{R}{R}", [{ op: "artifact-fire-copy" }], { tap: true, targetSpec: { zone: "battlefield", types: ["Creature"] } });
  if (n === "The Mind Stone" && !c.harnessed) act("harness", "{5}{W},{T}：Mind StoneをHarnessする", "{5}{W}", [{ op: "artifact-harness" }], { tap: true });
  if (n === "Castle Doom") act("doom", "{3},{T},アーティファクトを生け贄：3/3ドゥームボット", "{3}", [{ op: "artifact-doombot" }], { tap: true, main: true, costSelect: { zone: "battlefield", filter: { types: ["Artifact"] }, count: 1, destination: "graveyard" } });
  return a;
}
export function artifactStep(s, c, op) {
  const source = find(s, c.source), target = find(s, c.target);
  switch (op.op) {
    case "artifact-gnomes": makeGameToken(s, gnome); makeGameToken(s, gnome); return true;
    case "artifact-doombot": makeGameToken(s, doombot); return true;
    case "artifact-exile-opponent":
      if (source && c.target?.virtual) { source.artifactExiledOpponent = true; note(s, `${name(source)}が離れるまで相手の非土地を追放（相手側のカード内容は省略）。`); }
      return true;
    case "artifact-bay": {
      const mv = gameManaValue(c.costCards[0]) + 1;
      insert(c, tutor({ types: ["Artifact"], minManaValue: mv, maxManaValue: mv }, "battlefield"));
      return true;
    }
    case "artifact-craft":
      if (source && c.source.zone === "exile") { const back = move(s, source.id, "exile", "battlefield"); back.faceIndex = 1; back.lane = "other"; }
      return true;
    case "artifact-net":
      if (target) { target.tapped = true; target.netLocked = true; }
      else if (c.target?.virtual) note(s, "相手の対象をタップし、タップ状態の間は起動型能力を使えません。");
      return true;
    case "artifact-quipu":
      insert(c, draw(s.battlefield.filter(x => isType(x, "Artifact")).length), { op: "artifact-third" });
      return true;
    case "artifact-third":
      if (source) { const card = move(s, source.id, "battlefield", "library"); s.library.pop(); s.library.splice(Math.max(0, s.library.length - 2), 0, card); }
      return true;
    case "artifact-harness": if (source) source.harnessed = true; return true;
    case "artifact-blink":
      if (target) { const ex = move(s, target.id, "battlefield", "exile"); if (s.exile.includes(ex)) move(s, ex.id, "exile", "battlefield"); }
      return true;
    case "artifact-fire-copy":
      if (target) { const [token] = makeGameToken(s, { ...copiableGoldfishValues(target), kind: "token" }); (s.rules.fireCrystalCopies ||= []).push(ref(token)); }
      return true;
    case "artifact-irencrag":
      if (source) s.rules.pendingChoice = { type: "engine-choice", entryId: c.entryId, sourceName: c.sourceName, kind: "buttons", label: "マナ能力を失い、＋3/＋3の装備品に変えますか？", options: [{ value: "yes", label: "装備品にする" }, { value: "no", label: "マナ能力を残す" }] };
      return true;
    default: return false;
  }
}
export function artifactChoose(s, c, op, a) {
  if (op.op !== "artifact-irencrag") return false;
  const source = find(s, c.source);
  if (source && a.value === "yes") {
    source.copyBase = copiableGoldfishValues(source);
    Object.assign(source, { name: "Everflame, Heroes' Legacy", typeLine: "Legendary Artifact — Equipment", oracleText: "Equipped creature gets +3/+3.\nEquip {3}", faces: [], faceIndex: 0 });
  }
  return true;
}
