// Programs used by the dated Standard, Legacy and Pioneer fixtures. The caller
// must verify the complete Oracle snapshot before exposing these adapters.
const creature = { zone: "battlefield", types: ["Creature"], virtualOpponent: true };
const spell = { zone: "stack", spell: true, virtualOpponent: true };
const damage = { zone: "battlefield", types: ["Creature", "Planeswalker", "Battle"], players: true };
const select = (label, zone, filter, rest) => ({ op: "select", label, zone, filter, min: 0, max: 1, ...rest });
const look = (count, take) => select(`上${count}枚から${take}枚を手札へ`, "library", {}, { top: count, min: take, max: take, destination: "hand", remainder: "libraryBottom" });
export const FORMAT_SPELLS = {
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
  "Dream Beavers": [{ op: "opponent-life", amount: -1 }, { op: "life", amount: 1 }, { op: "format-scry", count: 1 }],
  "Spyglass Siren": [{ op: "token", name: "map" }],
  "Biotech Specialist": [{ op: "token", name: "lander" }],
  "Seasoned Cryomancer": [{ op: "draw", count: 2 }, select("捨てる手札2枚", "hand", {}, { min: 2, max: 2, destination: "graveyard" }), { op: "cryomancer-reflexive" }],
  "Floodpits Drowner": [{ op: "opponent-effect", text: "相手のクリーチャー1体をタップし、麻痺カウンター1個を置く" }],
  "Wan Shi Tong, Librarian": [{ op: "source-counter", name: "+1/+1", count: "x" }, { op: "half-x-draw" }]
};
export const FORMAT_NOTES = {
  "Lotus Petal": "生け贄で好きな色のマナ",
  "Lion's Eye Diamond": "手札をすべて捨てて生け贄・同じ色3マナ。詠唱途中には起動しない",
  "Murktide Regent": "探査の追放・登場時のカウンター・墓地の呪文が離れた誘発",
  "Sheoldred, the Apocalypse": "自分の各ドローで2点回復",
  "Smaug the Magnificent": "アップキープの宝物・攻撃時に宝物の数だけダメージ",
  "Greedy Freebooter": "死亡時の占術1と宝物",
  ...Object.fromEntries(Object.keys(FORMAT_ENTERS).map(name => [name, "検証済みの登場時処理"])),
  "Biotech Specialist": "着陸船を生成・能力のコストでアーティファクトを生け贄にしたときの2点"
};
