// ---- 色・戦略フォールバック推定 ----

// 土地名 → 含む色文字列 (WUBRG各文字)
// Pioneer・Modern・Legacyの主要デュアルランドを網羅。
// Standard特有の最新ランドは逐次追加する。
const LAND_COLOR_MAP = {
  // 基本土地・雪氷基本土地
  "Plains": "W", "Island": "U", "Swamp": "B", "Mountain": "R", "Forest": "G",
  "Snow-Covered Plains": "W", "Snow-Covered Island": "U",
  "Snow-Covered Swamp": "B", "Snow-Covered Mountain": "R", "Snow-Covered Forest": "G",
  // フェッチランド (Onslaught / Zendikar)
  "Flooded Strand": "WU", "Polluted Delta": "UB", "Bloodstained Mire": "BR",
  "Wooded Foothills": "RG", "Windswept Heath": "GW", "Scalding Tarn": "UR",
  "Misty Rainforest": "GU", "Arid Mesa": "RW", "Marsh Flats": "WB",
  "Verdant Catacombs": "BG",
  // ショックランド (Ravnica)
  "Hallowed Fountain": "WU", "Watery Grave": "UB", "Blood Crypt": "BR",
  "Stomping Ground": "RG", "Temple Garden": "GW", "Steam Vents": "UR",
  "Breeding Pool": "GU", "Sacred Foundry": "RW", "Godless Shrine": "WB",
  "Overgrown Tomb": "BG",
  // デュアルランド (Legacy / Revised)
  "Tundra": "WU", "Underground Sea": "UB", "Badlands": "BR",
  "Taiga": "RG", "Savannah": "GW", "Volcanic Island": "UR",
  "Tropical Island": "GU", "Plateau": "RW", "Scrubland": "WB", "Bayou": "BG",
  // チェックランド (Innistrad)
  "Glacial Fortress": "WU", "Drowned Catacomb": "UB", "Dragonskull Summit": "BR",
  "Rootbound Crag": "RG", "Sunpetal Grove": "GW", "Sulfur Falls": "UR",
  "Hinterland Harbor": "GU", "Clifftop Retreat": "RW", "Isolated Chapel": "WB",
  "Woodland Cemetery": "BG",
  // ファストランド (Kaladesh / Scars of Mirrodin)
  "Inspiring Vantage": "RW", "Spirebluff Canal": "UR", "Botanical Sanctum": "GU",
  "Concealed Courtyard": "WB", "Blooming Marsh": "BG",
  "Darkslick Shores": "UB", "Razorverge Thicket": "GW", "Blackcleave Cliffs": "BR",
  "Copperline Gorge": "RG", "Seachrome Coast": "WU",
  // ペインランド (Ice Age / 10th)
  "Adarkar Wastes": "WU", "Underground River": "UB", "Sulfurous Springs": "BR",
  "Karplusan Forest": "RG", "Brushland": "GW", "Shivan Reef": "UR",
  "Yavimaya Coast": "GU", "Battlefield Forge": "RW", "Caves of Koilos": "WB",
  "Llanowar Wastes": "BG",
  // ホライゾンランド (Modern Horizons)
  "Sunbaked Canyon": "RW", "Fiery Islet": "UR", "Nurturing Peatland": "BG",
  "Silent Clearing": "WB", "Waterlogged Grove": "GU", "Horizon Canopy": "GW",
  // トライオーム (Ikoria)
  "Raugrin Triome": "WUR", "Zagoth Triome": "UBG", "Savai Triome": "WBR",
  "Ketria Triome": "URG", "Indatha Triome": "WBG",
  // パスウェイランド (Zendikar Rising / Kaldheim)
  "Hengegate Pathway": "WU", "Brightclimb Pathway": "WB", "Needleverge Pathway": "RW",
  "Branchloft Pathway": "GW", "Clearwater Pathway": "UB", "Riverglide Pathway": "UR",
  "Barkchannel Pathway": "GU", "Blightstep Pathway": "BR",
  "Cragcrown Pathway": "RG", "Darkbore Pathway": "BG",
  // Standard サーベイランド (Murders at Karlov Manor, 2024)
  "Meticulous Archive": "WU", "Elegant Parlor": "WB", "Thundering Falls": "UR",
  "Raucous Theater": "BR", "Lush Portico": "GW", "Shadowy Backstreet": "UB",
  "Hedge Maze": "GU", "Underground Mortuary": "BG",
};

// 色の組み合わせ → ギルド・シャード名
const COLOR_NAMES = {
  "W": "Mono-White", "U": "Mono-Blue", "B": "Mono-Black",
  "R": "Mono-Red",   "G": "Mono-Green",
  "WU": "Azorius",  "WB": "Orzhov",  "WR": "Boros",   "WG": "Selesnya",
  "UB": "Dimir",    "UR": "Izzet",   "UG": "Simic",
  "BR": "Rakdos",   "BG": "Golgari", "RG": "Gruul",
  "WUB": "Esper",   "WUR": "Jeskai", "WUG": "Bant",
  "WBR": "Mardu",   "WBG": "Abzan",  "WRG": "Naya",
  "UBR": "Grixis",  "UBG": "Sultai", "URG": "Temur",
  "BRG": "Jund",
};

// コントロール指標: 打ち消し・全体除去
const CONTROL_SIGNALS = new Set([
  "Counterspell", "No More Lies", "Negate", "Absorb", "Mana Leak", "Remand",
  "Cryptic Command", "Force of Will", "Force of Negation", "Daze", "Flusterstorm",
  "Spell Pierce", "Spell Snare", "Make Disappear", "Essence Scatter",
  "Syncopate", "Dissipate", "Dissolve", "Cancel",
  "Day of Judgment", "Wrath of God", "Supreme Verdict", "Sunfall", "Doomskar",
  "Farewell", "Fumigate", "Temporary Lockdown", "Depopulate",
  "Settle the Wreckage", "Shatter the Sky", "Extinction Event",
  "Shadows' Verdict", "Ritual of Soot", "Anger of the Gods",
  "Sweltering Suns", "Flame Sweep",
]);

// アグロ指標: 1マナ攻撃的クリーチャー・バーンスペル
// ここに載るカードは archetypeRules に届かなかった真のローグデッキ向け。
// archetypeRules で既知アーキタイプを先に捕捉すれば、ここは滅多に参照されない。
const AGGRO_SIGNALS = new Set([
  // 現行 Standard (2026)
  "Hired Claw", "Nova Hellkite", "Razorkin Needlehead",
  "Ojer Axonil, Deepest Might", "Stadium Headliner",
  // Pioneer / Modern
  "Monastery Swiftspear", "Goblin Guide", "Slickshot Show-Off",
  "Ragavan, Nimble Pilferer", "Ghitu Lavarunner", "Eidolon of the Great Revel",
  "Dragon's Rage Channeler", "Soul-Scar Mage", "Delver of Secrets",
  "Zurgo Bellstriker", "Champion of the Parish",
  // バーンスペル
  "Lightning Bolt", "Burst Lightning", "Lightning Strike", "Play with Fire",
  "Searing Spear", "Shock", "Lava Spike", "Rift Bolt", "Skullcrack",
  "Atarka's Command", "Boros Charm", "Light Up the Stage", "Shard Volley",
]);

// ---- 日本語圏のデッキ名称を主キー級に扱うアーキタイプ辞書 ----

export const archetypeLexicon = [
  {
    id: "izzet-prowess",
    canonicalName: "Izzet Prowess",
    localNameJa: "イゼット果敢",
    aliases: ["Izzet Prowess", "イゼット果敢", "青赤果敢", "UR Prowess"],
    colors: ["U", "R"],
    macroPlan: "aggro",
    deckNameType: ["color+mechanic"],
    engineTags: ["prowess", "spells", "tempo"],
    signatureCards: ["Slickshot Show-Off", "Flow State", "Stormchaser's Talent", "Elusive Otter", "Wild Ride"],
    tokenRiskTags: ["prowess-token-check", "plot-check"],
    relatedArchetypes: ["イゼット講義", "イゼット・スペレメンタル"]
  },
  {
    id: "izzet-lessons",
    canonicalName: "Izzet Lessons",
    localNameJa: "イゼット講義",
    aliases: ["Izzet Lessons", "イゼット講義", "青赤講義", "イゼットレッスン", "UR Lessons"],
    colors: ["U", "R"],
    macroPlan: "control",
    deckNameType: ["color+engine"],
    engineTags: ["lessons", "spells", "graveyard-threshold", "control"],
    signatureCards: ["Gran-Gran", "Firebending Lesson", "Accumulate Wisdom", "It'll Quench Ya!", "Combustion Technique"],
    tokenRiskTags: ["lesson-engine-check"],
    relatedArchetypes: ["イゼット果敢", "イゼット・スペレメンタル"]
  },
  {
    id: "izzet-spellementals",
    canonicalName: "Izzet Spellementals",
    localNameJa: "イゼット・スペレメンタル",
    aliases: ["Izzet Spellementals", "イゼット・スペレメンタル", "イゼットスペレメンタル", "青赤スペレメンタル", "UR Spellementals"],
    colors: ["U", "R"],
    macroPlan: "tempo",
    deckNameType: ["color+engine"],
    engineTags: ["spells", "elemental", "graveyard"],
    signatureCards: ["Eddymurk Crab", "Hearth Elemental", "Sunderflock", "Winternight Stories", "Abandon Attachments"],
    tokenRiskTags: ["spells-engine-check"],
    relatedArchetypes: ["イゼット果敢", "イゼット講義"]
  },
  {
    id: "izzet-masters",
    canonicalName: "Izzet Masters",
    localNameJa: "イゼット巨匠",
    aliases: ["Izzet Masters", "Izzet Elementals", "イゼット巨匠", "イゼット・エレメンタル", "イゼットエレメンタル"],
    colors: ["U", "R"],
    macroPlan: "midrange",
    deckNameType: ["color+signature"],
    engineTags: ["spells", "elemental", "signature-creature"],
    signatureCards: ["Ashling Rekindled", "Flamebraider", "Vibrance", "Roaming Throne", "Wistfulness"],
    tokenRiskTags: ["signature-engine-check"],
    relatedArchetypes: ["イゼット果敢", "イゼット講義"]
  },
  {
    id: "mono-green-landfall",
    canonicalName: "Mono-Green Landfall",
    localNameJa: "緑単上陸",
    aliases: ["Mono-Green Landfall", "Mono Green Landfall", "緑単上陸", "緑単ランドフォール"],
    colors: ["G"],
    macroPlan: "aggro",
    deckNameType: ["color+mechanic"],
    engineTags: ["landfall", "counters", "creatures"],
    signatureCards: ["Earthbender Ascension", "Badgermole Cub", "Icetill Explorer", "Sazh's Chocobo", "Llanowar Elves"],
    tokenRiskTags: ["counter-dice-ok"],
    relatedArchetypes: ["セレズニア上陸"]
  },
  {
    id: "selesnya-landfall",
    canonicalName: "Selesnya Landfall",
    localNameJa: "セレズニア上陸",
    aliases: ["Selesnya Landfall", "セレズニア上陸", "緑白上陸", "GW Landfall"],
    colors: ["G", "W"],
    macroPlan: "aggro",
    deckNameType: ["color+mechanic"],
    engineTags: ["landfall", "counters", "creatures"],
    signatureCards: ["Sazh's Chocobo", "Mightform Harmonizer", "Dyadrine", "Earthbender Ascension"],
    tokenRiskTags: ["counter-dice-ok"],
    relatedArchetypes: ["緑単上陸"]
  },
  {
    id: "azorius-momo",
    canonicalName: "Azorius Momo",
    localNameJa: "アゾリウス・モモ",
    aliases: ["Azorius Momo", "アゾリウス・モモ", "アゾリウスモモ", "青白モモ", "UW Momo"],
    colors: ["W", "U"],
    macroPlan: "tempo",
    deckNameType: ["color+signature"],
    engineTags: ["fliers", "lifelink", "signature-creature"],
    signatureCards: ["Momo Friendly Flier", "Haliya Guided by Light", "Starfield Shepherd", "Cosmogrand Zenith", "Springleaf Drum"],
    tokenRiskTags: ["signature-token-check"],
    relatedArchetypes: ["アゾリウス・テンポ"]
  },
  {
    id: "azorius-tempo",
    canonicalName: "Azorius Tempo",
    localNameJa: "アゾリウス・テンポ",
    aliases: ["Azorius Tempo", "アゾリウス・テンポ", "アゾリウステンポ", "青白テンポ", "UW Tempo"],
    colors: ["W", "U"],
    macroPlan: "tempo",
    deckNameType: ["color+plan"],
    engineTags: ["tempo", "fliers", "interaction"],
    signatureCards: ["Aven Interrupter", "Spyglass Siren", "Get Lost", "No More Lies"],
    tokenRiskTags: ["low-token-risk"],
    relatedArchetypes: ["アゾリウス・モモ"]
  },
  {
    id: "jeskai-control",
    canonicalName: "Jeskai Control",
    localNameJa: "ジェスカイ・コントロール",
    aliases: ["Jeskai Control", "ジェスカイ・コントロール", "ジェスカイコントロール", "Jeskai"],
    colors: ["U", "R", "W"],
    macroPlan: "control",
    deckNameType: ["color+plan"],
    engineTags: ["control", "sweepers", "card-draw"],
    signatureCards: ["Jeskai Revelation", "Consult the Star Charts", "No More Lies", "Lightning Helix", "Wan Shi Tong Librarian"],
    tokenRiskTags: ["emblem-check", "low-token-risk"],
    relatedArchetypes: []
  },
  {
    id: "golgari-midrange",
    canonicalName: "Golgari Midrange",
    localNameJa: "ゴルガリ・ミッドレンジ",
    aliases: ["Golgari Midrange", "ゴルガリ・ミッドレンジ", "ゴルガリミッドレンジ", "黒緑ミッドレンジ", "BG Midrange"],
    colors: ["B", "G"],
    macroPlan: "midrange",
    deckNameType: ["color+plan"],
    engineTags: ["midrange", "value", "removal"],
    signatureCards: ["Professor Dellian Fel", "Unholy Annex", "Dredger's Insight", "Requiting Hex"],
    tokenRiskTags: ["value-engine-check"],
    relatedArchetypes: []
  },
  {
    id: "dimir-excruciator",
    canonicalName: "Dimir Excruciator",
    localNameJa: "ディミーア加虐者",
    aliases: ["Dimir Excruciator", "ディミーア加虐者", "ディミーア・エクスクルシエーター", "青黒加虐者", "UB Excruciator"],
    colors: ["U", "B"],
    macroPlan: "control",
    deckNameType: ["color+signature"],
    engineTags: ["control", "signature-creature", "removal"],
    signatureCards: ["Doomsday Excruciator", "Deceit", "Insatiable Avarice", "Day of Black Sun", "Bitter Triumph"],
    tokenRiskTags: ["low-token-risk"],
    relatedArchetypes: ["ディミーア・ミッドレンジ"]
  },
  {
    id: "dimir-midrange",
    canonicalName: "Dimir Midrange",
    localNameJa: "ディミーア・ミッドレンジ",
    aliases: ["Dimir Midrange", "ディミーア・ミッドレンジ", "ディミーアミッドレンジ", "青黒ミッドレンジ", "UB Midrange"],
    colors: ["U", "B"],
    macroPlan: "midrange",
    deckNameType: ["color+plan"],
    engineTags: ["midrange", "tempo", "value"],
    signatureCards: ["Kaito, Bane of Nightmares", "Floodpits Drowner", "Dream Beavers", "Spyglass Siren", "Super Shredder"],
    tokenRiskTags: ["value-engine-check"],
    relatedArchetypes: ["ディミーア加虐者"]
  },
  {
    id: "sultai-reanimator",
    canonicalName: "Sultai Reanimator",
    localNameJa: "スゥルタイ・リアニメイト",
    aliases: ["Sultai Reanimator", "スゥルタイ・リアニメイト", "スゥルタイリアニメイト", "スゥルタイ・コントロール", "Sultai Control"],
    colors: ["B", "G", "U"],
    macroPlan: "combo",
    deckNameType: ["color+engine"],
    engineTags: ["reanimator", "graveyard", "combo"],
    signatureCards: ["Bringer of the Last Gift", "Dredger's Insight", "Formidable Speaker", "Overlord Balemurk", "Ardyn Usurper"],
    tokenRiskTags: ["graveyard-engine-check"],
    relatedArchetypes: []
  },
  {
    id: "simic-omniscience",
    canonicalName: "Simic Omniscience",
    localNameJa: "シミック全知",
    aliases: ["Simic Omniscience", "シミック全知", "青緑全知", "UG Omniscience"],
    colors: ["U", "G"],
    macroPlan: "combo",
    deckNameType: ["color+signature"],
    engineTags: ["combo", "big-spell"],
    signatureCards: ["Kona, Rescue Beastie", "Omniscience", "Uthros, Titanic Godcore", "North Wind Avatar"],
    tokenRiskTags: ["combo-piece-check"],
    relatedArchetypes: ["バント全知"]
  },
  {
    id: "bant-rhythm",
    canonicalName: "Bant Rhythm",
    localNameJa: "バント律動",
    aliases: ["Bant Rhythm", "バント律動", "バント・リズム"],
    colors: ["G", "W", "U"],
    macroPlan: "midrange",
    deckNameType: ["color+engine"],
    engineTags: ["rhythm", "creatures", "graveyard"],
    signatureCards: ["Nature's Rhythm", "Spider Manifestation", "Gene Pollinator", "Craterhoof Behemoth", "Brightglass Gearhulk"],
    tokenRiskTags: ["creature-token-check"],
    relatedArchetypes: ["セレズニア律動", "シミック律動"]
  },
  {
    id: "selesnya-rhythm",
    canonicalName: "Selesnya Rhythm",
    localNameJa: "セレズニア律動",
    aliases: ["Selesnya Rhythm", "セレズニア律動", "セレズニア・リズム", "GW Rhythm"],
    colors: ["G", "W"],
    macroPlan: "midrange",
    deckNameType: ["color+engine"],
    engineTags: ["rhythm", "creatures"],
    signatureCards: ["Nature's Rhythm", "Gene Pollinator", "Archdruid's Charm", "Abandoned Air Temple"],
    tokenRiskTags: ["creature-token-check"],
    relatedArchetypes: ["バント律動", "シミック律動"]
  },
  {
    id: "selesnya-ouroboroid",
    canonicalName: "Selesnya Ouroboroid",
    localNameJa: "セレズニア・ウロボロイド",
    aliases: ["Selesnya Ouroboroid", "セレズニア・ウロボロイド", "セレズニアウロボロイド"],
    colors: ["G", "W"],
    macroPlan: "midrange",
    deckNameType: ["color+signature"],
    engineTags: ["creatures", "graveyard", "signature-creature"],
    signatureCards: ["Ouroboroid", "Keen-Eyed Curator", "Pawpatch Recruit", "Sage of the Skies"],
    tokenRiskTags: ["creature-token-check"],
    relatedArchetypes: ["セレズニア律動"]
  },
  {
    id: "boros-mobilize",
    canonicalName: "Boros Mobilize",
    localNameJa: "ボロス動員",
    aliases: ["Boros Mobilize", "ボロス動員", "ボロス・モビライズ", "RW Mobilize"],
    colors: ["R", "W"],
    macroPlan: "aggro",
    deckNameType: ["color+mechanic"],
    engineTags: ["mobilize", "tokens", "go-wide"],
    signatureCards: ["Stadium Headliner", "Voice of Victory", "Warleader's Call", "Shocking Sharpshooter", "Dalkovan Encampment"],
    tokenRiskTags: ["warrior-token-high"],
    relatedArchetypes: []
  },
  {
    id: "mono-red-aggro",
    canonicalName: "Mono-Red Aggro",
    localNameJa: "赤単アグロ",
    aliases: ["Mono-Red Aggro", "Mono Red Aggro", "赤単アグロ", "赤単", "Red Deck Wins"],
    colors: ["R"],
    macroPlan: "aggro",
    deckNameType: ["color+plan"],
    engineTags: ["aggro", "burn"],
    signatureCards: ["Hired Claw", "Nova Hellkite", "Razorkin Needlehead", "Ojer Axonil, Deepest Might"],
    tokenRiskTags: ["low-token-risk"],
    relatedArchetypes: []
  },
  {
    id: "mardu-discard",
    canonicalName: "Mardu Discard",
    localNameJa: "マルドゥ・ディスカード",
    aliases: ["Mardu Discard", "マルドゥ・ディスカード", "マルドゥディスカード"],
    colors: ["R", "W", "B"],
    macroPlan: "midrange",
    deckNameType: ["color+engine"],
    engineTags: ["discard", "graveyard", "midrange"],
    signatureCards: ["Hardened Academic", "Bloodghast", "Moonshadow", "Bitter Triumph"],
    tokenRiskTags: ["graveyard-engine-check"],
    relatedArchetypes: ["ラクドス・ディスカード"]
  },
  {
    id: "rakdos-discard",
    canonicalName: "Rakdos Discard",
    localNameJa: "ラクドス・ディスカード",
    aliases: ["Rakdos Discard", "ラクドス・ディスカード", "ラクドスディスカード", "黒赤ディスカード"],
    colors: ["B", "R"],
    macroPlan: "midrange",
    deckNameType: ["color+engine"],
    engineTags: ["discard", "graveyard", "midrange"],
    signatureCards: ["Bloodghast", "Moonshadow", "Bitter Triumph", "Monument to Endurance"],
    tokenRiskTags: ["graveyard-engine-check"],
    relatedArchetypes: ["マルドゥ・ディスカード"]
  }
];

function normalizeArchetypeKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[・._\/()[\]{}'"“”‘’]/g, " ")
    .replace(/[‐‑‒–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function displayNameForIdentity(identity) {
  return identity?.localNameJa || identity?.canonicalName || "Unknown";
}

function cloneIdentity(identity, confidence = 1, matchedBy = "lexicon") {
  if (!identity) return null;
  return {
    id: identity.id,
    canonicalName: identity.canonicalName,
    localNameJa: identity.localNameJa,
    displayName: displayNameForIdentity(identity),
    aliases: identity.aliases,
    sourceNames: [...new Set([identity.localNameJa, identity.canonicalName, ...(identity.aliases || [])].filter(Boolean))],
    colors: identity.colors,
    macroPlan: identity.macroPlan,
    deckNameType: identity.deckNameType,
    engineTags: identity.engineTags,
    signatureCards: identity.signatureCards,
    tokenRiskTags: identity.tokenRiskTags,
    relatedArchetypes: identity.relatedArchetypes,
    confidence,
    matchedBy
  };
}

const archetypeAliasIndex = new Map();
for (const entry of archetypeLexicon) {
  for (const alias of [entry.id, entry.canonicalName, entry.localNameJa, ...(entry.aliases || [])]) {
    archetypeAliasIndex.set(normalizeArchetypeKey(alias), entry);
  }
}

function detectColorsFromCards(cards) {
  const colors = new Set();
  for (const card of cards) {
    // DFC ("Name A // Name B") の両面を考慮
    for (const part of card.split(" // ")) {
      const colorStr = LAND_COLOR_MAP[part.trim()];
      if (colorStr) {
        for (const c of colorStr) colors.add(c);
      }
    }
  }
  return colors;
}

function colorLabel(colors) {
  if (colors.size === 0) return "";
  if (colors.size >= 5) return "Domain";
  if (colors.size === 4) return "Four-Color";
  const WUBRG = "WUBRG";
  const key = [...colors].sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b)).join("");
  return COLOR_NAMES[key] ?? "";
}

function strategyLabel(cards) {
  const cardSet = new Set(cards);
  let controlScore = 0;
  let aggroScore = 0;
  for (const card of cardSet) {
    if (CONTROL_SIGNALS.has(card)) controlScore++;
    if (AGGRO_SIGNALS.has(card)) aggroScore++;
  }
  if (controlScore >= 2) return "Control";
  if (aggroScore >= 3) return "Aggro";
  return "Midrange";
}

/**
 * Unknown デッキの最終フォールバック推定。
 * 土地名から色を検出し、既知カードセットから戦略を推定して "{色名} {戦略}" を返す。
 * 色も戦略シグナルも得られない場合は "Unknown" を維持する。
 */
export function inferFallbackArchetype(cards) {
  if (!cards?.length) return "Unknown";
  const colors = detectColorsFromCards(cards);
  const color = colorLabel(colors);
  const strategy = strategyLabel(cards);
  if (!color && strategy === "Midrange") return "Unknown";
  return [color, strategy].filter(Boolean).join(" ");
}

// ---- 既存のアーキタイプ推定ロジック ----

const COLOR_WORDS = /\b(mono[\s-]?(red|blue|black|white|green)|dimir|izzet|rakdos|golgari|selesnya|azorius|orzhov|simic|gruul|boros|jeskai|sultai|mardu|abzan|temur|naya|esper|grixis|jund|bant|four[\s-]color|five[\s-]color|domain)\b/i;
const STRATEGY_WORDS = /\b(aggro|midrange|control|ramp|prowess|convoke|reanimator|burn|tempo|tokens?|storm|combo|mill|lifegain|affinity|landfall|sacrifice|flash)\b/i;
const SITE_BRANDING = /晴れる屋(マジック)?|hareruyamtg\.com|hareruya\.com|MTGGoldfish|MTGDecks|MTGTop8|magic\.gg|mtg-jp\.com|melee\.gg|spellbinder\.gg|mtgo\.com/gi;
const NOISE_WORDS = /\b(top\s*\d*|rank\s*\d*|decklist|decklists|standard|pioneer|modern|legacy|event|championship|regional|spotlight|platinum|mythic|rank\s+player|magic\s+play|coverage|player)\b/gi;

// Standard アーキタイプルール (2026-05 PT Secrets of Strixhaven 基準)
// 各ルールのカードは「そのアーキタイプに固有で複数枚採用される」ものを優先。
// 汎用カード (Opt, Burst Lightning, Stock Up 等) は識別子として使わない。
// ルールの並び順: 特定性が高い（識別しやすい）ものを先に置く。
const archetypeRules = [
  // ---- Izzet 系（全体の約50%。固有カードで確実に分離する） ----
  // Gran-Gran は Izzet Lessons 専用の Secrets of Strixhaven 新カード
  { name: "Izzet Lessons",       cards: ["Gran-Gran", "Firebending Lesson", "Accumulate Wisdom", "It'll Quench Ya!", "Combustion Technique"] },
  // Eddymurk Crab + Hearth Elemental は Spellementals 固有
  { name: "Izzet Spellementals", cards: ["Eddymurk Crab", "Hearth Elemental", "Sunderflock", "Winternight Stories", "Abandon Attachments"] },
  // Ashling Rekindled + Flamebraider は Elementals 固有
  { name: "Izzet Elementals",    cards: ["Ashling Rekindled", "Flamebraider", "Vibrance", "Roaming Throne", "Wistfulness"] },
  // Slickshot Show-Off + Flow State が Prowess の核心
  { name: "Izzet Prowess",       cards: ["Slickshot Show-Off", "Flow State", "Stormchaser's Talent", "Elusive Otter", "Wild Ride"] },

  // ---- Dimir 系 ----
  // Doomsday Excruciator はこのアーキタイプ専用の固有カード
  { name: "Dimir Excruciator",   cards: ["Doomsday Excruciator", "Deceit", "Insatiable Avarice", "Day of Black Sun", "Bitter Triumph"] },
  // Bringer of the Last Gift で Reanimator を識別
  { name: "Sultai Reanimator",   cards: ["Bringer of the Last Gift", "Dredger's Insight", "Formidable Speaker", "Overlord Balemurk", "Ardyn Usurper"] },
  // Kaito, Floodpits Drowner が Dimir Midrange 固有
  { name: "Dimir Midrange",      cards: ["Kaito, Bane of Nightmares", "Floodpits Drowner", "Dream Beavers", "Spyglass Siren", "Super Shredder"] },

  // ---- Green 系（Landfall と Rhythm は識別が重要） ----
  // Bant Rhythm は Spider Manifestation (青) の有無で Selesnya と分離
  { name: "Bant Rhythm",         cards: ["Nature's Rhythm", "Spider Manifestation", "Gene Pollinator", "Craterhoof Behemoth", "Brightglass Gearhulk"] },
  // Selesnya Ouroboroid: Keen-Eyed Curator + Pawpatch Recruit が固有
  { name: "Selesnya Ouroboroid", cards: ["Ouroboroid", "Keen-Eyed Curator", "Pawpatch Recruit", "Sage of the Skies"] },
  // Selesnya Rhythm: Nature's Rhythm + Archdruid's Charm
  { name: "Selesnya Rhythm",     cards: ["Nature's Rhythm", "Gene Pollinator", "Archdruid's Charm", "Abandoned Air Temple"] },
  // Selesnya Landfall: 白のランドフォールカード有り
  { name: "Selesnya Landfall",   cards: ["Sazh's Chocobo", "Mightform Harmonizer", "Dyadrine", "Earthbender Ascension"] },
  // Mono-Green Landfall: Earthbender Ascension + Badgermole Cub + 緑単
  { name: "Mono-Green Landfall", cards: ["Earthbender Ascension", "Badgermole Cub", "Icetill Explorer", "Sazh's Chocobo", "Llanowar Elves"] },

  // ---- White 系 ----
  // Momo Friendly Flier は Azorius Momo 専用
  { name: "Azorius Momo",        cards: ["Momo Friendly Flier", "Haliya Guided by Light", "Starfield Shepherd", "Cosmogrand Zenith", "Springleaf Drum"] },

  // ---- コントロール・コンボ ----
  { name: "Jeskai Control",      cards: ["Jeskai Revelation", "Consult the Star Charts", "No More Lies", "Lightning Helix", "Wan Shi Tong Librarian"] },
  // Kona, Rescue Beastie + Omniscience がコンボの核
  { name: "Simic Omniscience",   cards: ["Kona, Rescue Beastie", "Omniscience", "Uthros, Titanic Godcore", "North Wind Avatar"] },

  // ---- アグロ ----
  { name: "Boros Mobilize",      cards: ["Stadium Headliner", "Voice of Victory", "Warleader's Call", "Shocking Sharpshooter", "Dalkovan Encampment"] },
  // Hired Claw + Nova Hellkite が現行 Mono-Red Aggro の核
  { name: "Mono-Red Aggro",      cards: ["Hired Claw", "Nova Hellkite", "Razorkin Needlehead", "Ojer Axonil, Deepest Might"] },

  // ---- その他ミッドレンジ ----
  { name: "Golgari Midrange",    cards: ["Professor Dellian Fel", "Unholy Annex", "Dredger's Insight", "Requiting Hex"] },
  { name: "Mardu Discard",       cards: ["Hardened Academic", "Bloodghast", "Moonshadow", "Bitter Triumph"] },
];

export function resolveArchetypeIdentity(name, { confidence = 1, matchedBy = "name" } = {}) {
  const key = normalizeArchetypeKey(name);
  if (!key || key === "unknown") return null;
  const direct = archetypeAliasIndex.get(key);
  if (direct) return cloneIdentity(direct, confidence, matchedBy);

  let best = null;
  for (const [aliasKey, entry] of archetypeAliasIndex.entries()) {
    if (aliasKey.length < 4) continue;
    if (key.includes(aliasKey) || aliasKey.includes(key)) {
      if (!best || aliasKey.length > best.aliasKey.length) best = { aliasKey, entry };
    }
  }
  return best ? cloneIdentity(best.entry, Math.min(confidence, 0.9), matchedBy) : null;
}

export function resolveArchetypeIdentityFromCards(cards) {
  const cardSet = new Set(cards || []);
  let best = { entry: null, hits: 0, ratio: 0 };
  for (const entry of archetypeLexicon) {
    const signatures = entry.signatureCards || [];
    if (!signatures.length) continue;
    const hits = signatures.filter((card) => cardSet.has(card)).length;
    const ratio = hits / signatures.length;
    if (hits > best.hits || (hits === best.hits && ratio > best.ratio)) {
      best = { entry, hits, ratio };
    }
  }
  if (!best.entry || (best.hits < 2 && best.ratio < 0.5)) return null;
  return cloneIdentity(best.entry, Math.min(0.95, 0.55 + best.ratio), "signature-cards");
}

export function fallbackArchetypeIdentity(name, cards = []) {
  const resolved = resolveArchetypeIdentity(name, { confidence: 0.9, matchedBy: "fallback-name" });
  if (resolved) return resolved;
  const colors = detectColorsFromCards(cards);
  const color = colorLabel(colors);
  const strategy = String(name || "").split(/\s+/).find((part) => /aggro|midrange|control|combo|ramp|tempo/i.test(part)) || strategyLabel(cards);
  if (!name || name === "Unknown") return null;
  return {
    id: `fallback-${normalizeArchetypeKey(name).replace(/\s+/g, "-")}`,
    canonicalName: name,
    localNameJa: "",
    displayName: name,
    aliases: [name],
    sourceNames: [name],
    colors: [...colors],
    macroPlan: strategy ? strategy.toLowerCase() : "unknown",
    deckNameType: color ? ["color+plan"] : ["source-label"],
    engineTags: [],
    signatureCards: [],
    tokenRiskTags: [],
    relatedArchetypes: [],
    confidence: 0.45,
    matchedBy: "fallback"
  };
}

export function inferArchetypeFromCards(cards, fallbackName) {
  const identity = resolveArchetypeIdentityFromCards(cards);
  if (identity) return identity.displayName;

  const cardSet = new Set(cards);
  let best = { name: "", hits: 0, ratio: 0 };
  for (const rule of archetypeRules) {
    const hits = rule.cards.filter((card) => cardSet.has(card)).length;
    const ratio = hits / rule.cards.length;
    if (hits > best.hits || (hits === best.hits && ratio > best.ratio)) {
      best = { name: rule.name, hits, ratio };
    }
  }
  if (best.hits >= 2 || best.ratio >= 0.5) {
    return resolveArchetypeIdentity(best.name, { confidence: Math.min(0.95, 0.55 + best.ratio), matchedBy: "rule" })?.displayName || best.name;
  }
  return resolveArchetypeIdentity(fallbackName, { confidence: 0.8, matchedBy: "fallback-name" })?.displayName || fallbackName;
}

export function inferArchetype(title, fallback = "") {
  const raw = `${title || ""} ${fallback || ""}`.trim();
  if (!raw) return "Unknown";

  // Strip site branding and noise, then look for the archetype-like segment
  const cleaned = raw
    .replace(SITE_BRANDING, "")
    .replace(/\s+by\s+\S+/gi, "")
    .replace(NOISE_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\-–—|:,\s]+|[\-–—|:,\s]+$/g, "")
    .trim();

  if (!cleaned || /^deck\s*\d*$/i.test(cleaned)) return "Unknown";

  // Split on the first matching separator and collect non-trivial segments
  const separators = [" - ", " – ", " — ", " | ", "：", ":"];
  let parts = [cleaned];
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      parts = cleaned.split(sep).map((p) => p.trim()).filter((p) => p.length > 2 && /\w/.test(p));
      break;
    }
  }
  if (!parts.length) return "Unknown";

  // Prefer the segment that looks like a Standard archetype name
  const best = parts.find((p) => COLOR_WORDS.test(p) && p.length < 60)
    ?? parts.find((p) => STRATEGY_WORDS.test(p) && p.length < 60)
    ?? parts[0];

  if (!best || best.length >= 80) return "Unknown";
  return resolveArchetypeIdentity(best, { confidence: 0.85, matchedBy: "title" })?.displayName || best;
}

/**
 * メタゲームページのHTMLからアーキタイプ名一覧を抽出する。
 * 現在対応: 晴れる屋 (/ja/deck/N/metagame/)、MTGGoldfish (/metagame/)
 */
export function extractArchetypeNames(html, url) {
  const names = new Set();

  // 晴れる屋: href に archetypeIds= を含むリンク内の最初の <div> テキスト
  if (url.includes("hareruyamtg.com")) {
    const linkPattern = /href="[^"]*archetypeIds=[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkPattern.exec(html))) {
      const divMatch = m[1].match(/<div[^>]*>([\s\S]*?)<\/div>/);
      if (divMatch) {
        const name = divMatch[1].replace(/<[^>]+>/g, "").trim();
        if (name && name.length >= 2 && name.length < 60) names.add(name);
      }
    }
  }

  // MTGGoldfish: /archetype/NAME 形式のリンク
  if (url.includes("mtggoldfish.com/metagame")) {
    const linkPattern = /href="\/archetype\/([^"?#]+)"/gi;
    let m;
    while ((m = linkPattern.exec(html))) {
      const name = decodeURIComponent(m[1]).replace(/[+_-]/g, " ").replace(/\s+/g, " ").trim();
      if (name && name.length >= 2 && name.length < 60) names.add(name);
    }
  }

  return names;
}

/**
 * デッキタイトルを既知のアーキタイプ名リストと照合して一致するものを返す。
 * 完全一致を最優先し、次に最長部分一致（より具体的なアーキタイプ名を優先）を返す。
 * 例: "Izzet" と "Izzet Prowess" が両方あれば、"Izzet Prowess" を優先する。
 */
export function matchKnownArchetype(title, knownArchetypes) {
  if (!title || !knownArchetypes || knownArchetypes.size === 0) return null;
  const titleLower = title.toLowerCase();
  let bestMatch = null;
  for (const name of knownArchetypes) {
    const nameLower = name.toLowerCase();
    if (titleLower === nameLower) {
      return resolveArchetypeIdentity(name, { confidence: 0.98, matchedBy: "source-label" })?.displayName || name;
    }
    if (titleLower.includes(nameLower)) {
      // より長い（具体的な）名前を優先
      if (!bestMatch || name.length > bestMatch.length) bestMatch = name;
    }
  }
  return resolveArchetypeIdentity(bestMatch, { confidence: 0.9, matchedBy: "source-label" })?.displayName || bestMatch;
}

export function buildArchetypeProfiles(deckEntries) {
  const byArchetype = new Map();
  for (const deck of deckEntries) {
    const name = deck.archetype;
    if (!name || name === "Unknown") continue;
    if (!byArchetype.has(name)) byArchetype.set(name, []);
    byArchetype.get(name).push(deck.cards || []);
  }

  const profiles = new Map();
  for (const [archetype, deckCards] of byArchetype) {
    if (deckCards.length < 2) continue;
    const cardCount = new Map();
    for (const cards of deckCards) {
      for (const card of cards) cardCount.set(card, (cardCount.get(card) || 0) + 1);
    }
    const threshold = Math.max(2, deckCards.length * 0.4);
    const coreCards = new Set(
      [...cardCount.entries()].filter(([, count]) => count >= threshold).map(([card]) => card)
    );
    if (coreCards.size >= 3) profiles.set(archetype, coreCards);
  }
  return profiles;
}

export function classifyByProfile(cards, profiles) {
  const cardSet = new Set(cards);
  let best = { archetype: "Unknown", score: 0, matches: 0 };
  for (const [archetype, coreCards] of profiles) {
    const matches = [...coreCards].filter((card) => cardSet.has(card)).length;
    const score = matches / coreCards.size;
    if (score > best.score || (score === best.score && matches > best.matches)) {
      best = { archetype, score, matches };
    }
  }
  return best.score >= 0.25 && best.matches >= 2 ? best.archetype : "Unknown";
}

export function archetypeStats(decks) {
  const counts = new Map();
  const identities = new Map();
  for (const deck of decks || []) {
    const identity = deck.archetypeIdentity
      || resolveArchetypeIdentity(deck.archetype, { confidence: 0.8, matchedBy: "stats" })
      || fallbackArchetypeIdentity(deck.archetype, deck.cards || []);
    const name = identity?.displayName || deck.archetype || "Unknown";
    counts.set(name, (counts.get(name) || 0) + 1);
    if (identity && !identities.has(name)) identities.set(name, identity);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return [...counts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      percent: total ? Math.round((count / total) * 1000) / 10 : 0,
      identity: identities.get(name) || null
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function overallArchetypeStats(decks) {
  const stats = archetypeStats(decks);
  const total = decks.length || 1;
  return stats.map((item) => ({
    ...item,
    percent: Math.round((item.count / total) * 1000) / 10
  }));
}
