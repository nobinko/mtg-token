// Programs used by the dated Standard, Legacy and Pioneer fixtures. The caller
// must verify the complete Oracle snapshot before exposing these adapters.
const creature = { zone: "battlefield", types: ["Creature"], virtualOpponent: true };
const spell = { zone: "stack", spell: true, virtualOpponent: true };
const damage = { zone: "battlefield", types: ["Creature", "Planeswalker", "Battle"], players: true };
const select = (label, zone, filter, rest) => ({ op: "select", label, zone, filter, min: 0, max: 1, ...rest });
const look = (count, take) => select(`上${count}枚から${take}枚を手札へ`, "library", {}, { top: count, min: take, max: take, destination: "hand", remainder: "libraryBottom" });
export const FORMAT_SPELLS = {
  "Get Out": { steps: [{ op: "format-targets" }] },
  "Tear Asunder": { steps: [{ op: "format-targets" }] },
  "Life from the Loam": { steps: [{ op: "format-targets" }] },
  "Lively Dirge": { steps: [{ op: "lively-dirge" }] },
  "Winternight Stories": { steps: [{ op: "draw", count: 3 }, { op: "stories-discard" }], harmonize: "{4}{U}" },
  "Stifle": { steps: [{ op: "counter-target" }], target: { zone: "stack", ability: true, virtualOpponent: true } },
  "Flusterstorm": { steps: [{ op: "counter-unless", cost: "{1}" }], target: { ...spell, types: ["Instant", "Sorcery"] } },
  "Inevitable Defeat": { steps: [{ op: "defeat" }], target: { ...creature, types: undefined, permanent: true, notTypes: ["Land"] } },
  "Doomsday": { steps: [{ op: "doomsday" }] },
  "Monstrous Rage": { steps: [{ op: "pump", power: 2, toughness: 0 }, { op: "monster-role" }], target: creature },
  "Prismari Charm": { steps: [{ op: "prismari" }] },
  "Theorix Charm": { steps: [{ op: "theorix" }] },
  "Practiced Offense": { steps: [{ op: "offense" }], flashback: "{1}{W}" },
  "Essence Flux": { steps: [{ op: "essence-flux" }], target: { zone: "battlefield", types: ["Creature"] } },
  "Fiery Impulse": { steps: [{ op: "spell-mastery-damage" }], target: creature },
  "Show and Tell": { steps: [select("手札から戦場へ出すカード（0〜1枚）", "hand", { types: ["Artifact", "Creature", "Enchantment", "Land"] }, { destination: "battlefield" }), { op: "opponent-effect", text: "相手も手札からアーティファクト／クリーチャー／エンチャント／土地を1枚出してもよい" }] },
  "Flashback": { steps: [{ op: "grant-flashback" }], target: { zone: "graveyard", types: ["Instant", "Sorcery"] } },
  "Sheltered by Ghosts": { steps: [{ op: "aura-resolve" }], target: { zone: "battlefield", types: ["Creature"] } },
  "Veil of Summer": { steps: [{ op: "veil" }] },
  "Mox Diamond": { steps: [{ op: "mox-entry" }] },
  "Force of Will": { steps: [{ op: "counter-target" }], target: spell },
  Daze: { steps: [{ op: "counter-unless", cost: "{1}" }], target: spell },
  "No More Lies": { steps: [{ op: "counter-unless", cost: "{3}", destination: "exile" }], target: spell },
  "Dark Ritual": { steps: [{ op: "mana", colors: ["B", "B", "B"] }] },
  "Cabal Ritual": { steps: [{ op: "ritual-threshold" }] },
  "Flow State": { steps: [{ op: "flow-state" }] },
  "Stock Up": { steps: [look(5, 2)] },
  "Day of Judgment": { steps: [{ op: "sweep", filter: { types: ["Creature"] } }] },
  "Bitter Triumph": { steps: [{ op: "destroy-target" }], target: { ...creature, types: ["Creature", "Planeswalker"] } },
  "Burst Lightning": { steps: [{ op: "kicked-damage", normal: 2, kicked: 4 }], target: damage },
  "Lightning Helix": { steps: [{ op: "damage", amount: 3 }, { op: "life", amount: 3 }], target: damage },
  "Swords to Plowshares": { steps: [{ op: "solitude" }], target: creature },
  "Get Lost": { steps: [{ op: "destroy-target" }, { op: "controller-maps", count: 2 }], target: { ...creature, types: ["Creature", "Enchantment", "Planeswalker"] } },
  Erode: { steps: [{ op: "destroy-target" }, { op: "controller-basic" }], target: { ...creature, types: ["Creature", "Planeswalker"] } },
  Duress: { steps: [{ op: "opponent-effect", text: "相手の手札を公開し、クリーチャーでも土地でもないカード1枚を選んで捨てる" }], target: { zone: "none", opponentOnly: true } },
  "Strategic Betrayal": { steps: [{ op: "opponent-effect", text: "相手が自分のクリーチャー1体と自分の墓地を追放する" }], target: { zone: "none", opponentOnly: true } },
  "Entomb": { steps: [select("墓地へ置くカード", "library", {}, { destination: "graveyard", shuffle: true })] },
  "Crop Rotation": { steps: [select("戦場に出す土地", "library", { types: ["Land"] }, { destination: "battlefield", shuffle: true })] },
  "Tendrils of Agony": { steps: [{ op: "drain-target", count: 2 }], target: { zone: "none", players: true } }
};
export const FORMAT_ENTERS = {
  "The Sackville-Bagginses": [select("生け贄にする別のクリーチャーかアーティファクト（0〜1枚）", "battlefield", { types: ["Creature", "Artifact"], excludeSelf: true }, { destination: "graveyard", reason: "effect-sacrifice" }), { op: "sackville-reward" }],
  "Cauldron Familiar": [{ op: "opponent-life", amount: -1 }, { op: "life", amount: 1 }],
  "Moseo, Vein's New Dean": [{ op: "token", name: "attackingPest" }],
  "Nova Hellkite": [{ op: "opponent-effect", text: "相手のクリーチャー1体に1点ダメージ" }],
  "Seam Rip": [{ op: "opponent-effect", text: "この縫い目破りが戦場を離れるまで、相手のマナ総量2以下の土地でないパーマネントを1つ追放" }],
  "Static Prison": [{ op: "opponent-effect", text: "この静牢が戦場を離れるまで、相手の土地でないパーマネントを1つ追放" }, { op: "energy", count: 2 }],
  "Thassa's Oracle": [{ op: "oracle-look" }, { op: "oracle-win" }],
  "Petrified Hamlet": [{ op: "name-card", landOnly: true }],
  "Pinnacle Starcage": [{ op: "starcage-exile" }],
  "Sunspine Lynx": [{ op: "lynx-damage" }],
  "Sheltered by Ghosts": [{ op: "opponent-effect", text: "このオーラが戦場を離れるまで、相手の土地でないパーマネントを1つ追放" }],
  "Dream Beavers": [{ op: "opponent-life", amount: -1 }, { op: "life", amount: 1 }, { op: "format-scry", count: 1 }],
  "Spyglass Siren": [{ op: "token", name: "map" }],
  "Biotech Specialist": [{ op: "token", name: "lander" }],
  "Seasoned Cryomancer": [{ op: "draw", count: 2 }, select("捨てる手札2枚", "hand", {}, { min: 2, max: 2, destination: "graveyard" }), { op: "cryomancer-reflexive" }],
  "Floodpits Drowner": [{ op: "opponent-effect", text: "相手のクリーチャー1体をタップし、麻痺カウンター1個を置く" }],
  "Wan Shi Tong, Librarian": [{ op: "source-counter", name: "+1/+1", count: "x" }, { op: "half-x-draw" }]
};
export const FORMAT_NOTES = {
  "Yavimaya, Cradle of Growth": "戦場の全土地に森を追加・緑マナの支払いに反映",
  "Urborg, Tomb of Yawgmoth": "戦場の全土地に沼を追加・黒マナの支払いに反映",
  "Life from the Loam": "墓地の土地0〜3枚を回収・各ドローで発掘3を選択",
  "Carnivorous Cultivator": "準備済みで登場・戦闘ダメージで墓地の土地を回収",
  "Glaring Fleshraker": "無色の呪文で落とし子・他の無色クリーチャー登場で1点",
  "Witch's Oven": "タップ・生け贄のコストを払い、食物を生成",
  "Cauldron Familiar": "食物を生け贄にして墓地から戻り、1点ドレイン",
  "Winternight Stories": "3枚引き、クリーチャー1枚または手札2枚を捨てる・調和",
  "Lotus Petal": "生け贄で好きな色のマナ",
  "Lion's Eye Diamond": "手札をすべて捨てて生け贄・同じ色3マナ。詠唱途中には起動しない",
  "Murktide Regent": "探査の追放・登場時のカウンター・墓地の呪文が離れた誘発",
  "Sheoldred, the Apocalypse": "自分の各ドローで2点回復",
  "Smaug the Magnificent": "アップキープの宝物・攻撃時に宝物の数だけダメージ",
  "Greedy Freebooter": "死亡時の占術1と宝物",
  ...Object.fromEntries(Object.keys(FORMAT_ENTERS).map(name => [name, "検証済みの登場時処理"])),
  "Biotech Specialist": "着陸船を生成・能力のコストでアーティファクトを生け贄にしたときの2点"
};

// Modal targets are declared before payment and revalidated at resolution.
// A mode with no target (e.g. Dirge's search) deliberately has no target spec.
export const FORMAT_MODES = {
  "Theorix Charm": [{ value: "mill", label: "3枚切削・1枚引く" }, { value: "counter", label: "非クリーチャー呪文を打ち消す（{2}で回避）" }, { value: "shrink", label: "クリーチャー1体に−2/−2" }],
  "Practiced Offense": [{ value: "self", label: "自分のクリーチャー全員に＋1/＋1カウンター" }, { value: "opponent", label: "相手のクリーチャー全員に＋1/＋1カウンター" }],
  "Prismari Charm": [{ value: "surveil", label: "諜報2・1枚引く" }, { value: "damage", label: "1〜2つの対象に各1点" }, { value: "return", label: "土地でないパーマネントを手札へ" }],
  "Get Out": [{ value: "counter", label: "クリーチャーかエンチャントの呪文を打ち消す" }, { value: "return", label: "自分のクリーチャー／エンチャント1〜2枚を手札へ" }],
  "Lively Dirge": [{ value: "tutor", label: "追加{1}：山札から墓地へ" }, { value: "return", label: "追加{2}：墓地から合計マナ総量4以下を2体まで戻す" }, { value: "both", label: "追加{3}：両方（探索してから戻す）" }]
};
export function formatTargetSpec(name, options = {}) {
  if (name === "Practiced Offense") return { ...creature, min: 1, max: 1 };
  if (name === "Theorix Charm") return options.mode === "mill" ? null : options.mode === "counter"
    ? { zone: "stack", spell: true, notTypes: ["Creature"], virtualOpponent: true, min: 1, max: 1, effect: "counter-unless", cost: "{2}" }
    : { ...creature, min: 1, max: 1, effect: "shrink" };
  if (name === "Prismari Charm") return options.mode === "surveil" ? null : options.mode === "damage"
    ? { ...damage, min: 1, max: 2, effect: "damage" }
    : { zone: "battlefield", permanent: true, notTypes: ["Land"], virtualOpponent: true, min: 1, max: 1, destination: "hand" };
  if (name === "Get Out") return options.mode === "counter"
    ? { zone: "stack", spell: true, types: ["Creature", "Enchantment"], virtualOpponent: true, min: 1, max: 1, effect: "counter" }
    : { zone: "battlefield", types: ["Creature", "Enchantment"], min: 1, max: 2, destination: "hand" };
  if (name === "Tear Asunder") return { zone: "battlefield", ...(options.kicked ? { permanent: true, notTypes: ["Land"] } : { types: ["Artifact", "Enchantment"] }), virtualOpponent: true, min: 1, max: 1, destination: "exile" };
  if (name === "Life from the Loam") return { zone: "graveyard", types: ["Land"], min: 0, max: 3, destination: "hand" };
  return null;
}
