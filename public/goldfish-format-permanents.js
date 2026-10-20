import { activeFace as face, cardName as name, isType, queueGameAbility as queue, makeGameToken, changeLife, addGameCounters, shuffleGameLibrary, copiableGoldfishValues } from "./goldfish-events.js?v=20261020-solo10";
import { goldfishReference as ref, goldfishFindObject as find, moveGoldfishRuleObject as move, sameGoldfishReference as same } from "./goldfish-objects.js?v=20261020-solo10";
import { verifiedGoldfishCard, TOKENS, select, draw, discard, token, tutor, look, damageTarget } from "./goldfish-card-programs.js?v=20261020-solo10";
import { engineCandidates, gameManaValue, gameColors, damage, destroy } from "./goldfish-engine.js?v=20261020-solo10";
import { goldfishCharacteristics, goldfishKeywords, goldfishGraveyardTypes } from "./goldfish-rules.js?v=20261020-solo10";
import { planGoldfishPayment, payGoldfishPlanDraft } from "./goldfish-mana.js?v=20261020-solo10";
import { extensionState, extensionEvent, extensionUpkeep, extensionCombatDamage, extensionEnter, hasAbilityExtension } from "./goldfish-ability-extensions.js?v=20261020-solo10";

const active = c => c && !c.faceDown && c.automaticAbilities !== false && verifiedGoldfishCard(c);
const live = s => s.battlefield.filter(active);
const has = (s, n) => live(s).some(c => name(c) === n);
const add = (s, c, label, steps, extra = {}) => queue(s, c, label, steps, extra);
const insert = (c, ...steps) => c.steps.splice(c.step + 1, 0, ...steps);
const ask = (s, c, data) => { s.rules.pendingChoice = { type: "engine-choice", entryId: c.entryId, sourceName: c.sourceName, ...data }; };
const yesNo = (s, c, label) => ask(s, c, { kind: "buttons", label, options: [{ value: "yes", label: "はい" }, { value: "no", label: "いいえ" }] });
const note = (s, text) => (s.rules.notices ||= []).push({ text, serial: s.rules.turnSerial });
const surveil = n => [select(`諜報${n}：墓地に置くカード`, "library", {}, { top: n, max: n, destination: "graveyard" }), { op: "surveil-order", count: n }];
const creatureTarget = { zone: "battlefield", types: ["Creature"] };
const bat = { name: "Bat", colors: ["B"], typeLine: "Token Creature — Bat", power: "1", toughness: "1", oracleText: "Flying" };
const warrior = { name: "Sand Warrior", colors: ["R", "G", "W"], typeLine: "Token Creature — Sand Warrior", power: "1", toughness: "1" };
const vampire = { name: "Vampire", colors: ["W"], typeLine: "Token Creature — Vampire", power: "1", toughness: "1", oracleText: "Lifelink" };
const rat = { name: "Rat", colors: ["B"], typeLine: "Token Creature — Rat", power: "1", toughness: "1", oracleText: "This token gets +1/+1 for each other Rat you control." };
function typeAs(c, type) {
  c.originalTypeLine ||= c.typeLine;
  if (c.faces?.length) { c.originalFaces ||= structuredClone(c.faces); c.faces[c.faceIndex || 0].typeLine = type; }
  c.typeLine = type;
}
export const FORMAT_PERMANENT_NAMES = new Set([
  "Death to Our Enemies", "The Fantasticar",
  "Chrome Mox", "Sand Scout", "Orcish Bowmasters", "Tamiyo, Inquisitive Student", "Tamiyo, Seasoned Scholar", "Delver of Secrets", "Sneak Attack", "Emrakul, the Aeons Torn", "Kaito, Bane of Nightmares",
  "Mossborn Hydra", "Sazh's Chocobo", "Mightform Harmonizer", "Icetill Explorer", "Mole Man, Moloid Master", "Sandman, Shifting Scoundrel", "Barrowgoyf",
  "Enduring Curiosity", "Hinterland Sanctifier", "Liliana the Faultless", "Starscape Cleric", "Amalia Benavides Aguirre", "Case of the Uneaten Feast", "Lunar Convocation", "Zoraline, Cosmos Caller", "Enlightened Confidant",
  "Sentinel of the Nameless City", "Obsessive Pursuit", "Callous Inspector", "Curious Farm Animals", "Gene Pollinator", "Umbral Collar Zealot",
  "Preacher of the Schism", "Kiora, Behemoth Beckoner", "Outcaster Trailblazer", "Oath of Nissa", "Old-Growth Troll", "Unholy Annex", "Ritual Chamber", "Professor Dellian Fel", "Ygra, Eater of All",
  "Flameblade Adept", "Marauding Mako", "Hardened Academic", "Inti, Seneschal of the Sun", "Cool but Rude", "Graveyard Trespasser", "Graveyard Glutton", "Shambling Ghast",
  "Sunderflock", "Colorstorm Stallion", "Ral, Crackling Wit", "Eldrazi Linebreaker", "It That Heralds the End", "Polukranos Reborn", "Polukranos, Engine of Ruin", "Ulvenwald Oddity", "Ulvenwald Behemoth",
  "Reckoner Bankbuster", "Unlicensed Hearse", "Setessan Petitioner", "Stormwing Entity", "North Wind Avatar", "Twinmaw Stormbrood", "Twinshot Sniper", "Runehorn Hellkite",
  "Overlord of the Balemurk", "Emptiness", "Momo, Friendly Flier", "Sarkhan, Dragon Ascendant", "The Misty Mountains Cold", "Kumano Faces Kakkazan",
  "Phelia, Exuberant Shepherd", "Aang, Swift Savior", "Aang and La, Ocean's Fury", "Bilbo, Thief in the Night", "Sage of the Skies", "Skycoach Conductor", "Emeritus of Ideation",
  "The Wondrous Wasp", "Tishana's Tidebinder", "Yuriko, Hope from the Shadows", "Tablet of Discovery", "Magmatic Hellkite", "Wolverine, Fierce Fighter", "Dark Depths", "Thespian's Stage",
  "Ghost Vacuum", "Keen-Eyed Curator", "The Ooze", "Rottenmouth Viper", "Dragonhawk, Fate's Tempest", "Qarsi Revenant", "Scrapshooter", "Jace, Wielder of Mysteries", "Hydro-Man, Fluid Felon", "Nowhere to Run", "Thrun, the Last Troll", "Fury"
]);
export function formatPermanentEntryState(s, c) {
  if (!active(c)) return;
  if (name(c) === "Leatherhead, Swamp Stalker") c.counters.hexproof = 1;
  syncFood(s);
  if (/\bDaybound\b/.test(face(c).oracleText)) { s.rules.dayNight ||= "day"; if (s.rules.dayNight === "night") c.faceIndex = 1; }
  if (name(c) === "Mossborn Hydra") c.counters["+1/+1"] = 1;
  if (name(c) === "Reckoner Bankbuster") c.counters.charge = 3;
  if (name(c) === "Dark Depths" && !has(s, "Blood Moon")) c.counters.ice = 10;
  if (isType(c, "Room")) c.unlockedDoors = [c.faceIndex || 0];
  if (["Emeritus of Ideation", "Skycoach Conductor"].includes(name(c))) c.prepared = true;
  if (name(c) === "Kaito, Bane of Nightmares") updateKaito(s, c);
  if (c.kumanoCounter) { addGameCounters(s, c, "+1/+1", 1); delete c.kumanoCounter; }
  if (name(c) === "Overlord of the Balemurk" && c.castFormat?.impending === "yes") { c.counters.time = 5; c.impending = true; typeAs(c, "Enchantment — Avatar Horror"); c.lane = "other"; }
}
function updateKaito(s, c) {
  const type = s.rules.activePlayer === "self" && c.counters.loyalty > 0 ? "Legendary Planeswalker Creature — Kaito Ninja" : "Legendary Planeswalker — Kaito";
  typeAs(c, type); c.lane = isType(c, "Creature") ? "creature" : "other";
}
export function formatPermanentEnter(s, c) {
  if (!active(c)) return false;
  if (hasAbilityExtension(c)) { extensionEnter(s, c); return true; }
  const n = name(c), q = (label, ops, extra) => add(s, c, label, ops, extra);
  if (n === "Fury") { q("4点をクリーチャー／PWに配分", [{ op: "divided-damage" }], { targetSpec: { zone: "battlefield", types: ["Creature", "Planeswalker"], count: 4, optional: true, virtualOpponent: true, divideDamage: 4 } }); return true; }
  if (n === "Rottenmouth Viper") { q("枯朽カウンターを置き、相手に選択", [{ op: "source-counter", name: "blight", count: 1 }, { op: "fp-viper" }]); return true; }
  if (n === "Dragonhawk, Fate's Tempest") { q("パワー4以上の数だけ衝動ドロー・次の終了時にダメージ", [{ op: "fp-dragonhawk" }]); return true; }
  if (n === "Scrapshooter") { if (c.castFormat?.gift === "yes") q("贈り物・相手のアーティファクト／エンチャントを破壊", [{ op: "fp-opponent-draw" }, { op: "destroy-target" }], { targetSpec: { zone: "battlefield", types: ["Artifact", "Enchantment"], opposingPermanent: true, virtualOpponent: true } }); return true; }
  if (n === "Nowhere to Run") { q("相手のクリーチャーに−3/−3", [{ op: "opponent-effect", text: "相手の対象のクリーチャーはターン終了まで−3/−3" }], { targetSpec: { ...creatureTarget, opposingPermanent: true, virtualOpponent: true } }); return true; }
  if (n === "Starscape Cleric" && c.castFormat?.offspring === "yes") q("新生：1/1コピー", [{ op: "fp-offspring" }]);
  if (n === "Overlord of the Balemurk") { q("4枚切削・非アバターのクリーチャー／PWを回収", [{ op: "mill", count: 4 }, select("墓地から手札へ（任意）", "graveyard", { types: ["Creature", "Planeswalker"], notSubtypes: ["Avatar"] }, { destination: "hand" })]); return true; }
  if (n === "Emptiness") {
    if ((c.castManaByColor?.W || 0) >= 2) q("白白：墓地からクリーチャーを戻す", [{ op: "move-target", destination: "battlefield" }], { targetSpec: { zone: "graveyard", types: ["Creature"], maxManaValue: 3 } });
    if ((c.castManaByColor?.B || 0) >= 2) q("黒黒：−1/−1カウンター3個", [{ op: "fp-negative-three" }], { targetSpec: { ...creatureTarget, optional: true, virtualOpponent: true } });
    return true;
  }
  if (n === "Sarkhan, Dragon Ascendant") { q("ドラゴンを目撃すれば宝物", [select("目撃するドラゴン（公開／戦場・任意）", ["hand", "battlefield"], { types: ["Dragon"] }, { remember: "beheld" }), { op: "fp-behold" }]); return true; }
  if (n === "The Misty Mountains Cold" || n === "Kumano Faces Kakkazan") { c.counters.lore = 1; q("第I章", [{ op: n === "Kumano Faces Kakkazan" ? "fp-kumano" : "fp-mountains", chapter: 1 }]); return true; }
  if (n === "Aang, Swift Savior") { q("別のクリーチャー／呪文をエアベンド", [{ op: "fp-airbend" }], { targetSpec: { zone: ["battlefield", "stack"], spellOrCreature: true, excludeSelf: true, optional: true, virtualOpponent: true } }); return true; }
  if (n === "Tablet of Discovery") { q("1枚切削し、このターンプレイできる", [{ op: "fp-tablet" }]); return true; }
  if (n === "Yuriko, Hope from the Shadows") { q("出たときのモードを選ぶ", [{ op: "fp-yuriko" }]); return true; }
  if (n === "The Wondrous Wasp") { q("クリーチャーをタップし、ワスプがいる間能力を失わせる", [{ op: "fp-wasp" }], { targetSpec: { ...creatureTarget, optional: true, virtualOpponent: true } }); return true; }
  if (n === "Tishana's Tidebinder") { q("起動／誘発を打ち消し、能力を失わせる", [{ op: "fp-tidebinder" }], { targetSpec: { zone: "stack", ability: true, optional: true, virtualOpponent: true } }); return true; }
  if (n === "Magmatic Hellkite") { q("相手の非基本土地を破壊・基本土地に麻痺", [{ op: "opponent-effect", text: "相手の非基本土地を破壊。相手は基本土地をタップ状態・麻痺1個で探せる" }], { targetSpec: { zone: "battlefield", types: ["Land"], nonBasic: true, opposingPermanent: true, virtualOpponent: true } }); return true; }
  if (n === "Wolverine, Fierce Fighter") { q("別のクリーチャーと格闘してもよい", [{ op: "fp-wolverine" }], { targetSpec: { ...creatureTarget, excludeSelf: true, optional: true, virtualOpponent: true } }); return true; }
  if (n === "Chrome Mox") q("刻印：手札を任意で追放", [select("刻印する非アーティファクト・非土地", "hand", { notTypes: ["Artifact", "Land"] }, { destination: "exile", remember: "imprint" }), { op: "fp-imprint" }]);
  else if (n === "Sand Scout") q("相手の方が土地が多ければ砂漠を探す", [{ op: "fp-scout" }]);
  else if (n === "Orcish Bowmasters") q("1点ダメージ・オーク動員1", [{ op: "damage", amount: 1 }, { op: "fp-amass" }], { targetSpec: { ...damageTarget, virtualOpponent: true } });
  else if (n === "Sentinel of the Nameless City") q("地図を生成", [token("map")]);
  else if (n === "Obsessive Pursuit") q("1点失い、手掛かり", [{ op: "life", amount: -1 }, token("clue")]);
  else if (n === "Outcaster Trailblazer") q("好きな色1マナ", [{ op: "mana-choice", count: 1 }]);
  else if (n === "Oath of Nissa") q("上3枚からクリーチャー・土地・PW", [look(3, { types: ["Creature", "Land", "Planeswalker"] })]);
  else if (n === "Ritual Chamber") q("悪魔を生成", [{ op: "fp-demon" }]);
  else if (n === "Zoraline, Cosmos Caller") q("白黒と2ライフで墓地から戻す", [{ op: "fp-zoraline" }]);
  else if (["Graveyard Trespasser", "Graveyard Glutton"].includes(n)) q("墓地を追放・クリーチャーなら吸収", [{ op: "fp-trespasser" }], { targetSpec: { zone: "graveyard", count: n === "Graveyard Glutton" ? 2 : 1, optional: true } });
  else if (n === "Sunderflock") { if (c.wasCast) q("非エレメンタルを手札へ戻す", [{ op: "fp-sunderflock" }]); }
  else if (n === "North Wind Avatar") { if (c.wasCast) q("サイドボードから1枚を手札へ", [select("外部のカードを手札へ", "sideboard", {}, { destination: "hand" })]); }
  else if (n === "Twinmaw Stormbrood") q("5点回復", [{ op: "life", amount: 5 }]);
  else if (n === "Twinshot Sniper") q("2点ダメージ", [{ op: "damage", amount: 2 }], { targetSpec: { ...damageTarget, virtualOpponent: true } });
  else if (n === "Setessan Petitioner") q("緑への信心分回復", [{ op: "fp-devotion-life" }]);
  else if (n === "Stormwing Entity") q("占術2", [{ op: "format-scry", count: 2 }]);
  else return false;
  return true;
}
export function formatPermanentEvent(s, e, watchers) {
  extensionEvent(s, e);
  if (e.kind === "counters" && e.name === "plan" && e.count > 0 && e.card.counters.plan - e.count < 4 && e.card.counters.plan >= 4 && active(e.card) && name(e.card) === "Death to Our Enemies")
    add(s, e.card, "4個目の計画カウンター：生け贄にして7点", [{ op: "fp-enemies-sacrifice" }]);
  if (e.kind === "entered") {
    const entered = e.card;
    for (const c of live(s)) {
      const n = name(c), q = (label, ops, extra) => add(s, c, label, ops, extra);
      if (isType(entered, "Creature")) {
        if (n === "Case of the Uneaten Feast" || ["Hinterland Sanctifier", "Liliana the Faultless"].includes(n) && c.id !== entered.id) q("クリーチャーが出た：1点回復", [{ op: "life", amount: 1 }]);
        if ((n === "Kiora, Behemoth Beckoner" || n === "Outcaster Trailblazer" && c.id !== entered.id) && Number(goldfishCharacteristics(s, entered).power) >= 4) q("パワー4以上：1枚引く", [draw()]);
        if (n === "Momo, Friendly Flier" && c.id !== entered.id && goldfishKeywords(s, entered).has("flying")) q("別の飛行クリーチャー：＋1/＋1", [{ op: "fp-source-pump", power: 1, toughness: 1 }]);
        if (n === "Sarkhan, Dragon Ascendant" && isType(entered, "Dragon")) q("ドラゴンが出た：カウンター・ドラゴンになる・飛行", [{ op: "source-counter", name: "+1/+1", count: 1 }, { op: "fp-sarkhan" }]);
      } else if (isType(entered, "Planeswalker") && n === "Liliana the Faultless" && c.id !== entered.id) q("PWが出た：1点回復", [{ op: "life", amount: 1 }]);
      if (isType(entered, "Land")) {
        if (n === "Icetill Explorer") q("上陸：1枚切削", [{ op: "mill", count: 1 }]);
        if (n === "Sazh's Chocobo") q("上陸：＋1/＋1", [{ op: "source-counter", name: "+1/+1", count: 1 }]);
        if (n === "Mossborn Hydra") q("上陸：カウンターを倍に", [{ op: "fp-hydra" }]);
        if (n === "Mightform Harmonizer") q("上陸：パワーを倍に", [{ op: "fp-double-power" }], { targetSpec: creatureTarget });
        if (n === "Mole Man, Moloid Master") q("上陸：モロイド", [{ op: "fp-moloid" }]);
      }
    }
  }
  if (e.kind === "life" && e.player === "self" && e.amount > 0) {
    for (const c of live(s)) {
      if (name(c) === "Starscape Cleric") add(s, c, "回復：相手は1点失う", [{ op: "opponent-life", amount: -1 }]);
      if (name(c) === "Amalia Benavides Aguirre") add(s, c, "回復：探検・パワー20なら他を破壊", [{ op: "fp-explore-self" }, { op: "fp-amalia" }]);
    }
    for (let i = 0; i < (s.rules.dellianEmblems || 0); i++) queue(s, { name: "Dellianの紋章" }, "回復量分相手が失う", [{ op: "opponent-life", amount: -e.amount }]);
  }
  if (e.kind === "draw" && e.player === "self" && e.countThisTurn === 3) for (const c of (e.watchers || []).filter(c => active(c) && name(c) === "Tamiyo, Inquisitive Student")) add(s, c, "3枚目のドロー：追放して変身", [{ op: "fp-tamiyo-transform" }]);
  if (e.kind === "move") {
    if (e.from === "battlefield" && isType(e.original, "Creature") && e.original.counters?.["+1/+1"] > 0) for (const ooze of watchers.filter(c => active(c) && name(c) === "The Ooze"))
      add(s, ooze, "カウンターの数だけ変異原", [{ op: "fp-mutagen", count: e.original.counters["+1/+1"] }]);
    if (e.to === "graveyard" && isType(e.original, "Land")) for (const c of live(s).filter(c => name(c) === "Sand Scout" && c.scoutSerial !== s.rules.turnSerial)) { c.scoutSerial = s.rules.turnSerial; add(s, c, "土地が墓地へ：砂の戦士", [{ op: "fp-sand" }]); }
    if (e.reason === "discard") for (const c of live(s)) {
      if (name(c) === "Flameblade Adept") add(s, c, "捨てた：＋1/＋0", [{ op: "fp-source-pump", power: 1, toughness: 0 }]);
      if (name(c) === "Marauding Mako") add(s, c, "捨てた：＋1/＋1カウンター", [{ op: "source-counter", name: "+1/+1", count: 1 }]);
      if (name(c) === "Cool but Rude" && c.level >= 2) add(s, c, "捨てた：相手に2点", [{ op: "damage", amount: 2, player: "opponent" }]);
      if (name(c) === "Inti, Seneschal of the Sun" && c.intiDiscardBatch !== e.batch) { c.intiDiscardBatch = e.batch; add(s, c, "捨てた：上1枚を追放し、次の自分の終了ステップまでプレイ可能", [{ op: "fp-inti-impulse" }]); }
    }
    if (e.from === "graveyard") for (const c of live(s).filter(c => name(c) === "Hardened Academic" && c.graveBatch !== e.batch)) { c.graveBatch = e.batch; add(s, c, "墓地から離れた：＋1/＋1", [{ op: "target-counter", name: "+1/+1", count: 1 }], { targetSpec: creatureTarget }); }
    if (e.from === "battlefield" && e.to === "graveyard") {
      const dead = e.original, n = name(dead), r = ref(e.card, "graveyard");
      if (active(dead)) {
        if (n === "Enduring Curiosity" && isType(dead, "Creature")) add(s, dead, "エンチャントとして戻る", [{ op: "fp-return-enchantment", dead: r }]);
        if (n === "Old-Growth Troll" && isType(dead, "Creature")) add(s, dead, "森を強化するオーラとして戻る", [{ op: "fp-troll-return", dead: r }]);
        if (n === "Curious Farm Animals") add(s, dead, "3点回復", [{ op: "life", amount: 3 }]);
        if (n === "Callous Inspector") add(s, dead, "自分に1点・手掛かり", [{ op: "damage", player: "self", amount: 1 }, token("clue")]);
        if (n === "Shambling Ghast") add(s, dead, "死亡：モード選択", [{ op: "fp-ghast" }]);
      }
      if (isType(dead, "Hydra") && dead.kind !== "token") for (const c of watchers.filter(x => active(x) && name(x) === "Polukranos, Engine of Ruin")) add(s, c, "非トークンのハイドラが死亡：2体生成", [{ op: "fp-hydras" }]);
      if (isType(dead, "Food") || isType(dead, "Creature") && watchers.some(c => name(c) === "Ygra, Eater of All" && c.id !== dead.id && active(c))) for (const c of watchers.filter(c => name(c) === "Ygra, Eater of All" && active(c))) add(s, c, "食物が墓地へ：カウンター2個", [{ op: "source-counter", name: "+1/+1", count: 2 }]);
    }
    if (e.to === "graveyard" && name(e.original) === "Emrakul, the Aeons Torn" && active(e.original)) add(s, e.original, "墓地を山札へ戻してシャッフル", [{ op: "fp-emrakul-shuffle" }]);
  }
}
export function formatPermanentCast(s, spell) {
  if (s.rules.activePlayer === "self" && isType(spell, "Creature") && !isType(spell, "Lemur") && /\bFlying\b/i.test(face(spell).oracleText)) s.rules.firstFlyingCreature = true;
  if (active(spell) && name(spell) === "Sage of the Skies" && s.rules.spellsCast >= 2) add(s, spell, "2つ目以降：呪文をコピー", [{ op: "storm", spell: structuredClone(spell), count: 1 }]);
  if (s.rules.stormEmblems && isType(spell, "Instant|Sorcery")) for (let i = 0; i < s.rules.stormEmblems; i++) add(s, spell, "紋章によるストーム", [{ op: "storm", spell: structuredClone(spell), count: s.rules.spellsCast - 1 }, { op: "copy-target-options" }]);
  if (isType(spell, "Creature") && s.rules.kumanoSerial === s.rules.turnSerial) { spell.cast.kumanoCounter = true; delete s.rules.kumanoSerial; }
  if (active(spell) && name(spell) === "Emrakul, the Aeons Torn") add(s, spell, "追加ターン", [{ op: "fp-extra-turn" }]);
  for (const c of live(s)) {
    if (!isType(spell, "Creature") && name(c) === "Death to Our Enemies") add(s, c, "タップ状態の宝物・計画カウンター", [{ op: "fp-enemies-plan" }]);
    if (!isType(spell, "Creature") && name(c) === "The Fantasticar") {
      add(s, c, "ターン終了までクリーチャーにしてもよい", [{ op: "fp-fantasticar-animate" }]);
      if (s.rules.noncreatureCast === 4) add(s, c, "4つ目の非クリーチャー呪文：構築物4体", [{ op: "fp-fantasticar-sacrifice" }]);
    }
    if (name(c) === "Hydro-Man, Fluid Felon" && isType(c, "Creature") && gameColors(spell).includes("U")) add(s, c, "青い呪文：＋1/＋1", [{ op: "fp-source-pump", power: 1, toughness: 1 }]);
    if (name(c) === "Colorstorm Stallion" && isType(spell, "Instant|Sorcery")) add(s, c, "＋1/＋1・5マナ以上ならコピー", [{ op: "fp-source-pump", power: 1, toughness: 1 }, ...(spell.cast?.manaSpent >= 5 ? [{ op: "fp-copy-self" }] : [])]);
    if (name(c) === "Ral, Crackling Wit" && !isType(spell, "Creature")) add(s, c, "非クリーチャー呪文：忠誠度＋1", [{ op: "source-counter", name: "loyalty", count: 1 }]);
  }
}
export function formatPermanentUpkeep(s) {
  extensionUpkeep(s);
  if (s.rules.dayNight) {
    if (s.rules.dayNight === "day" && s.rules.previousActiveSpells === 0) s.rules.dayNight = "night";
    else if (s.rules.dayNight === "night" && s.rules.previousActiveSpells >= 2) s.rules.dayNight = "day";
    for (const c of live(s)) if (c.faces?.some(f => /\bDaybound\b/.test(f.oracleText))) c.faceIndex = s.rules.dayNight === "night" ? 1 : 0;
  }
  for (const c of live(s)) if (name(c) === "Kaito, Bane of Nightmares") updateKaito(s, c);
  if (s.rules.activePlayer !== "self") return;
  for (const c of live(s)) {
    if (c.hydroLand) { typeAs(c, c.hydroLand); delete c.hydroLand; c.lane = "creature"; }
    if (name(c) === "Delver of Secrets") add(s, c, "山札の上を見て、任意で公開して変身", [{ op: "fp-delver" }]);
    if (name(c) === "Obsessive Pursuit") add(s, c, "1点失い手掛かり", [{ op: "life", amount: -1 }, token("clue")]);
  }
}
export function formatPermanentEnd(s) {
  for (const c of s.exile) if (c.playPermission?.untilEndStep && c.playPermission.expires === s.rules.turnSerial) delete c.playPermission;
  for (const d of s.rules.dragonhawkCards || []) if (d.endSerial === s.rules.turnSerial) queue(s, d.source, "ドラゴンホーク：残った追放カードに応じたダメージ", [{ op: "fp-dragonhawk-end", refs: d.refs }]);
  s.rules.dragonhawkCards = (s.rules.dragonhawkCards || []).filter(d => d.endSerial > s.rules.turnSerial);
  for (const entry of s.rules.pheliaReturns || []) if (find(s, entry.card)) queue(s, entry.snapshot, "フェリア：追放したカードを戻す", [{ op: "fp-phelia-return", ...entry }]);
  s.rules.pheliaReturns = [];
  for (const r of s.rules.sneakSacrifices || []) if (find(s, r)) queue(s, find(s, r), "次の終了ステップ：生け贄", [{ op: "sacrifice-source" }]);
  s.rules.sneakSacrifices = [];
  if (s.rules.activePlayer !== "self") return;
  for (const c of live(s)) {
    const n = name(c);
    if (n === "Hydro-Man, Fluid Felon") add(s, c, "アンタップして、次ターンまで土地になる", [{ op: "fp-hydro" }]);
    if (c.impending && c.counters.time > 0) add(s, c, "兆候：時間カウンターを取り除く", [{ op: "fp-impending" }]);
    if (n === "Lunar Convocation") {
      if (s.rules.lifeGained > 0) add(s, c, "回復した：相手は1点失う", [{ op: "opponent-life", amount: -1 }]);
      if (s.rules.lifeGained > 0 && s.rules.lifeLost > 0) add(s, c, "回復し失った：コウモリ", [{ op: "fp-bat" }]);
    }
    if (n === "Case of the Uneaten Feast" && !c.solved && s.rules.lifeGained >= 5) add(s, c, "事件を解決", [{ op: "fp-solve" }]);
    if (n === "Enlightened Confidant" && s.rules.lifeGained > 0) add(s, c, "諜報1・回復量以下を回収", [select("諜報1：墓地に置くか選ぶ", "library", {}, { top: 1, destination: "graveyard", remember: "confidant" }), { op: "fp-confidant" }]);
    if (isType(c, "Room") && c.faces?.some((f, i) => f.name === "Unholy Annex" && c.unlockedDoors?.includes(i))) add(s, c, "1枚引き、悪魔の有無でライフ変動", [draw(), { op: "fp-annex" }]);
  }
}
export function formatPermanentCombat(s) {
  for (const c of live(s)) if (name(c) === "Eldrazi Linebreaker") add(s, c, "エルドラージの数の強化・速攻", [{ op: "fp-linebreaker" }], { targetSpec: creatureTarget });
}
export function formatPermanentState(s) {
  extensionState(s);
  syncFood(s);
  for (const c of s.battlefield) delete c.trollLandAbility;
  for (const aura of [...s.battlefield].filter(c => c.trollAura)) {
    const land = find(s, aura.attachedTo);
    if (land && isType(land, "Land")) land.trollLandAbility = true;
    else move(s, aura.id, "battlefield", "graveyard");
  }
  if (s.rules.automation) return;
  for (const c of live(s)) if (name(c) === "Dark Depths" && !has(s, "Blood Moon") && !c.counters.ice && !s.stack.some(e => e.ability?.steps?.some(op => op.op === "fp-depths") && same(e.ability.source, ref(c))))
    add(s, c, "氷がない：生け贄にしてマリット・レイジ", [{ op: "fp-depths" }]);
}
function syncFood(s) {
  const ygras = live(s).filter(c => name(c) === "Ygra, Eater of All");
  const foodType = type => {
    const [types, subs = ""] = type.split("—");
    return `${types.trim()}${/\bArtifact\b/.test(types) ? "" : " Artifact"} — ${subs.trim()}${/\bFood\b/.test(subs) ? "" : " Food"}`;
  };
  for (const c of s.battlefield) {
    const food = isType(c, "Creature") && ygras.some(y => y.id !== c.id);
    if (food && !c.ygraFood) {
      c.ygraType = c.typeLine; c.ygraFood = true;
      c.typeLine = foodType(c.typeLine);
    }
    if (food && c.faces?.length) {
      const index = c.faceIndex || 0;
      c.ygraFaceTypes ||= {}; c.ygraFaceTypes[index] ??= c.faces[index].typeLine;
      c.faces[index].typeLine = foodType(c.ygraFaceTypes[index]);
    } else if (!food && c.ygraFood) {
      c.typeLine = c.ygraType;
      for (const [index, type] of Object.entries(c.ygraFaceTypes || {})) c.faces[Number(index)].typeLine = type;
      delete c.ygraFood; delete c.ygraType; delete c.ygraFaceTypes;
    }
  }
}
export function formatPermanentAttack(s, c, dealt) {
  if (dealt) {
    extensionCombatDamage(s, c);
    for (const watcher of live(s).filter(x => name(x) === "Enduring Curiosity")) add(s, watcher, "戦闘ダメージ：1枚引く", [draw()]);
    if (name(c) === "Barrowgoyf" && active(c)) { add(s, c, "任意で切削し、クリーチャー1枚を回収", [{ op: "fp-barrow", count: Number(goldfishCharacteristics(s, c).power) }]); return true; }
    return false;
  }
  if (isType(c, "Bat")) for (const z of live(s).filter(x => name(x) === "Zoraline, Cosmos Caller")) add(s, z, "コウモリの攻撃：1点回復", [{ op: "life", amount: 1 }]);
  if (c.kind === "token" && name(c) === "Moloid" && c.oracleText === "Whenever this token attacks, you may mill a card.") {
    add(s, c, "モロイドの攻撃：1枚切削してもよい", [{ op: "fp-moloid-mill" }]); return true;
  }
  if (!active(c)) return false;
  const n = name(c);
  if (["Rottenmouth Viper", "Dragonhawk, Fate's Tempest"].includes(n)) return formatPermanentEnter(s, c);
  if (n === "Phelia, Exuberant Shepherd") { add(s, c, "別の非土地を一時追放", [{ op: "fp-phelia" }], { targetSpec: { zone: "battlefield", permanent: true, notTypes: ["Land"], excludeSelf: true, optional: true, virtualOpponent: true } }); return true; }
  if (n === "Bilbo, Thief in the Night") { add(s, c, "墓地から呪文を唱えてもよい", [select("唱えるアーティファクト／インスタント／ソーサリー", "graveyard", { types: ["Artifact", "Instant", "Sorcery"] }, { remember: "bilbo" }), { op: "fp-bilbo" }]); return true; }
  if (n === "Aang and La, Ocean's Fury") { add(s, c, "タップ状態の自軍にカウンター", [{ op: "fp-aang-counters" }]); return true; }
  if (n === "Emeritus of Ideation") { add(s, c, "墓地8枚を追放して準備してもよい", [{ op: "fp-prepare-eight" }]); return true; }
  if (n === "Overlord of the Balemurk") return formatPermanentEnter(s, c);
  if (n === "Tamiyo, Inquisitive Student") add(s, c, "攻撃：調査", [token("clue")]);
  else if (n === "Emrakul, the Aeons Torn") add(s, c, "滅殺6", [{ op: "opponent-effect", text: "相手はパーマネントを6つ生け贄（相手側の盤面は省略）" }]);
  else if (n === "Sentinel of the Nameless City") add(s, c, "攻撃：地図", [token("map")]);
  else if (n === "Zoraline, Cosmos Caller") add(s, c, "白黒と2ライフで墓地から戻す", [{ op: "fp-zoraline" }]);
  else if (n === "Preacher of the Schism") {
    if (s.players.opponent.life >= s.players.self.life) add(s, c, "相手が最大ライフ：吸血鬼", [{ op: "fp-vampire" }]);
    if (s.players.self.life >= s.players.opponent.life) add(s, c, "自分が最大ライフ：1枚引き1点失う", [draw(), { op: "life", amount: -1 }]);
  } else if (["Graveyard Trespasser", "Graveyard Glutton"].includes(n)) return formatPermanentEnter(s, c);
  else return false;
  return true;
}
export function formatPermanentAttackGroup(s) {
  if (!s.rules.combat?.attackers.length) return;
  for (const c of live(s)) {
    if (name(c) === "Obsessive Pursuit") add(s, c, "攻撃：生け贄にしたパーマネントの数だけ強化", [{ op: "fp-pursuit" }], { targetSpec: { ...creatureTarget, attacking: true } });
    if (name(c) === "Inti, Seneschal of the Sun") add(s, c, "攻撃：手札を捨てて攻撃クリーチャーを強化", [select("捨てる手札（任意）", "hand", {}, { destination: "graveyard", remember: "inti" }), { op: "fp-inti" }]);
    if (name(c) === "Cool but Rude") add(s, c, "攻撃：手札を交換してもよい", [select("捨てる手札（任意）", "hand", {}, { destination: "graveyard", remember: "cool" }), { op: "fp-cool" }]);
  }
}
export function formatPermanentActions(c) {
  if (!active(c) && !c.trollLandAbility) return [];
  const n = name(c), a = [], act = (id, label, cost, steps, extra = {}) => a.push({ id: `engine:fp-${id}`, zone: "battlefield", cost, label, description: label, steps, ...extra });
  const pw = (id, label, loyalty, steps, extra = {}) => act(id, label, "{0}", steps, { main: true, loyalty, ...extra });
  if (n === "Jace, Wielder of Mysteries") { pw("wielder-plus", "+1：対象プレイヤーが2枚切削・1枚引く", 1, [{ op: "fp-jace-mill" }, draw()], { targetSpec: { zone: "none", players: true } }); pw("wielder-ult", "−8：7枚引き、山札が空なら勝利", -8, [draw(7), { op: "fp-jace-win" }]); }
  if (["Ghost Vacuum", "Keen-Eyed Curator", "The Ooze"].includes(n)) act("linked-exile", `${n === "Keen-Eyed Curator" ? "{1}" : "{T}"}：墓地のカードを追放`, n === "Keen-Eyed Curator" ? "{1}" : "{0}", [{ op: "fp-linked-exile" }, ...(n === "The Ooze" ? [{ op: "fp-mutagen", count: 1 }] : [])], { tap: n !== "Keen-Eyed Curator", targetSpec: { zone: "graveyard" } });
  if (n === "Ghost Vacuum") act("vacuum", "{6},{T}・生け贄：追放したクリーチャーを1/1飛行で戻す", "{6}", [{ op: "fp-vacuum" }], { main: true, tap: true, sacrifice: true });
  if (n === "Qarsi Revenant") act("renew", "再生：墓地から追放 {2}{B}・飛行／接死／絆魂カウンター", "{2}{B}", [{ op: "fp-renew" }], { zone: "graveyard", exileSelf: true, main: true, targetSpec: creatureTarget });
  if (n === "Thrun, the Last Troll") act("thrun", "{1}{G}：再生", "{1}{G}", [{ op: "fp-regenerate" }]);
  if (c.trollLandAbility) act("troll-land", "{1},{T}・この土地を生け贄：4/4トロール", "{1}", [{ op: "fp-troll-token" }], { tap: true, sacrifice: true });
  if (n === "Curious Farm Animals") act("farm-animals", "{2}・生け贄：アーティファクト／エンチャント破壊", "{2}", [{ op: "destroy-target" }], { sacrifice: true, targetSpec: { zone: "battlefield", types: ["Artifact", "Enchantment"], optional: true, virtualOpponent: true } });
  if (n === "Sandman, Shifting Scoundrel") act("sandman-return", "{3}{G}{G}：墓地の土地と自身をタップ状態で戻す", "{3}{G}{G}", [{ op: "fp-sandman-return" }], { zone: "graveyard", targetSpec: { zone: "graveyard", types: ["Land"] } });
  if (c.ygraFood) act("food", "{2},{T}・生け贄：3点回復", "{2}", [{ op: "life", amount: 3 }], { tap: true, sacrifice: true });
  if (n === "Dark Depths") act("ice", "氷カウンターを1個取り除く {3}", "{3}", [{ op: "source-counter", name: "ice", count: -1 }]);
  if (n === "Thespian's Stage" || c.stageAbility) act("stage", "{2},{T}：土地をコピー", "{2}", [{ op: "fp-stage" }], { tap: true, targetSpec: { zone: "battlefield", types: ["Land"] } });
  if (n === "Sneak Attack") act("sneak", "手札のクリーチャーを速攻で出す {R}", "{R}", [select("戦場に出すクリーチャー（任意）", "hand", { types: ["Creature"] }, { destination: "battlefield", remember: "sneaked" }), { op: "fp-sneak" }]);
  if (n === "Aang, Swift Savior") act("aang-waterbend", "水の技8：変身（タップで支払い可）", "{8}", [{ op: "transform-source" }], { waterbend: true, costSelect: { zone: "battlefield", filter: { types: ["Artifact", "Creature"], untapped: true }, count: 0, variable: true, destination: "tap" } });
  if (n === "Kaito, Bane of Nightmares") {
    act("kaito-ninjutsu", "忍術 {1}{U}{B}", "{1}{U}{B}", [{ op: "ninjutsu" }], { zone: "hand", ninjutsu: true, costSelect: { zone: "battlefield", filter: { attacking: true }, count: 1, destination: "hand" } });
    pw("kaito-plus", "+1：忍者＋1/＋1の紋章", 1, [{ op: "fp-kaito-emblem" }]);
    pw("kaito-zero", "0：諜報2・相手が失っていれば1枚引く", 0, [...surveil(2), { op: "fp-kaito-draw" }]);
    pw("kaito-minus", "−2：タップ・麻痺2個", -2, [{ op: "fp-stun" }], { targetSpec: { ...creatureTarget, virtualOpponent: true } });
  }
  if (n === "Tamiyo, Seasoned Scholar") {
    pw("tamiyo-plus", "+2：次ターンまで攻撃側を−1/−0", 2, [{ op: "fp-tamiyo-shield" }]);
    pw("tamiyo-return", "−3：墓地の呪文を回収・緑なら1マナ", -3, [{ op: "fp-tamiyo-return" }], { targetSpec: { zone: "graveyard", types: ["Instant", "Sorcery"] } });
    pw("tamiyo-ultimate", "−7：山札の半分を引く・手札上限なし", -7, [{ op: "fp-tamiyo-ultimate" }]);
  }
  if (n === "Kiora, Behemoth Beckoner") pw("kiora", "−1：パーマネントをアンタップ", -1, [{ op: "untap-target" }], { targetSpec: { zone: "battlefield", permanent: true } });
  if (n === "Professor Dellian Fel") {
    pw("dellian-life", "+2：3点回復", 2, [{ op: "life", amount: 3 }]); pw("dellian-draw", "0：1枚引き1点失う", 0, [draw(), { op: "life", amount: -1 }]);
    pw("dellian-destroy", "−3：クリーチャー破壊", -3, [{ op: "destroy-target" }], { targetSpec: { ...creatureTarget, virtualOpponent: true } }); pw("dellian-emblem", "−6：回復量分相手が失う紋章", -6, [{ op: "fp-dellian-emblem" }]);
  }
  if (n === "Ral, Crackling Wit") {
    pw("ral-otter", "+1：カワウソ生成", 1, [token("otter")]); pw("ral-loot", "−3：3枚引いて2枚捨てる", -3, [draw(3), discard(2)]);
    pw("ral-storm", "−10：3枚引く・ストームの紋章", -10, [draw(3), { op: "fp-storm-emblem" }]);
  }
  if (n === "Gene Pollinator") act("gene", "別のパーマネントもタップ：好きな色1マナ", "{0}", [{ op: "mana-choice", count: 1 }], { tap: true, manaAbility: true, costSelect: { zone: "battlefield", filter: { permanent: true, untapped: true, excludeSelf: true }, count: 1, destination: "tap" } });
  if (n === "Umbral Collar Zealot") act("zealot", "別のクリーチャー／アーティファクトを生け贄：諜報1", "{0}", surveil(1), { costSelect: { zone: "battlefield", filter: { types: ["Creature", "Artifact"], excludeSelf: true }, count: 1, destination: "graveyard" } });
  if (n === "Lunar Convocation") act("lunar", "2ライフ：1枚引く {1}{B}", "{1}{B}", [draw()], { lifeCost: 2 });
  if (n === "Case of the Uneaten Feast" && c.solved) act("case", "生け贄：墓地のクリーチャーをこのターン唱えられる", "{0}", [{ op: "fp-case-cast" }], { sacrifice: true });
  if (n === "Liliana the Faultless") act("liliana", "手札1枚・{1},{T}：別のクリーチャー／PWに呪禁", "{1}", [{ op: "target-keyword", keywords: ["hexproof"] }], { tap: true, costSelect: { zone: "hand", count: 1, destination: "graveyard" }, targetSpec: { zone: "battlefield", types: ["Creature", "Planeswalker"], excludeSelf: true } });
  if (n === "Hardened Academic") act("academic", "手札1枚：絆魂", "{0}", [{ op: "source-keyword", keyword: "lifelink" }], { costSelect: { zone: "hand", count: 1, destination: "graveyard" } });
  if (n === "Unlicensed Hearse") act("hearse", "{T}：墓地から2枚まで追放", "{0}", [{ op: "fp-hearse" }], { tap: true, targetSpec: { zone: "graveyard", count: 2, optional: true } });
  if (n === "Reckoner Bankbuster" && c.counters.charge > 0) act("bankbuster", "{2},{T}・蓄積1：ドロー", "{2}", [draw(), { op: "fp-bankbuster" }], { tap: true, counterCost: { name: "charge", amount: -1 } });
  if (n === "Polukranos Reborn") act("polukranos", "変身 {6}{W/P}", "{6}{W/P}", [{ op: "transform-source" }], { main: true });
  if (n === "Ulvenwald Oddity") act("oddity", "変身 {5}{G}{G}", "{5}{G}{G}", [{ op: "transform-source" }]);
  if (n === "Twinshot Sniper") act("sniper-channel", "魂力 {1}{R}：2点", "{1}{R}", [{ op: "damage", amount: 2 }], { zone: "hand", discardSelf: true, targetSpec: { ...damageTarget, virtualOpponent: true } });
  if (n === "Runehorn Hellkite") act("runehorn", "墓地から追放 {5}{R}：手札を捨てて7枚", "{5}{R}", [{ op: "fp-discard-hand" }, draw(7), { op: "opponent-effect", text: "相手も手札を捨てて7枚引く" }], { zone: "graveyard", exileSelf: true });
  if (n === "Cool but Rude") {
    act("cool2", "レベル2 {1}{R}", "{1}{R}", [{ op: "fp-level", level: 2 }], { main: true, fromLevel: 1 });
    act("cool3", "レベル3 {1}{R}", "{1}{R}", [{ op: "fp-level", level: 3 }, tutor({}), { op: "random-discard" }], { main: true, fromLevel: 2 });
  }
  if (isType(c, "Room")) for (let i = 0; i < c.faces.length; i++) if (!c.unlockedDoors?.includes(i)) act(`door-${i}`, `${c.faces[i].name}を開ける ${c.faces[i].manaCost}`, c.faces[i].manaCost, [{ op: "fp-door", index: i }], { main: true });
  return a;
}
export function formatPermanentStats(s, c) {
  const d = {}, n = name(c);
  if (active(c)) {
    if (n === "Sandman, Shifting Scoundrel") d.power = d.toughness = s.battlefield.filter(x => isType(x, "Land")).length;
    if (n === "Barrowgoyf") { d.power = goldfishGraveyardTypes(s).length; d.toughness = d.power + 1; }
    if (n === "Kaito, Bane of Nightmares" && s.rules.activePlayer === "self" && c.counters.loyalty > 0) { d.power = 3; d.toughness = 4; }
    if (n === "Unlicensed Hearse") d.power = d.toughness = (c.linkedExile || []).filter(r => find(s, r)).length;
    if (n === "Keen-Eyed Curator" && goldfishGraveyardTypes({ graveyard: (c.linkedExile || []).map(r => find(s, r)).filter(Boolean) }).length >= 4) d.boost = 4;
  }
  if (isType(c, "Ninja")) d.boost = (d.boost || 0) + (s.rules.kaitoEmblems || 0);
  if (isType(c, "Creature")) for (const lord of live(s).filter(x => x.id !== c.id)) {
    if (name(lord) === "Ulvenwald Behemoth" || name(lord) === "It That Heralds the End" && !gameColors(c).length) d.boost = (d.boost || 0) + 1;
  }
  if (c.kind === "token" && c.name === "Rat" && c.oracleText === rat.oracleText) d.boost = s.battlefield.filter(x => x.id !== c.id && isType(x, "Rat")).length;
  return d;
}
export function formatPermanentKeywords(s, c) {
  const out = [];
  if (name(c) === "Keen-Eyed Curator" && active(c) && goldfishGraveyardTypes({ graveyard: (c.linkedExile || []).map(r => find(s, r)).filter(Boolean) }).length >= 4) out.push("trample");
  if (name(c) === "Kaito, Bane of Nightmares" && active(c) && s.rules.activePlayer === "self" && c.counters.loyalty > 0) out.push("hexproof");
  if (isType(c, "Creature") && live(s).some(x => x.id !== c.id && name(x) === "Ulvenwald Behemoth")) out.push("haste", "trample");
  return out;
}
export function formatPermanentStep(s, c, op) {
  const source = find(s, c.source), t = find(s, c.target);
  switch (op.op) {
    case "fp-enemies-plan":
      makeGameToken(s, { ...TOKENS.treasure, tapped: true });
      if (source) addGameCounters(s, source, "plan", 1);
      return true;
    case "fp-enemies-sacrifice":
      if (source) {
        move(s, source.id, "battlefield", "graveyard", "effect-sacrifice");
        queue(s, source, "生け贄にした：7点を1〜2つの対象に配分", [{ op: "divided-damage" }], { targetSpec: { ...damageTarget, count: 2, divideDamage: 7 } });
      }
      return true;
    case "fp-fantasticar-animate": if (source) yesNo(s, c, "ファンタスティカーをターン終了までクリーチャーにしますか？"); return true;
    case "fp-fantasticar-sacrifice": if (source) yesNo(s, c, "ファンタスティカーを生け贄にして飛行・速攻の4/4構築物4体を出しますか？"); return true;
    case "fp-moloid-mill": yesNo(s, c, "モロイド：1枚切削しますか？"); return true;
    case "fp-sarkhan": if (source) source.temporaryEffects.push({ types: ["Dragon"], keywords: ["flying"], turn: s.turn, label: c.sourceName }); return true;
    case "fp-troll-token": makeGameToken(s, { name: "Troll Warrior", colors: ["G"], typeLine: "Token Creature — Troll Warrior", power: "4", toughness: "4", oracleText: "Trample", tapped: true }); return true;
    case "fp-sandman-return":
      if (source && t) for (const r of [c.source, c.target]) {
        const x = move(s, r.id, "graveyard", "battlefield"); if (s.battlefield.includes(x)) x.tapped = true;
      }
      return true;
    case "fp-inti-impulse":
      if (s.library.length) { const x = move(s, s.library.at(-1).id, "library", "exile"); x.playPermission = { kind: "impulse", expires: s.rules.turnSerial + (s.rules.activePlayer === "opponent" ? 1 : s.rules.endStepStarted ? 2 : 0), untilEndStep: true }; }
      return true;
    case "fp-linked-exile": if (source && t) { const x = move(s, t.id, "graveyard", "exile"); (source.linkedExile ||= []).push(ref(x, "exile")); } return true;
    case "fp-vacuum":
      for (const r of c.snapshot.linkedExile || []) if (find(s, r) && isType(find(s, r), "Creature")) {
        const x = move(s, r.id, "exile", "battlefield");
        x.powerOverride = x.toughnessOverride = "1"; x.typeLine += " Spirit"; addGameCounters(s, x, "flying", 1);
      }
      return true;
    case "fp-renew": if (t) for (const k of ["flying", "deathtouch", "lifelink"]) addGameCounters(s, t, k, 1); return true;
    case "fp-regenerate": if (source) source.regeneration = (source.regeneration || 0) + 1; return true;
    case "fp-mutagen": makeGameToken(s, { name: "Mutagen", typeLine: "Token Artifact — Mutagen", power: "", toughness: "", oracleText: "{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery." }, op.count); return true;
    case "fp-hydras": for (const keyword of ["Reach", "Lifelink"]) makeGameToken(s, { name: "Phyrexian Hydra", typeLine: "Token Creature — Phyrexian Hydra", power: "3", toughness: "3", colors: ["G", "W"], oracleText: keyword }); return true;
    case "fp-jace-mill":
      if (c.target?.player === "self") insert(c, { op: "mill", count: 2 });
      else if (s.rules.opponentLibrary != null) s.rules.opponentLibrary = Math.max(0, s.rules.opponentLibrary - 2);
      else note(s, "相手は山札を2枚切削");
      return true;
    case "fp-jace-win": if (!s.library.length) s.rules.win = { kind: "win", label: "神秘を操る者、ジェイス" }; return true;
    case "fp-inti": if (c.vars.inti?.length) queue(s, source || c.snapshot, "捨てた：攻撃クリーチャーにカウンター・トランプル", [{ op: "target-counter", name: "+1/+1", count: 1 }, { op: "target-keyword", keywords: ["trample"] }], { targetSpec: { ...creatureTarget, attacking: true } }); return true;
    case "fp-cool": if (c.vars.cool?.length) insert(c, draw()); return true;
    case "fp-opponent-draw": if (s.rules.opponentLibrary != null) { if (s.rules.opponentLibrary > 0) s.rules.opponentLibrary--; else s.rules.opponentEmptyDraw = true; } for (const b of live(s).filter(x => name(x) === "Orcish Bowmasters")) add(s, b, "相手の追加ドロー：1点・動員", [{ op: "damage", amount: 1 }, { op: "fp-amass" }], { targetSpec: damageTarget }); return true;
    case "fp-viper": {
      const count = source?.counters.blight || c.snapshot.counters.blight || 0;
      if (count) insert(c, ...Array.from({ length: count }, () => ({ op: "fp-viper-choice" })));
      return true;
    }
    case "fp-viper-choice": yesNo(s, c, "相手は非土地を生け贄にするか、手札を捨てますか？（しなければ4点失う）"); return true;
    case "fp-dragonhawk": {
      const count = s.battlefield.filter(x => isType(x, "Creature") && Number(goldfishCharacteristics(s,x).power) >= 4).length, refs = [];
      const endSerial = s.rules.turnSerial + (s.rules.activePlayer === "self" && s.rules.endStepStarted ? 2 : 0);
      for (const x of s.library.slice(-count).toReversed()) { if (!count) break; const v = move(s,x.id,"library","exile"); v.playPermission = { kind: "impulse", expires: endSerial, untilEndStep: true }; refs.push(ref(v,"exile")); }
      (s.rules.dragonhawkCards ||= []).push({ refs, endSerial, source: c.snapshot }); return true;
    }
    case "fp-dragonhawk-end": damage(s, {player:"opponent"}, 2 * op.refs.filter(r=>find(s,r)).length); for(const r of op.refs) if(find(s,r)) delete find(s,r).playPermission; return true;
    case "fp-hydro": if (source) { source.tapped = false; source.hydroLand = face(source).typeLine; typeAs(source, "Legendary Land"); source.lane = "land"; } return true;
    case "fp-stage":
      if (source && t) {
        source.copyBase ||= { ...copiableGoldfishValues(source), faces: structuredClone(source.faces || []), faceIndex: source.faceIndex || 0 };
        Object.assign(source, copiableGoldfishValues(t), { faces: structuredClone(t.faces || []), faceIndex: t.faceIndex || 0, stageAbility: true, permanentCopy: true });
      }
      return true;
    case "fp-depths":
      if (source && !source.counters.ice) { move(s, source.id, "battlefield", "graveyard", "effect-sacrifice"); makeGameToken(s, { name: "Marit Lage", typeLine: "Legendary Token Creature — Avatar", colors: ["B"], power: "20", toughness: "20", oracleText: "Flying, indestructible" }); }
      return true;
    case "fp-pursuit": if (t) { const count = s.rules.permanentsSacrificed || 0; addGameCounters(s, t, "+1/+1", count); if (count >= 3) t.temporaryEffects.push({ keywords: ["lifelink"], turn: s.turn, label: c.sourceName }); } return true;
    case "fp-offspring": makeGameToken(s, { ...copiableGoldfishValues(c.snapshot), power: "1", toughness: "1" }); return true;
    case "fp-negative-three": if (t) addGameCounters(s, t, "-1/-1", 3); return true;
    case "fp-behold": if (c.vars.beheld?.length) makeGameToken(s, TOKENS.treasure); return true;
    case "fp-kumano":
      if (op.chapter === 1) damage(s, { player: "opponent" }, 1);
      if (op.chapter === 2) s.rules.kumanoSerial = s.rules.turnSerial;
      if (op.chapter === 3 && source) { const x = move(s, source.id, "battlefield", "exile"), back = move(s, x.id, "exile", "battlefield"); back.faceIndex = 1; back.lane = "creature"; }
      return true;
    case "fp-mountains":
      makeGameToken(s, TOKENS.treasure);
      if (source && s.battlefield.filter(x => isType(x, "Treasure")).length >= 4) { move(s, source.id, "battlefield", "graveyard", "effect-sacrifice"); makeGameToken(s, { name: "Dragon", colors: ["R"], typeLine: "Token Creature — Dragon", power: "6", toughness: "6", oracleText: "Flying" }); }
      else if (source && op.chapter >= 4) move(s, source.id, "battlefield", "graveyard", "effect-sacrifice");
      return true;
    case "fp-airbend": if (t) { const x = move(s, t.id, c.target.zone || "battlefield", "exile"); x.playPermission = { kind: "airbend", cost: "{2}" }; } return true;
    case "fp-tablet": if (s.library.length) { const x = move(s, s.library.at(-1).id, "library", "graveyard"); x.grantedCast = { serial: s.rules.turnSerial, cost: face(x).manaCost, land: isType(x, "Land") }; } return true;
    case "fp-yuriko": ask(s, c, { kind: "buttons", label: "ユリコ：モード", options: [{ value: "surveil", label: "諜報2" }, { value: "shrink", label: "対象に墓地枚数分の−X/−0" }] }); return true;
    case "fp-yuriko-shrink": if (t) t.temporaryEffects.push({ power: -s.graveyard.length, toughness: 0, turn: s.turn, label: c.sourceName }); return true;
    case "fp-wasp": if (source && t) { t.tapped = true; t.suppressedBy = ref(source); t.lostAbilitiesOriginal = t.automaticAbilities; t.automaticAbilities = false; t.suppressedKeywords = true; } return true;
    case "fp-tidebinder":
      if (t?.kind === "ability") {
        const original = find(s, t.ability?.source);
        s.stack = s.stack.filter(x => x.id !== t.id);
        if (source && original && isType(original, "Artifact|Creature|Planeswalker")) { original.suppressedBy = ref(source); original.lostAbilitiesOriginal = original.automaticAbilities; original.automaticAbilities = false; original.suppressedKeywords = true; }
      }
      return true;
    case "fp-wolverine":
      if (source && c.target) {
        damage(s, c.target, Number(goldfishCharacteristics(s, source).power));
        if (t) { source.damage = 0; damage(s, c.source, Number(goldfishCharacteristics(s, t).power)); }
        else if (c.target.virtual) ask(s, c, { kind: "number", label: "格闘相手のパワー", min: 0, max: 999 });
      } return true;
    case "fp-impending":
      if (source) { source.counters.time = Math.max(0, source.counters.time - 1); if (!source.counters.time) { delete source.impending; typeAs(source, "Enchantment Creature — Avatar Horror"); source.lane = "creature"; } }
      return true;
    case "fp-phelia":
      if (t) { const x = move(s, t.id, "battlefield", "exile"); (s.rules.pheliaReturns ||= []).push({ card: ref(x, "exile"), phelia: c.source, snapshot: c.snapshot, owned: true }); }
      else if (c.target?.virtual) note(s, "相手の対象を追放し、次の終了ステップに戻す（相手側の領域は省略）");
      return true;
    case "fp-phelia-return":
      if (find(s, op.card)) { move(s, op.card.id, "exile", "battlefield"); const p = find(s, op.phelia); if (op.owned && p) addGameCounters(s, p, "+1/+1", 1); }
      return true;
    case "fp-bilbo":
      if (c.vars.bilbo?.length) { const r = c.vars.bilbo[0].ref, x = find(s, r); if (x) insert(c, { op: "effect-cast", card: r, cost: face(x).manaCost, flashback: isType(x, "Instant|Sorcery") }); }
      return true;
    case "fp-aang-counters": for (const x of s.battlefield.filter(x => isType(x, "Creature") && x.tapped)) addGameCounters(s, x, "+1/+1", 1); return true;
    case "fp-prepare-eight": if (s.graveyard.length >= 8) yesNo(s, c, "墓地8枚を追放して準備しますか？"); return true;
    case "fp-prepared": if (source) source.prepared = true; return true;
    case "fp-imprint": if (source && c.vars.imprint.length) source.imprinted = c.vars.imprint[0].ref; return true;
    case "fp-scout": yesNo(s, c, "相手は自分より多くの土地をコントロールしていますか？"); return true;
    case "fp-sand": makeGameToken(s, warrior); return true;
    case "fp-bat": makeGameToken(s, bat); return true;
    case "fp-vampire": makeGameToken(s, vampire); return true;
    case "fp-demon": makeGameToken(s, { name: "Demon", colors: ["B"], typeLine: "Token Creature — Demon", power: "6", toughness: "6", oracleText: "Flying" }); return true;
    case "fp-moloid": makeGameToken(s, { name: "Moloid", colors: ["G"], typeLine: "Token Creature — Minion", power: "1", toughness: "1", oracleText: "Whenever this token attacks, you may mill a card." }); return true;
    case "fp-amass": {
      const armies = s.battlefield.filter(x => isType(x, "Army"));
      if (!armies.length) addGameCounters(s, makeGameToken(s, { name: "Orc Army", colors: ["B"], typeLine: "Token Creature — Orc Army", power: "0", toughness: "0" })[0], "+1/+1", 1);
      else if (armies.length === 1) { typeAs(armies[0], face(armies[0]).typeLine + " Orc"); addGameCounters(s, armies[0], "+1/+1", 1); }
      else ask(s, c, { kind: "cards", label: "動員する軍団", min: 1, max: 1, candidates: armies.map(x => ({ ref: ref(x), label: name(x) })) });
      return true;
    }
    case "fp-delver": if (source && s.library.length) yesNo(s, c, `山札の上：${name(s.library.at(-1))}。インスタント／ソーサリーなら公開して変身しますか？`); return true;
    case "fp-tamiyo-transform": if (source && name(source) === "Tamiyo, Inquisitive Student") { const ex = move(s, source.id, "battlefield", "exile"), back = move(s, ex.id, "exile", "battlefield"); back.faceIndex = 1; back.counters.loyalty = 2; back.lane = "other"; } return true;
    case "fp-tamiyo-return": if (t) { const green = gameColors(t).includes("G"); move(s, t.id, "graveyard", "hand"); if (green) insert(c, { op: "mana-choice", count: 1 }); } return true;
    case "fp-tamiyo-ultimate": s.rules.noMaximumHandSize = true; insert(c, draw(Math.ceil(s.library.length / 2))); return true;
    case "fp-tamiyo-shield": s.rules.tamiyoShieldUntil = s.rules.turnSerial + 2; note(s, "次の自分のターンまで、自分／自分のPWへの攻撃クリーチャーは−1/−0（相手の攻撃は省略）"); return true;
    case "fp-kaito-emblem": s.rules.kaitoEmblems = (s.rules.kaitoEmblems || 0) + 1; return true;
    case "fp-kaito-draw": if (s.rules.opponentLifeLost > 0) insert(c, draw()); return true;
    case "fp-stun": if (t) { t.tapped = true; addGameCounters(s, t, "stun", 2); } return true;
    case "fp-extra-turn": s.rules.extraTurns = (s.rules.extraTurns || 0) + 1; return true;
    case "fp-emrakul-shuffle": for (const x of [...s.graveyard]) move(s, x.id, "graveyard", "library"); shuffleGameLibrary(s); return true;
    case "fp-sneak": for (const r of (c.vars.sneaked || []).map(x => x.ref)) { const x = find(s, r); if (x && r.zone === "battlefield") { x.temporaryEffects.push({ keywords: ["haste"], turn: s.turn, label: c.sourceName }); (s.rules.sneakSacrifices ||= []).push(r); } } return true;
    case "fp-hydra": if (source) addGameCounters(s, source, "+1/+1", source.counters["+1/+1"] || 0); return true;
    case "fp-double-power": if (t) t.temporaryEffects.push({ power: Number(goldfishCharacteristics(s, t).power), toughness: 0, turn: s.turn, label: c.sourceName }); return true;
    case "fp-explore-self": c.target = c.source; insert(c, { op: "explore" }); return true;
    case "fp-amalia": if (source && Number(goldfishCharacteristics(s, source).power) === 20) for (const x of [...s.battlefield]) if (x.id !== source.id && isType(x, "Creature")) destroy(s, x); return true;
    case "fp-solve": if (source && s.rules.lifeGained >= 5) source.solved = true; return true;
    case "fp-case-cast": for (const x of s.graveyard.filter(x => isType(x, "Creature"))) x.grantedCast = { serial: s.rules.turnSerial, cost: face(x).manaCost }; return true;
    case "fp-confidant": for (const x of c.vars.confidant || []) if (x.ref.zone === "graveyard" && find(s, x.ref) && gameManaValue(x) <= s.rules.lifeGained) move(s, x.id, "graveyard", "hand"); return true;
    case "fp-zoraline": if (s.players.self.life >= 2 && planGoldfishPayment(s, { manaCost: "{W}{B}" }).payable) yesNo(s, c, "{W}{B}と2ライフを払い、マナ総量3以下の非土地を戻しますか？"); return true;
    case "fp-finality-return": if (t) { const x = move(s, t.id, "graveyard", "battlefield"); if (s.battlefield.includes(x)) addGameCounters(s, x, "finality", 1); } return true;
    case "fp-return-enchantment": if (find(s, op.dead)) { const x = move(s, op.dead.id, "graveyard", "battlefield"); typeAs(x, "Enchantment"); x.lane = "other"; } return true;
    case "fp-troll-return": if (find(s, op.dead)) insert(c, select("付ける自分の森（対象を取らない）", "battlefield", { types: ["Land"], subtypes: ["Forest"] }, { min: 1, max: 1, remember: "forest" }), { op: "fp-troll-aura", dead: op.dead }); return true;
    case "fp-troll-aura": if (find(s, op.dead) && c.vars.forest?.length) { const x = move(s, op.dead.id, "graveyard", "battlefield"); typeAs(x, "Enchantment — Aura"); x.attachedTo = c.vars.forest[0].ref; x.trollAura = true; x.lane = "other"; } return true;
    case "fp-ghast": ask(s, c, { kind: "buttons", label: "よろめく怪異", options: [{ value: "treasure", label: "宝物" }, { value: "shrink", label: "相手のクリーチャーに−1/−1" }] }); return true;
    case "fp-annex": if (s.battlefield.some(x => isType(x, "Demon"))) { changeLife(s, -2, "opponent"); changeLife(s, 2); } else changeLife(s, -2); return true;
    case "fp-door": if (source) { (source.unlockedDoors ||= []).push(op.index); if (source.faces[op.index].name === "Ritual Chamber") add(s, source, "部屋を開いた：悪魔", [{ op: "fp-demon" }]); } return true;
    case "fp-dellian-emblem": s.rules.dellianEmblems = (s.rules.dellianEmblems || 0) + 1; return true;
    case "fp-storm-emblem": s.rules.stormEmblems = (s.rules.stormEmblems || 0) + 1; return true;
    case "fp-source-pump": if (source) source.temporaryEffects.push({ power: op.power, toughness: op.toughness, turn: s.turn, label: c.sourceName }); return true;
    case "fp-copy-self": if (source) makeGameToken(s, copiableGoldfishValues(source)); return true;
    case "fp-linebreaker": if (t) t.temporaryEffects.push({ power: s.battlefield.filter(x => isType(x, "Eldrazi")).length, toughness: 0, keywords: ["haste"], turn: s.turn, label: c.sourceName }); return true;
    case "fp-sunderflock": for (const x of [...s.battlefield].filter(x => isType(x, "Creature") && !isType(x, "Elemental"))) move(s, x.id, "battlefield", "hand"); note(s, "相手も非エレメンタルのクリーチャーを手札へ戻す"); return true;
    case "fp-trespasser": for (const r of c.targets?.length ? c.targets : c.target ? [c.target] : []) { const x = find(s, r); if (x) { const creature = isType(x, "Creature"); move(s, x.id, "graveyard", "exile"); if (creature) { changeLife(s, -1, "opponent"); changeLife(s, 1); } } } return true;
    case "fp-hearse": if (source) for (const r of c.targets || []) { const x = find(s,r); if(x) { const ex = move(s, x.id, "graveyard", "exile"); (source.linkedExile ||= []).push(ref(ex, "exile")); } } return true;
    case "fp-bankbuster": if (source && !source.counters.charge) { makeGameToken(s, TOKENS.treasure); makeGameToken(s, { name: "Pilot", colors: [], typeLine: "Token Creature — Pilot", power: "1", toughness: "1", oracleText: "This token crews Vehicles as though its power were 2 greater." }); } return true;
    case "fp-devotion-life": changeLife(s, s.battlefield.reduce((n, x) => n + (face(x).manaCost?.match(/\{[^}]*G[^}]*\}/g) || []).length, 0)); return true;
    case "fp-discard-hand": insert(c, discard(s.hand.length)); return true;
    case "fp-level": if (source) source.level = op.level; return true;
    case "fp-barrow": yesNo(s, c, `${op.count}枚切削し、クリーチャー1枚を回収しますか？`); return true;
    case "fp-barrow-mill": {
      const refs = []; for (let i = 0; i < op.count && s.library.length; i++) { const x = move(s, s.library.at(-1).id, "library", "graveyard"); if (isType(x, "Creature") && s.graveyard.includes(x)) refs.push(ref(x, "graveyard")); }
      if (refs.length) ask(s, c, { kind: "cards", label: "切削したクリーチャーを手札へ（任意）", min: 0, max: 1, candidates: refs.map(r => ({ ref: r, label: name(find(s, r)) })) }); return true;
    }
    default: return false;
  }
}
export function chooseFormatPermanentStep(s, c, op, a) {
  const source = find(s, c.source);
  if (op.op === "fp-fantasticar-animate") {
    if (source && a.value === "yes" && !isType(source, "Creature")) {
      source.animated = { originalTypeLine: source.typeLine };
      source.typeLine += " Creature"; source.lane = "creature";
    }
    return true;
  }
  if (op.op === "fp-fantasticar-sacrifice") {
    if (source && a.value === "yes") {
      move(s, source.id, "battlefield", "graveyard", "effect-sacrifice");
      makeGameToken(s, { name: "Construct", typeLine: "Token Artifact Creature — Construct", colors: [], power: "4", toughness: "4", oracleText: "Flying, haste" }, 4);
    }
    return true;
  }
  if (op.op === "fp-moloid-mill") { if (a.value === "yes") insert(c, { op: "mill", count: 1 }); return true; }
  if (op.op === "fp-viper-choice") { if (a.value === "no") changeLife(s, -4, "opponent"); return true; }
  if (op.op === "fp-yuriko") { if (a.value === "surveil") insert(c, ...surveil(2)); else queue(s, source || c.snapshot, "墓地枚数分の−X/−0", [{ op: "fp-yuriko-shrink" }], { targetSpec: { ...creatureTarget, virtualOpponent: true } }); return true; }
  if (op.op === "fp-wolverine") { if (source) { source.damage = 0; damage(s, c.source, a.value); } return true; }
  if (op.op === "fp-prepare-eight") { if (a.value === "yes") insert(c, select("準備のため追放する墓地8枚", "graveyard", {}, { min: 8, max: 8, destination: "exile" }), { op: "fp-prepared" }); return true; }
  if (op.op === "fp-scout") { if (a.value === "yes") insert(c, tutor({ types: ["Desert"] }, "battlefield", { tapped: true })); return true; }
  if (op.op === "fp-amass") { const x = find(s, a.refs[0]); typeAs(x, face(x).typeLine + " Orc"); addGameCounters(s, x, "+1/+1", 1); return true; }
  if (op.op === "fp-delver") { if (a.value === "yes" && source && isType(s.library.at(-1), "Instant|Sorcery")) source.faceIndex = 1; return true; }
  if (op.op === "fp-zoraline") {
    if (a.value === "yes") { const p = planGoldfishPayment(s, { manaCost: "{W}{B}" }); if (!p.payable || s.players.self.life < p.life + 2) throw new Error("白黒と2ライフを支払えません。"); payGoldfishPlanDraft(s, p); changeLife(s, -2); queue(s, source || c.snapshot, "墓地の非土地を戻す", [{ op: "fp-finality-return" }], { targetSpec: { zone: "graveyard", permanent: true, notTypes: ["Land"], maxManaValue: 3 } }); }
    return true;
  }
  if (op.op === "fp-ghast") { if (a.value === "treasure") makeGameToken(s, TOKENS.treasure); else note(s, "相手のクリーチャー1体にターン終了まで−1/−1"); return true; }
  if (op.op === "fp-barrow") { if (a.value === "yes") insert(c, { op: "fp-barrow-mill", count: op.count }); return true; }
  if (op.op === "fp-barrow-mill") { for (const r of a.refs) move(s, r.id, "graveyard", "hand"); return true; }
  return false;
}
