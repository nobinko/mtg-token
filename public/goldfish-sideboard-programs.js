// Shared main/sideboard instructions, still gated by verified Oracle text.
const spell = { zone: "stack", spell: true, virtualOpponent: true };
const creature = { zone: "battlefield", types: ["Creature"], virtualOpponent: true };
const permanent = { zone: "battlefield", permanent: true, virtualOpponent: true };
const damage = { ...creature, types: ["Creature", "Planeswalker", "Battle"], players: true };
const counter = target => ({ steps: [{ op: "counter-target" }], target: { ...spell, ...target } });
const burn = (n, target = damage, rest = []) => ({ steps: [{ op: "damage", amount: n }, ...rest], target });
const select = (label, zone, filter, rest) => ({ op: "select", label, zone, filter, min: 0, max: 1, ...rest });
export const SIDEBOARD_SPELLS = {
  "Requiting Hex": { steps: [{ op: "destroy-target" }, { op: "requiting-life" }], target: { ...creature, maxManaValue: 2 } },
  "We Say Thee Nay!": { steps: [{ op: "teamwork-counter" }], target: spell },
  Countersculpt: { steps: [{ op: "counter-target" }, { op: "empower-jace", count: 1 }], target: spell },
  "Fanatical Offering": { steps: [{ op: "draw", count: 2 }, { op: "token", name: "map" }] },
  "Deadly Dispute": { steps: [{ op: "draw", count: 2 }, { op: "token", name: "treasure" }] },
  "Stir Up Trouble": { steps: [{ op: "destroy-target" }], target: creature },
  "Vicious Rivalry": { steps: [{ op: "vicious-rivalry" }] },
  "Toxic Deluge": { steps: [{ op: "deluge-x" }] },
  "Deadly Cover-Up": { steps: [{ op: "sweep", filter: { types: ["Creature"] } }, { op: "cover-up" }] },
  "Day of Black Sun": { steps: [{ op: "black-sun" }] },
  Negate: counter({ notTypes: ["Creature"] }),
  "Dovin's Veto": counter({ notTypes: ["Creature"] }),
  Annul: counter({ types: ["Artifact", "Enchantment"] }),
  Flashfreeze: counter({ colorsAny: ["R", "G"] }),
  "Disdainful Stroke": counter({ minManaValue: 4 }),
  "It'll Quench Ya!": { steps: [{ op: "counter-unless", cost: "{2}" }], target: spell },
  "Shoot the Sheriff": { steps: [{ op: "destroy-target" }], target: { ...creature, notSubtypes: ["Assassin", "Mercenary", "Pirate", "Rogue", "Warlock"] } },
  "Terminal Criticism": { steps: [{ op: "destroy-target" }, { op: "life", amount: 1 }], target: { ...creature, types: ["Creature", "Planeswalker"], colorsAny: ["U", "R"] } },
  "Traumatic Critique": burn("x", damage, [{ op: "draw", count: 2 }, select("捨てる手札", "hand", {}, { min: 1, destination: "graveyard" })]),
  "Broadside Barrage": burn(5, { ...creature, types: ["Creature", "Planeswalker"] }, [{ op: "draw", count: 1 }, select("捨てる手札", "hand", {}, { min: 1, destination: "graveyard" })]),
  "Lightning Strike": burn(3),
  "Fiery Temper": burn(3),
  "Scorching Shot": burn(5, creature),
  Pyroclasm: { steps: [{ op: "damage-sweep", amount: 2, filter: { types: ["Creature"] } }] },
  Languish: { steps: [{ op: "shrink-all", amount: 4 }] },
  "Pest Control": { steps: [{ op: "sweep", filter: { permanent: true, notTypes: ["Land"], maxManaValue: 1 } }] },
  "Octopus Form": { steps: [{ op: "pump", power: 1, toughness: 1 }, { op: "target-keyword", keywords: ["hexproof"] }, { op: "untap-target" }], target: { ...creature, virtualOpponent: false } },
  "Fading Hope": { steps: [{ op: "fading-hope" }], target: creature },
  "Plunder the Trollshaws": { steps: [{ op: "trollshaws-draw" }], flashback: "{3}{U}" },
  "Personal Tutor": { steps: [select("山札の一番上へ置くソーサリー", "library", { types: ["Sorcery"] }, { remember: "tutored", shuffle: true }), { op: "tutor-on-top" }] },
  "Edge of Autumn": { steps: [{ op: "edge-search" }] },
  "Seedship Impact": { steps: [{ op: "seedship-impact" }], target: { ...permanent, types: ["Artifact", "Enchantment"] } },
  "Peer into the Abyss": { steps: [{ op: "peer-abyss" }], target: { zone: "none", players: true } },
  "Accumulate Wisdom": { steps: [{ op: "accumulate" }] },
  "Price of Progress": { steps: [{ op: "progress-damage" }] },
  "Culling Ritual": { steps: [{ op: "culling-ritual" }] },
  "Go Blank": { steps: [{ op: "go-blank" }], target: { zone: "none", players: true } },
  "Settle the Wreckage": { steps: [{ op: "settle-wreckage" }], target: { zone: "none", players: true } },
  "Ultima": { steps: [{ op: "sweep", filter: { types: ["Artifact", "Creature"] } }, { op: "ultima" }] },
  "Price of Freedom": { steps: [{ op: "opponent-effect", text: "相手のアーティファクト／土地を破壊。相手は基本土地をタップ状態で探してもよい" }, { op: "draw", count: 1 }], target: { ...permanent, opposingPermanent: true, types: ["Artifact", "Land"] } },
  "Ancient Vendetta": { steps: [{ op: "name-card" }, { op: "opponent-effect", text: "指定したカード名を相手の手札・山札・墓地から最大4枚追放。相手はシャッフル" }], target: { zone: "none", opponentOnly: true } },
  "Outrageous Robbery": { steps: [{ op: "opponent-effect", text: "相手の山札からX枚を裏向きで追放し、追放されている間プレイ可能（相手の山札を使う場合はそのカードを用意）" }], target: { zone: "none", opponentOnly: true } },
  "Surge of Salvation": { steps: [{ op: "salvation" }] }
};
