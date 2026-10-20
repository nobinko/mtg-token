import { GOLD_FISH_CATALOG } from "./goldfish-catalog.js?v=20261020-public30b";
import { activeFace as face, cardName, isType } from "./goldfish-events.js?v=20261020-public30b";
import { FORMAT_SPELLS, FORMAT_NOTES } from "./goldfish-format-programs.js?v=20261020-public30b";

const normalized = text => String(text || "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
export function verifiedGoldfishCard(card) {
  const data = face(card), expected = GOLD_FISH_CATALOG[card.copyRuleName || data.name];
  return !!expected && card.automaticAbilities !== false && !card.faceDown && normalized(data.oracleText) === normalized(expected.oracleText);
}
// These are ability-level descriptions, never a claim of whole-card coverage.
export const ENGINE_RULE_NOTES = {
  ...FORMAT_NOTES,
  "Basking Broodscale": "カウンター獲得→落とし子。刃との反復を回数指定",
  "Blade of the Bloodchief": "死亡→装備先のカウンター",
  "Urza's Saga": "章の進行・構築物・第III章の探索と生け贄",
  "Devourer of Destiny": "初手の公開→最初のアップキープの選別。唱えた時の有色パーマネント追放",
  "Sowing Mycospawn": "唱えた時の土地探索・キッカーの土地追放",
  "Pompous Battlemage": "準備済みで出る。準備呪文のコピーを唱えて未準備へ",
  "Quantum Riddler": "戦場に出てドロー・手札1枚以下の追加ドロー・ワープ期限",
  "Leyline of the Guildpact": "初手から配置・土地タイプ5種・ドラコとの色参照",
  "Scion of Draco": "版図のコスト軽減・色ごとのキーワード付与",
  "Territorial Kavu": "版図のP/T・攻撃時の手札交換／墓地追放",
  "Wild Nacatl": "平地・山によるP/T修整",
  "Leyline Binding": "版図によるコスト軽減（追放対象は相手盤面の手動処理）",
  "Moonshadow": "6個の−1/−1で出る・永久物の墓地入りで1個除去",
  "Nethergoyf": "墓地タイプによるP/T・4タイプを追放して脱出",
  "Detective's Phoenix": "証拠収集を支払って授与・修整と速攻・装着先が離れた後のクリーチャー化",
  "Dark Matter Manipulator": "出た時3枚切削・墓地7枚ごとのパワー修整",
  "Fear of Missing Out": "出た時の手札交換・昂揚でアンタップと追加戦闘",
  "Pinnacle Emissary": "アーティファクト詠唱→ドローン・ワープ期限",
  "Weapons Manufacturing": "トークンでないアーティファクト→弾薬・弾薬離脱時の2点",
  "Kappa Cannoneer": "即席支払い・アーティファクト登場→カウンターとブロック不可",
  "Emry, Lurker of the Loch": "コスト軽減・4枚切削・墓地アーティファクトの詠唱許可",
  "Guide of Souls": "他のクリーチャー→回復とエネルギー。攻撃時の支払い→強化誘発",
  "Ocelot Pride": "終了時の猫・都市の承認・このターンのトークンのコピー",
  "Haliya, Guided by Light": "クリーチャー／アーティファクト登場で回復・終了時ドロー・ワープ",
  "Ajani, Nacatl Pariah": "猫戦士生成・他の猫の死亡で変身",
  "Ajani, Nacatl Avenger": "+2のカウンター・0の猫とダメージ誘発",
  "Voice of Victory": "攻撃時の動員2・終了時に戦士を生け贄",
  "Badgermole Cub": "土の技・土地の帰還・クリーチャーから追加マナ",
  "Vizier of Remedies": "−1/−1カウンターを1個減らす置換",
  "Ouroboroid": "戦闘開始時、パワー分のカウンターを各クリーチャーへ",
  "Craterhoof Behemoth": "出た時、クリーチャー数分の強化とトランプル",
  "Ral, Monsoon Mage": "呪文コスト軽減・コイン投げ・変身時の忠誠度",
  "Ruby Medallion": "赤の呪文の不特定マナ軽減",
  "Artist's Talent": "任意の手札交換・レベル2の軽減・相手への非戦闘ダメージ増加",
  "Stormchaser's Talent": "カワウソ生成・レベル2の回収誘発・レベル3の生成誘発",
  "Trinisphere": "無料詠唱とライフ支払いも含めた最低3マナ",
  "Vexing Bauble": "マナを使わない詠唱を打ち消す誘発",
  "The Ten Rings": "終了時、手札10枚までドロー"
};
export const TOKENS = {
  clue: { name: "Clue", typeLine: "Token Artifact — Clue", power: "", toughness: "", oracleText: "{2}, Sacrifice this token: Draw a card." },
  scion: { name: "Eldrazi Scion", typeLine: "Token Creature — Eldrazi Scion", power: "1", toughness: "1", oracleText: "Sacrifice this creature: Add {C}." },
  knight: { name: "Human Knight", colors: ["R"], typeLine: "Token Creature — Human Knight", power: "2", toughness: "2", oracleText: "Trample, haste" },
  treefolk: { name: "Treefolk", colors: ["G"], typeLine: "Token Creature — Treefolk", power: "3", toughness: "4", oracleText: "Reach" },
  angel: { name: "Angel", colors: ["W"], typeLine: "Token Creature — Angel", power: "4", toughness: "4", oracleText: "Flying, vigilance" },
  blood: { name: "Blood", typeLine: "Token Artifact — Blood", oracleText: "{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card." },
  jace: { name: "Jace", colors: ["U"], typeLine: "Token Planeswalker — Jace", oracleText: "−1: Surveil 1.\n−3: Draw a card.", loyalty: "0" },
  monk: { name: "Monk", colors: ["W"], typeLine: "Token Creature — Monk", power: "1", toughness: "1", oracleText: "Prowess" },
  food: { name: "Food", typeLine: "Token Artifact — Food", power: "", toughness: "", oracleText: "{2}, {T}, Sacrifice this artifact: You gain 3 life." },
  attackingPest: { name: "Pest", typeLine: "Token Creature — Pest", colors: ["B", "G"], power: "1", toughness: "1", oracleText: "Whenever this token attacks, you gain 1 life." },
  monsterRole: { name: "Monster Role", typeLine: "Token Enchantment — Aura Role", power: "", toughness: "", oracleText: "Enchant creature\nEnchanted creature gets +1/+1 and has trample." },
  map: { name: "Map", typeLine: "Token Artifact — Map", power: "", toughness: "", oracleText: "{1}, {T}, Sacrifice this artifact: Target creature you control explores. Activate only as a sorcery." },
  lander: { name: "Lander", typeLine: "Token Artifact — Lander", power: "", toughness: "", oracleText: "{2}, {T}, Sacrifice this artifact: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." },
  spawn: { name: "Eldrazi Spawn", typeLine: "Token Creature — Eldrazi Spawn", power: "0", toughness: "1", oracleText: "Sacrifice this creature: Add {C}." },
  construct: { name: "Construct", typeLine: "Token Artifact Creature — Construct", power: "0", toughness: "0", oracleText: "This token gets +1/+1 for each artifact you control." },
  drone: { name: "Drone", typeLine: "Token Artifact Creature — Drone", power: "1", toughness: "1", oracleText: "Flying\nThis token can block only creatures with flying." },
  cat: { name: "Cat", typeLine: "Token Creature — Cat", colors: ["W"], power: "1", toughness: "1" },
  catWarrior: { name: "Cat Warrior", typeLine: "Token Creature — Cat Warrior", colors: ["W"], power: "2", toughness: "1" },
  warrior: { name: "Warrior", typeLine: "Token Creature — Warrior", colors: ["R"], power: "1", toughness: "1" },
  elemental: { name: "Elemental", typeLine: "Token Creature — Elemental", colors: ["R"], power: "1", toughness: "1" },
  otter: { name: "Otter", typeLine: "Token Creature — Otter", colors: ["U", "R"], power: "1", toughness: "1", oracleText: "Prowess" },
  goblin: { name: "Goblin", typeLine: "Token Creature — Goblin", colors: ["R"], power: "1", toughness: "1" },
  treasure: { name: "Treasure", typeLine: "Token Artifact — Treasure", power: "", toughness: "", oracleText: "{T}, Sacrifice this artifact: Add one mana of any color." },
  munitions: { name: "Munitions", typeLine: "Token Artifact — Munitions", power: "", toughness: "", oracleText: "When this token leaves the battlefield, it deals 2 damage to any target." }
};
export const draw = (count = 1) => ({ op: "draw", count });
export const token = (name, count = 1) => ({ op: "token", name, count });
export const select = (label, zone, filter = {}, rest = {}) => ({ op: "select", label, zone, filter, min: 0, max: 1, ...rest });
export const tutor = (filter, destination = "hand", rest = {}) => select("山札から選ぶ", "library", filter, { destination, shuffle: true, ...rest });
export const discard = (count, rest = {}) => select("捨てる手札", "hand", {}, { min: count, max: count, destination: "graveyard", ...rest });
export const look = (count, filter, destination = "hand", remainder = "libraryBottom") => select(`上${count}枚から選ぶ`, "library", filter, { top: count, destination, remainder });
const ability = (id, label, cost, steps, extra = {}) => ({ id: `engine:${id}`, zone: "battlefield", cost, label, description: label, steps, ...extra });
export const creatureTarget = { zone: "battlefield", types: ["Creature"], label: "クリーチャーを選ぶ" };
export const damageTarget = { ...creatureTarget, types: ["Creature", "Planeswalker", "Battle"], players: true, label: "ダメージの対象" };

const SPELLS = {
  "Ancient Stirrings": [look(5, { colorless: true })],
  "Malevolent Rumble": [look(4, { permanent: true }, "hand", "graveyard"), token("spawn")],
  "Desperate Ritual": [{ op: "mana", colors: ["R", "R", "R"] }],
  "Pyretic Ritual": [{ op: "mana", colors: ["R", "R", "R"] }],
  "Reckless Impulse": [{ op: "impulse", count: 2 }],
  "Wrenn's Resolve": [{ op: "impulse", count: 2 }],
  "Hex Magic": [{ op: "hex" }],
  "Past in Flames": [{ op: "past-flames" }],
  Wish: [{ op: "wish" }],
  "Valakut Awakening": [select("山札の下に戻す手札を好きな枚数選ぶ", "hand", {}, { max: "all", destination: "libraryBottom", remember: "selected" }), { op: "draw-selected", extra: 1 }],
  "Twinned Vision": [{ op: "draw-empty" }],
  "Green Sun's Zenith": [tutor({ types: ["Creature"], color: "G", maxX: true }, "battlefield"), { op: "finish-zone", zone: "library" }],
  "Nature's Rhythm": [tutor({ types: ["Creature"], maxX: true }, "battlefield")],
  "Consult the Star Charts": [{ op: "consult" }],
  "Day's Undoing": [{ op: "days-undoing" }],
  "Tribal Flames": [{ op: "damage", amount: "domain" }],
  "Grapeshot": [{ op: "damage", amount: 1 }],
  "Empty the Warrens": [token("goblin", 2)],
  "Improvised Act": [discard(1, { min: 0, remember: "selected" }), { op: "draw-selected" }],
  "Boomerang Basics": [{ op: "bounce" }, { op: "boomerang-draw" }],
  "Galvanic Blast": [{ op: "damage", amount: "metalcraft" }],
  "Galvanic Discharge": [{ op: "energy", count: 3 }, { op: "energy-damage" }],
  "Dismember": [{ op: "pump", power: -5, toughness: -5 }],
  "Fatal Push": [{ op: "destroy", maxManaValue: "revolt" }],
  "Supreme Verdict": [{ op: "sweep", filter: { types: ["Creature"] } }],
  "Meltdown": [{ op: "sweep", filter: { types: ["Artifact"], maxX: true } }],
  "Wrath of the Skies": [{ op: "energy", count: "x" }, { op: "wrath-energy" }],
  "Kozilek's Command": [{ op: "kozilek-modes" }],
  "Orim's Chant": [{ op: "chant" }],
  Silence: [{ op: "restriction", label: "相手はこのターン呪文を唱えられない" }],
  "Thoughtseize": [{ op: "opponent-hand", nonland: true }, { op: "life", amount: -2 }],
  "Surgical Extraction": [{ op: "surgical" }]
  ,"March of Otherworldly Light": [{ op: "move-target", destination: "exile" }]
  ,"Prismatic Ending": [{ op: "converge-exile" }]
  ,"Thraben Charm": [{ op: "thraben" }]
  ,"Consign to Memory": [{ op: "counter-target" }]
  ,"Stubborn Denial": [{ op: "counter-unless", cost: "{1}", ferocious: true }]
  ,"Force of Negation": [{ op: "counter-target", destination: "exile" }]
  ,"Sink into Stupor": [{ op: "opponent-effect", text: "相手の呪文か土地でないパーマネントを手札へ戻す" }]
  ,"Spell Snare": [{ op: "counter-target" }]
  ,"Metallic Rebuke": [{ op: "counter-unless", cost: "{3}" }]
  ,"Spell Pierce": [{ op: "counter-unless", cost: "{2}" }]
  ,"Mystical Dispute": [{ op: "counter-unless", cost: "{3}" }]
  ,"Swan Song": [{ op: "counter-target" }, { op: "swan" }]
  ,"Nature's Claim": [{ op: "destroy-target" }, { op: "target-controller-life", amount: 4 }]
  ,"Abrupt Decay": [{ op: "destroy-target" }]
  ,"Celestial Purge": [{ op: "move-target", destination: "exile" }]
  ,"Inquisition of Kozilek": [{ op: "opponent-effect", text: "相手の手札からマナ総量3以下の土地でないカード1枚を捨てる" }]
  ,"Glistening Deluge": [{ op: "deluge" }]
  ,"Whipflare": [{ op: "damage-sweep", amount: 2, filter: { types: ["Creature"], notTypes: ["Artifact"] } }]
  ,"Brotherhood's End": [{ op: "brotherhood" }]
  ,"Warping Wail": [{ op: "wail" }]
  ,Wear: [{ op: "destroy-target" }]
  ,Tear: [{ op: "destroy-target" }]
};
const TARGETS = {
  "Surgical Extraction": { zone: "graveyard", nonBasic: true, virtualOpponent: true, label: "対象の墓地のカード（基本土地以外）" },
  "Orim's Chant": { zone: "none", players: true, label: "詠唱を止めるプレイヤー" },
  "Tribal Flames": damageTarget, Grapeshot: damageTarget, "Galvanic Blast": damageTarget,
  "Galvanic Discharge": { ...creatureTarget, types: ["Creature", "Planeswalker"] }, Dismember: creatureTarget, "Fatal Push": creatureTarget,
  "Boomerang Basics": { zone: "battlefield", types: ["Creature", "Artifact", "Enchantment", "Planeswalker", "Battle"], label: "手札へ戻すパーマネント" }
  ,"March of Otherworldly Light": { zone: "battlefield", types: ["Artifact", "Creature", "Enchantment"], maxX: true }
  ,"Prismatic Ending": { zone: "battlefield", permanent: true, notTypes: ["Land"] }
  ,"Consign to Memory": { zone: "stack", spellOrTriggered: true, colorlessSpell: true, virtualOpponent: true }
  ,"Stubborn Denial": { zone: "stack", spell: true, notTypes: ["Creature"], virtualOpponent: true }
  ,"Force of Negation": { zone: "stack", spell: true, notTypes: ["Creature"], virtualOpponent: true }
  ,"Spell Snare": { zone: "stack", spell: true, manaValue: 2, virtualOpponent: true }
  ,"Metallic Rebuke": { zone: "stack", spell: true, virtualOpponent: true }
  ,"Spell Pierce": { zone: "stack", spell: true, notTypes: ["Creature"], virtualOpponent: true }
  ,"Mystical Dispute": { zone: "stack", spell: true, virtualOpponent: true }
  ,"Swan Song": { zone: "stack", spell: true, types: ["Instant", "Sorcery", "Enchantment"], virtualOpponent: true }
  ,"Nature's Claim": { zone: "battlefield", types: ["Artifact", "Enchantment"], virtualOpponent: true }
  ,"Abrupt Decay": { zone: "battlefield", permanent: true, notTypes: ["Land"], maxManaValue: 3, virtualOpponent: true }
  ,"Celestial Purge": { zone: "battlefield", permanent: true, colorsAny: ["B", "R"], virtualOpponent: true }
  ,Wear: { zone: "battlefield", types: ["Artifact"], virtualOpponent: true }
  ,Tear: { zone: "battlefield", types: ["Enchantment"], virtualOpponent: true }
};
export function engineSpellProgram(card) {
  if (!verifiedGoldfishCard(card) || !isType(card, "Instant|Sorcery") && !["Sheltered by Ghosts", "Meltstrider's Resolve", "Mox Diamond"].includes(cardName(card))) return null;
  const name = cardName(card);
  if (FORMAT_SPELLS[name]) return { id: name, engine: true, ...FORMAT_SPELLS[name], label: "カードの効果を順に解決" };
  if (!SPELLS[name]) return null;
  if (card.cast?.fuse && ["Wear", "Tear"].includes(name)) return { id: "Wear // Tear", engine: true, steps: [{ op: "fuse-destroy" }], label: "アーティファクトとエンチャントを破壊" };
  const target = TARGETS[name];
  return { id: name, engine: true, steps: [...SPELLS[name], ...(card.cast?.spliced || []).flatMap(c => SPELLS[c.name] || [])], target: target && { ...target, virtualOpponent: target.virtualOpponent || target.zone === "battlefield" }, label: "カードの効果を順に解決", flashback: name === "Past in Flames" ? "{4}{R}" : undefined };
}

export function engineCardActions(card) {
  if (!card || card.faceDown || card.automaticAbilities === false) return [];
  const name = cardName(card), result = [];
  if (card.kind === "token") {
    if (name === "Clue") result.push(ability("clue", "{2}：手掛かりを生け贄にして1枚引く", "{2}", [draw()], { sacrifice: true }));
    if (name === "Blood") result.push(ability("blood-loot", "{1}：1枚捨て、血を生け贄にして1枚引く", "{1}", [draw()], { tap: true, sacrifice: true, costSelect: { zone: "hand", filter: {}, count: 1, destination: "graveyard" } }));
    if (name === "Jace" && card.oracleText === TOKENS.jace.oracleText) {
      result.push(ability("jace-token-surveil", "−1：諜報1", "{0}", [select("諜報1：墓地へ置くか、上に残す", "library", {}, { top: 1, destination: "graveyard" })], { main: true, loyalty: -1 }));
      result.push(ability("jace-token-draw", "−3：1枚引く", "{0}", [draw()], { main: true, loyalty: -3 }));
    }
    if (name === "Food") result.push(ability("food", "{2}：食物を生け贄にして3点回復", "{2}", [{ op: "life", amount: 3 }], { tap: true, sacrifice: true }));
    if (name === "Mutagen") result.push(ability("mutagen", "{1},{T}・生け贄：＋1/＋1カウンター", "{1}", [{ op: "target-counter", name: "+1/+1", count: 1 }], { main: true, tap: true, sacrifice: true, targetSpec: { zone: "battlefield", types: ["Creature"] } }));
    if (name === "Map") result.push(ability("map-explore", "{1}：生け贄にして探検", "{1}", [{ op: "explore" }], { main: true, tap: true, sacrifice: true, targetSpec: { zone: "battlefield", types: ["Creature"] } }));
    if (name === "Lander") result.push(ability("lander", "{2}：基本土地をタップ状態で探す", "{2}", [tutor({ types: ["Basic"], subtypes: ["Plains", "Island", "Swamp", "Mountain", "Forest"] }, "battlefield", { tapped: true })], { tap: true, sacrifice: true }));
    if (["Eldrazi Spawn", "Eldrazi Scion"].includes(name)) result.push(ability("spawn-mana", "生け贄にして {C}", "{0}", [{ op: "mana", colors: ["C"] }], { sacrifice: true, manaAbility: true }));
    if (name === "Treasure") result.push(ability("treasure", "宝物をマナにする", "{0}", [{ op: "mana-choice", count: 1 }], { tap: true, sacrifice: true, manaAbility: true }));
  }
  if (!verifiedGoldfishCard(card)) return result;
  const add = (...args) => result.push(ability(...args));
  if (["Seasoned Hallowblade", "Iron-Shield Elf", "Guardian of New Benalia"].includes(name)) add("discard-indestructible", "1枚捨てる：タップして破壊不能", "{0}", [{ op: "source-keyword", keyword: "indestructible" }, { op: "tap-source" }], { costSelect: { zone: "hand", filter: {}, count: 1, destination: "graveyard" } });
  if (name === "Fleeting Spirit") {
    add("spirit-firststrike", "{W}・墓地3枚を追放：先制攻撃", "{W}", [{ op: "source-keyword", keyword: "first strike" }], { costSelect: { zone: "graveyard", filter: {}, count: 3, destination: "exile" } });
    add("spirit-blink", "1枚捨てる：終了ステップまで追放", "{0}", [{ op: "spirit-blink" }], { costSelect: { zone: "hand", filter: {}, count: 1, destination: "graveyard" } });
  }
  const crew = face(card).oracleText.match(/\bCrew (\d+)/);
  if (crew) add("crew", `搭乗${crew[1]}：合計パワー${crew[1]}以上をタップ`, "{0}", [{ op: "crew" }], { costSelect: { zone: "battlefield", filter: { types: ["Creature"], untapped: true }, count: 1, variable: true, minPower: Number(crew[1]), destination: "tap" } });
  if (name === "Moon-Circuit Hacker") add("ninjutsu", "忍術 {U}：攻撃クリーチャーを手札へ戻して登場", "{U}", [{ op: "ninjutsu" }], { zone: "hand", ninjutsu: true, costSelect: { zone: "battlefield", filter: { types: ["Creature"], attacking: true }, count: 1, destination: "hand" } });
  if (name === "Sapling Nursery") add("nursery", "{1}{G}・追放：森とツリーフォークに破壊不能", "{1}{G}", [{ op: "nursery-protection" }], { exileSelf: true });
  if (name === "The Theorist, Jace Beleren") {
    add("theorist-plus", "＋1：イリュージョンを生成", "{0}", [{ op: "theorist-token" }], { main: true, loyalty: 1 });
    add("theorist-minus", "−2：相手の置物を戻す", "{0}", [{ op: "opponent-effect", text: "各対戦相手のアーティファクトまたはクリーチャーを最大1つずつ手札へ" }], { main: true, loyalty: -2 });
    add("theorist-ultimate", "−6：3枚引き、手札枚数分のカウンター", "{0}", [draw(3), { op: "theorist-counters" }], { main: true, loyalty: -6 });
  }
  if (name === "Street Wraith") add("wraith-cycle", "2ライフ：サイクリング", "{0}", [draw()], { zone: "hand", discardSelf: true, lifeCost: 2 });
  if (name === "Edge of Autumn") add("edge-cycle", "土地を生け贄：サイクリング", "{0}", [draw()], { zone: "hand", discardSelf: true, costSelect: { zone: "battlefield", filter: { types: ["Land"] }, count: 1, destination: "graveyard" } });
  if (name === "Pinnacle Starcage") add("starcage", "{6}{W}{W}：追放したカードを墓地へ・ロボット生成", "{6}{W}{W}", [{ op: "starcage-robots" }]);
  if (name === "Cauldron Familiar") add("familiar-return", "食物を生け贄：戦場へ戻す", "{0}", [{ op: "grave-source-battlefield" }], { zone: "graveyard", costSelect: { zone: "battlefield", filter: { types: ["Food"] }, count: 1, destination: "graveyard" } });
  if (name === "Witch's Oven") add("oven", "{T}：クリーチャーを生け贄にして食物を作る", "{0}", [{ op: "oven-food" }], { tap: true, costSelect: { zone: "battlefield", filter: { types: ["Creature"] }, count: 1, destination: "graveyard" } });
  if (name === "Lotus Petal") add("petal", "生け贄：好きな色1マナ", "{0}", [{ op: "mana-choice", count: 1 }], { tap: true, sacrifice: true, manaAbility: true });
  if (name === "Lion's Eye Diamond") add("diamond", "手札をすべて捨てて生け贄：同色3マナ", "{0}", [{ op: "mana-choice", count: 3, sameColor: true }], { sacrifice: true, discardHand: true, manaAbility: true });
  if (name === "Simian Spirit Guide") add("spirit-guide", "手札から追放：{R}", "{0}", [{ op: "mana", colors: ["R"] }], { zone: "hand", exileSelf: true, manaAbility: true });
  if (name === "Seasoned Cryomancer") add("cryomancer", "墓地から追放：2枚引く", "{3}{U}{U}", [draw(2)], { zone: "graveyard", exileSelf: true });
  if (name === "Leyline of Abundance") add("leyline-counters", "{6}{G}{G}：全クリーチャーに＋1/＋1カウンター", "{6}{G}{G}", [{ op: "team-counters", count: 1 }]);
  if (name === "High Noon") add("high-noon", "{4}{R}・生け贄：5点ダメージ", "{4}{R}", [{ op: "damage", amount: 5 }], { sacrifice: true, targetSpec: damageTarget });
  if (name === "Liquimetal Coating") add("coating", "{T}：パーマネントをアーティファクトにする", "{0}", [{ op: "artifact-until-end" }], { tap: true, targetSpec: { virtualOpponent: true, zone: "battlefield", permanent: true } });
  if (name === "Guerrilla Gorilla") add("gorilla", "生け贄：非クリーチャーの置物を破壊", "{0}", [{ op: "destroy-target" }], { main: true, sacrifice: true, targetSpec: { zone: "battlefield", types: ["Artifact", "Enchantment"], notTypes: ["Creature"], virtualOpponent: true } });
  if (name === "Ashiok, Dream Render") add("ashiok", "−1：4枚切削・相手の墓地追放", "{0}", [{ op: "ashiok" }], { main: true, loyalty: -1, targetSpec: { zone: "none", players: true } });
  if (name === "Grist, the Hunger Tide") {
    add("grist-plus", "+1：昆虫を生成・切削・昆虫なら反復", "{0}", [{ op: "grist-plus" }], { main: true, loyalty: 1 });
    add("grist-minus", "−2：任意で生け贄にしてクリーチャーかPWを破壊", "{0}", [select("生け贄にするクリーチャー（しなくてもよい）", "battlefield", { types: ["Creature"] }, { destination: "graveyard", remember: "sacrifice" }), { op: "grist-reflexive" }], { main: true, loyalty: -2 });
    add("grist-ultimate", "−5：墓地のクリーチャー数分、相手がライフを失う", "{0}", [{ op: "grist-drain" }], { main: true, loyalty: -5 });
  }
  if (name === "Boromir, Warden of the Tower") add("boromir", "生け贄：全クリーチャーに破壊不能・指輪の誘惑", "{0}", [{ op: "team-keyword", keyword: "indestructible" }, { op: "ring-tempts" }], { sacrifice: true });
  if (name === "Avatar Roku") add("roku-dragon", "{8}：4/4飛行・火の技4のドラゴン", "{8}", [{ op: "dragon" }]);
  if (name === "Extinguisher Battleship") add("station", "配備：別のクリーチャーをタップ", "{0}", [{ op: "station" }], { main: true, costSelect: { zone: "battlefield", filter: { types: ["Creature"], untapped: true, excludeSelf: true }, count: 1, destination: "tap" } });
  if (name === "Cityscape Leveler") add("unearth", "蘇生 {8}：墓地から戦場へ", "{8}", [{ op: "unearth" }], { zone: "graveyard", main: true });
  if (name === "Basking Broodscale") add("adapt", "順応1 {1}{G}", "{1}{G}", [{ op: "adapt" }]);
  if (name === "Urza's Saga") add("saga-construct", "構築物を生成 {2}, {T}", "{2}", [token("construct")], { tap: true, chapter: 2 });
  if (name === "Expedition Map") add("map", "土地を探す {2}", "{2}", [tutor({ types: ["Land"] })], { tap: true, sacrifice: true });
  if (name === "Springleaf Drum") add("drum", "クリーチャーをタップして好きな色のマナ", "{0}", [{ op: "mana-choice", count: 1 }], { tap: true, manaAbility: true, costSelect: { zone: "battlefield", filter: { types: ["Creature"], untapped: true, excludeSelf: true }, count: 1, destination: "tap" } });
  if (name === "Giant's Boulder") {
    add("boulder-mana", "{1}, {T}：好きな色のマナ", "{1}", [{ op: "mana-choice", count: 1 }], { tap: true, manaAbility: true });
    add("boulder-destroy", "{7}, {T}：生け贄にして破壊", "{7}", [{ op: "destroy-target" }], { tap: true, sacrifice: true, targetSpec: { virtualOpponent: true, zone: "battlefield", permanent: true } });
  }
  if (name === "Vexing Bauble") add("vexing-draw", "{1}, {T}：生け贄にして1枚引く", "{1}", [draw()], { tap: true, sacrifice: true });
  if (name === "Mystic Gate") add("gate-filter", "{W/U}, {T}：白・青のマナ2つ", "{W/U}", [{ op: "mana-choice", count: 2, colors: ["W", "U"] }], { tap: true, manaAbility: true });
  if (name === "Geier Reach Sanitarium") add("sanitarium", "{2}, {T}：1枚引いて1枚捨てる", "{2}", [draw(), discard(1), { op: "restriction", label: "相手も1枚引いて1枚捨てる（相手側の領域は省略）" }], { tap: true });
  if (name === "Monumental Henge") add("henge", "{2}{W}{W}, {T}：上5枚から歴史的なカード", "{2}{W}{W}", [{ ...look(5, { historic: true }), randomRemainder: true }], { tap: true });
  if (name === "Abstergo Entertainment") {
    add("abstergo-mana", "{1}, {T}：好きな色のマナ", "{1}", [{ op: "mana-choice", count: 1 }], { tap: true, manaAbility: true });
    add("abstergo-return", "{3}, {T}, 追放：歴史的なカードを回収・全墓地追放", "{3}", [{ op: "move-target", destination: "hand" }, { op: "exile-graveyard", player: "self" }, { op: "restriction", label: "相手の墓地も追放" }], { tap: true, exileSelf: true, targetSpec: { zone: "graveyard", historic: true, optional: true } });
  }
  if (name === "Otawara, Soaring City") add("otawara", "魂力：捨ててパーマネントを手札へ", "{3}{U}", [{ op: "bounce" }], { zone: "hand", discardSelf: true, legendaryDiscount: true, targetSpec: { virtualOpponent: true, zone: "battlefield", types: ["Artifact", "Creature", "Enchantment", "Planeswalker"] } });
  if (name === "Boseiju, Who Endures") add("boseiju", "魂力：捨てて相手の置物・特殊土地を破壊", "{1}{G}", [{ op: "restriction", label: "母聖樹：相手のアーティファクト／エンチャント／基本でない土地を破壊。相手は基本土地タイプを持つ土地を探せる（相手側の領域は省略）" }], { zone: "hand", discardSelf: true, legendaryDiscount: true });
  if (name === "Shadowspear") add("shadowspear", "{1}：相手の呪禁・破壊不能を失わせる", "{1}", [{ op: "restriction", label: "相手のパーマネントはターン終了まで呪禁・破壊不能を失う" }]);
  if (name === "Arena of Glory") add("arena", "{R}, {T}, 督励：{R}{R}・クリーチャーに速攻", "{R}", [{ op: "arena-mana" }], { tap: true, manaAbility: true });
  if (name === "Dalkovan Encampment") add("encampment", "{2}{W}, {T}：このターンの攻撃で戦士2体", "{2}{W}", [{ op: "encampment" }], { tap: true });
  if (name === "Ranger-Captain of Eos") add("ranger-silence", "生け贄：相手の非クリーチャー呪文を止める", "{0}", [{ op: "restriction", label: "相手はこのターン、非クリーチャー呪文を唱えられない" }], { sacrifice: true });
  if (name === "Shifting Woodland") add("woodland", "昂揚 {2}{G}{G}：墓地のパーマネントをコピー", "{2}{G}{G}", [{ op: "woodland-copy" }], { delirium: true, targetSpec: { zone: "graveyard", permanent: true } });
  if (name === "Haywire Mite") add("mite", "{G}：非クリーチャーのアーティファクトかエンチャントを追放", "{G}", [{ op: "move-target", destination: "exile" }], { sacrifice: true, targetSpec: { virtualOpponent: true, zone: "battlefield", types: ["Artifact", "Enchantment"], notTypes: ["Creature"] } });
  if (name === "Ugin's Labyrinth") add("labyrinth-return", "刻印したカードを戻す {T}", "{0}", [{ op: "imprint-return" }], { tap: true });
  if (name === "Isochron Scepter") add("scepter", "刻印した呪文のコピーを唱える {2}, {T}", "{2}", [{ op: "imprint-copy" }], { tap: true });
  if (name === "Salvage Titan") add("titan-return", "墓地のアーティファクト3枚を追放して手札へ", "{0}", [{ op: "grave-source-return" }], { zone: "graveyard", costSelect: { zone: "graveyard", filter: { types: ["Artifact"], excludeSelf: true }, count: 3, destination: "exile" } });
  if (name === "Tyvar, the Pummeler") {
    add("pummeler-protect", "別のクリーチャーをタップして破壊不能", "{0}", [{ op: "source-keyword", keyword: "indestructible" }, { op: "tap-source" }], { costSelect: { zone: "battlefield", filter: { types: ["Creature"], untapped: true, excludeSelf: true }, count: 1, destination: "tap" } });
    add("pummeler-boost", "最大パワー分、全員を強化 {3}{G}{G}", "{3}{G}{G}", [{ op: "pummeler" }]);
  }
  if (name === "Devoted Druid") add("druid-untap", "−1/−1カウンターを置いてアンタップ", "{0}", [{ op: "untap-source" }], { counterCost: { name: "-1/-1", amount: 1 } });
  if (name === "Duskwatch Recruiter") add("recruit", "上3枚からクリーチャー {2}{G}", "{2}{G}", [look(3, { types: ["Creature"] })]);
  if (name === "Formidable Speaker") add("speaker", "別のパーマネントをアンタップ {1}, {T}", "{1}", [{ op: "untap-target" }], { tap: true, targetSpec: { zone: "battlefield", permanent: true, excludeSelf: true } });
  if (name === "Leyline of Abundance") add("abundance", "全員に +1/+1カウンター {6}{G}{G}", "{6}{G}{G}", [{ op: "team-counters", count: 1 }]);
  if (name === "Goblin Bombardment") add("bombardment", "クリーチャーを生け贄に1点", "{0}", [{ op: "damage", amount: 1 }], { costSelect: { zone: "battlefield", filter: { types: ["Creature"] }, count: 1, destination: "graveyard" }, targetSpec: damageTarget });
  if (name === "Claws of Gix") add("claws", "パーマネントを生け贄に1点回復 {1}", "{1}", [{ op: "life", amount: 1 }], { costSelect: { zone: "battlefield", filter: { permanent: true }, count: 1, destination: "graveyard" } });
  if (name === "Seasoned Pyromancer") add("pyromancer-grave", "墓地から追放して精霊2体 {3}{R}{R}", "{3}{R}{R}", [token("elemental", 2)], { zone: "graveyard", exileSelf: true });
  if (name === "Street Wraith") add("wraith-cycle", "サイクリング — 2ライフ", "{0}", [draw()], { zone: "hand", lifeCost: 2, discardSelf: true });
  if (name === "Troll of Khazad-dûm") add("swampcycle", "沼サイクリング {1}", "{1}", [tutor({ subtypes: ["Swamp"] })], { zone: "hand", discardSelf: true });
  if (name === "Stormchaser's Talent") {
    add("otter-level2", "レベル2：墓地の呪文を戻す {3}{U}", "{3}{U}", [{ op: "level", level: 2 }], { main: true, fromLevel: 1 });
    add("otter-level3", "レベル3：呪文ごとにカワウソ {5}{U}", "{5}{U}", [{ op: "level", level: 3 }], { main: true, fromLevel: 2 });
  }
  if (name === "Artist's Talent") {
    add("artist-level2", "レベル2：非クリーチャーのコスト−1 {2}{R}", "{2}{R}", [{ op: "level", level: 2 }], { main: true, fromLevel: 1 });
    add("artist-level3", "レベル3：ダメージ+2 {2}{R}", "{2}{R}", [{ op: "level", level: 3 }], { main: true, fromLevel: 2 });
  }
  if (name === "Emry, Lurker of the Loch") add("emry", "墓地のアーティファクトを唱えられるようにする {T}", "{0}", [{ op: "grant-cast" }], { tap: true, targetSpec: { zone: "graveyard", types: ["Artifact"] } });
  if (name === "Engineered Explosives") add("explosives", "蓄積と同じマナ総量を破壊 {2}", "{2}", [{ op: "explosives" }], { sacrifice: true });
  if (name === "Tormod's Crypt") add("crypt", "墓地を追放", "{0}", [{ op: "grave-exile" }], { tap: true, sacrifice: true });
  if (name === "Nihil Spellbomb") add("nihil", "生け贄にして墓地を追放", "{0}", [{ op: "grave-exile" }], { tap: true, sacrifice: true });
  if (name === "Soul-Guide Lantern") {
    add("lantern-draw", "生け贄に1枚引く {1}", "{1}", [draw()], { tap: true, sacrifice: true });
    add("lantern-exile", "相手の墓地を追放", "{0}", [{ op: "restriction", label: "相手の墓地を追放" }], { tap: true, sacrifice: true });
  }
  if (name === "Welding Jar") add("jar", "アーティファクトを再生", "{0}", [{ op: "regenerate" }], { sacrifice: true, targetSpec: { zone: "battlefield", types: ["Artifact"] } });
  if (name === "Fiend Artisan") add("artisan", "生け贄にしてクリーチャーを探す X{B/G}", "{X}{B/G}", [tutor({ types: ["Creature"], maxX: true }, "battlefield")], { tap: true, main: true, x: true, costSelect: { zone: "battlefield", filter: { types: ["Creature"], excludeSelf: true }, count: 1, destination: "graveyard" } });
  if (name === "Tyvar, Jubilant Brawler") {
    add("tyvar-plus", "+1：クリーチャーをアンタップ", "{0}", [{ op: "untap-target" }], { main: true, loyalty: 1, targetSpec: creatureTarget });
    add("tyvar-minus", "−2：3枚切削、墓地の2マナ以下を戦場へ", "{0}", [{ op: "mill", count: 3 }, select("戦場に戻す", "graveyard", { types: ["Creature"], maxManaValue: 2 }, { destination: "battlefield" })], { main: true, loyalty: -2 });
  }
  if (name === "Narset, Parter of Veils") add("narset", "−2：上4枚からクリーチャーでも土地でもない1枚", "{0}", [look(4, { notTypes: ["Creature", "Land"] })], { main: true, loyalty: -2 });
  if (name === "Jace, the Mind Sculptor") {
    add("jace-draw", "0：3枚引き、手札2枚を戻す", "{0}", [draw(3), select("次に引く順に手札2枚を選ぶ", "hand", {}, { min: 2, max: 2, destination: "libraryTop" })], { main: true, loyalty: 0 });
    add("jace-bounce", "−1：クリーチャーを戻す", "{0}", [{ op: "bounce" }], { main: true, loyalty: -1, targetSpec: { ...creatureTarget, virtualOpponent: true } });
    add("jace-scry", "+2：対象プレイヤーの上1枚を見て上下へ", "{0}", [{ op: "jace-top" }], { main: true, loyalty: 2, targetSpec: { zone: "none", players: true } });
    add("jace-ultimate", "−12：対象の山札を追放・手札を山札へ", "{0}", [{ op: "jace-ultimate" }], { main: true, loyalty: -12, targetSpec: { zone: "none", players: true } });
  }
  if (name === "Teferi, Time Raveler") {
    add("teferi-plus", "+1：次の自分のターンまでソーサリーに瞬速", "{0}", [{ op: "teferi-flash" }], { main: true, loyalty: 1 });
    add("teferi-minus", "−3：戻して1枚引く", "{0}", [{ op: "bounce" }, draw()], { main: true, loyalty: -3, targetSpec: { virtualOpponent: true, zone: "battlefield", types: ["Artifact", "Creature", "Enchantment"], optional: true } });
  }
  if (name === "Karn, the Great Creator") {
    add("karn-wish", "−2：サイドボードか追放のアーティファクトを手札へ", "{0}", [select("アーティファクトを手札へ", ["sideboard", "exile"], { types: ["Artifact"], nonToken: true }, { destination: "hand" })], { main: true, loyalty: -2 });
    add("karn-animate", "+1：アーティファクトをクリーチャーに", "{0}", [{ op: "animate-artifact" }], { main: true, loyalty: 1, targetSpec: { virtualOpponent: true, zone: "battlefield", types: ["Artifact"], notTypes: ["Creature"], optional: true } });
  }
  if (name === "Ugin, Eye of the Storms") {
    add("ugin-plus", "+2：3点回復、1枚引く", "{0}", [{ op: "life", amount: 3 }, draw()], { main: true, loyalty: 2 });
    add("ugin-mana", "0：{C}{C}{C}", "{0}", [{ op: "mana", colors: ["C", "C", "C"] }], { main: true, loyalty: 0 });
    add("ugin-ultimate", "−11：無色の呪文を探して無料で唱えられる", "{0}", [select("無料で唱える無色のカードを選ぶ", "library", { colorless: true, notTypes: ["Land"] }, { max: "all", destination: "exile", shuffle: true, remember: "freeCards" }), { op: "grant-free-cast" }], { main: true, loyalty: -11 });
  }
  if (name === "Ajani, Nacatl Avenger") {
    add("ajani-plus", "+2：各猫に +1/+1カウンター", "{0}", [{ op: "team-counters", count: 1, subtype: "Cat" }], { main: true, loyalty: 2 });
    add("ajani-zero", "0：猫戦士を生成・赤があればダメージ", "{0}", [token("catWarrior"), { op: "ajani-damage" }], { main: true, loyalty: 0 });
    add("ajani-ultimate", "−4：相手は各種類1つを残して生け贄", "{0}", [{ op: "restriction", label: "アジャニ−4：相手は土地でないアーティファクト・クリーチャー・エンチャント・プレインズウォーカーを各1つ選び、それ以外の土地でないパーマネントを生け贄（相手側の領域は省略）" }], { main: true, loyalty: -4 });
  }
  if (name === "Ral, Leyline Prodigy") {
    add("ral-plus", "+1：次の自分のターンまで呪文を軽減", "{0}", [{ op: "ral-reduce" }], { main: true, loyalty: 1 });
    add("ral-minus", "−2：2点を1〜2対象へ配分・青があればドロー", "{0}", [{ op: "divided-damage" }, { op: "ral-draw" }], { main: true, loyalty: -2, divideDamage: 2, targetSpec: damageTarget });
    add("ral-ultimate", "−8：上8枚のインスタント・ソーサリーを無料で唱える", "{0}", [{ op: "impulse", count: 8, free: true, instantSorcery: true, expiresNow: true }], { main: true, loyalty: -8 });
  }
  return result;
}
