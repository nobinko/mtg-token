import { imageRefFor, officialExpansionCode, officialExpansionName } from "./util.js";
import { archetypeStats } from "./archetype.js";
import { fetchRelatedCard, fetchJapaneseName, fetchJapaneseRelatedObjectName, fetchPreferredTokenPrint } from "./scryfall.js";
import { exactTokenJapaneseNameMap, tokenJapaneseNameMap } from "./data.js";
import { objectKey } from "../public/object-identity.js";
import { auxiliaryRulesFor, auxiliaryForObject, isPreparationRelatedObject } from "./auxiliary.js";

export function cardText(card) {
  return [card.oracle_text, ...(card.card_faces || []).map((face) => face.oracle_text)]
    .filter(Boolean)
    .join("\n");
}

function physicalObjectText(card) {
  return cardText(card)
    .replace(/\([^)]*prepared[^)]*\)/gi, "")
    .replace(/\([^)]*copy of its spell[^)]*\)/gi, "");
}

function needsCopyMarker(card) {
  const text = physicalObjectText(card);
  return /token (?:that's|that is) a copy|creat(?:e|es|ing) [^.\n]*cop(?:y|ies)/i.test(text)
    || /\b(?:populate|offspring|myriad|encore|squad)\b/i.test(text)
    || (card.keywords || []).some(keyword => /^(?:populate|offspring|myriad|encore|squad)$/.test(keyword.toLowerCase()))
    // A copy of a permanent spell becomes a token; ordinary instant/sorcery
    // copies and the prepare/omen reminders do not require a physical token.
    || /\bcopy\b[^.\n]*\b(?:permanent|artifact|creature|enchantment|planeswalker) spells?\b/i.test(text)
    || /\b(?:permanent|artifact|creature|enchantment|planeswalker) spells?\b[^.\n]*(?:\.[^.\n]*)?\bcopy (?:it|that spell)\b/i.test(text);
}

function expectsNamedToken(card) {
  return physicalObjectText(card).split(/\bcreat(?:e|es|ing)\b/i).slice(1).some(part => {
    const clause = part.split(/[.\n]/)[0];
    return /\btokens?\b/i.test(clause) && !/\bcop(?:y|ies)\b/i.test(clause);
  });
}

export function expectsTokenCreation(card) {
  const text = physicalObjectText(card);
  return /\bcreat(?:e|es|ing)\b[^.\n]*\btokens?\b/i.test(text)
    || (card.keywords || []).some((keyword) => /^(?:amass|investigate|incubate|fabricate|populate|offspring|endure|mobilize|recruit|empower jace|job select|embalm|eternalize|encore|myriad|squad|living weapon|for mirrodin)$/i.test(keyword))
    || /\b(?:amass|investigate|incubate|fabricate|populate|offspring|endure|mobilize|recruit|empower jace|job select|embalm|eternalize|encore|myriad|squad|living weapon|for mirrodin)\b/i.test(text);
}

export function objectKind(cardOrPart) {
  const type = cardOrPart?.type_line || "";
  if (/emblem/i.test(type)) return "Emblem";
  if (/token/i.test(type)) return "Token";
  return "Marker";
}

export function displayCategory(item) {
  const tracking = auxiliaryForObject(item);
  if (tracking) return tracking.category;
  const haystack = `${item.name} ${item.typeLine}`.toLowerCase();
  if (haystack.includes("emblem")) return "紋章";
  if (haystack.includes("copy")) return "コピー";
  if (haystack.includes("treasure")) return "宝物";
  if (haystack.includes("food")) return "食物";
  if (haystack.includes("clue")) return "手掛かり";
  if (haystack.includes("blood")) return "血";
  if (haystack.includes("map")) return "地図";
  if (haystack.includes("incubator")) return "培養器";
  if (haystack.includes("role")) return "役割";
  if (haystack.includes("army")) return "軍団";
  if (haystack.includes("manifest") || haystack.includes("cloak") || haystack.includes("disguise")) return "裏向き";
  if (haystack.includes("start your engines") || haystack.includes("sye")) return "エンジン始動";
  if (haystack.includes("day/night") || haystack.includes("daybound") || haystack.includes("nightbound")) return "夜昼マーカー";
  if (haystack.includes("plotted") || haystack.includes("plot marker")) return "計画マーカー";
  if (haystack.includes("airbend") || haystack.includes("airbent")) return "エアベンド追跡";
  if (haystack.includes("paradigm")) return "パラダイム追跡";
  // impending はカウンター管理のみのためカテゴリ不要
  if (haystack.includes("omen")) return "前兆";
  if (haystack.includes("job select") || haystack.includes("hero token")) return "ジョブセレクト";
  return item.kind === "Emblem" ? "紋章" : "トークン";
}

export function tokenHints(card) {
  const text = physicalObjectText(card);
  const hints = auxiliaryRulesFor(card).map(rule => rule.hint);
  if (needsCopyMarker(card)) hints.push("Copy marker");
  if (expectsTokenCreation(card)) hints.push("トークン生成");
  if (card.layout === "prepare") {
    for (const face of (card.card_faces || []).slice(1)) hints.push(`準備呪文: ${face.name}`);
  }
  const patterns = [
    [/Treasure/gi, "Treasure"],
    [/Food/gi, "Food"],
    [/Clue/gi, "Clue"],
    [/Blood/gi, "Blood"],
    [/\bMap\b/gi, "Map"],
    [/Powerstone/gi, "Powerstone"],
    [/Incubator/gi, "Incubator"],
    [/Role/gi, "Role"],
    [/Amass/gi, "Army"],
    [/Offspring/gi, "Offspring copy"],
    [/emblem/gi, "Emblem"],
    [/token (?:that's|that is) a copy|create[s]? (?:a|an|one|two|three|four|x|that many) [^.]*copy/gi, "Copy marker"],
    [/Start Your Engines/gi, "エンジン始動（SYE）"],
    // Impending の時間カウンターはサイコロで管理するため除外
    [/\bEndure\b/gi, "Endure（Spiritトークン）"],
    [/\bMobilize\b/gi, "Mobilize（Warriorトークン）"],
    [/\bEmpower Jace\b/gi, "ジェイス付与（ジェイス・トークン）"],
    [/Job Select/gi, "Job Select（Heroトークン）"],
    [/\bRecruit\b/gi, "Recruit（人間・兵士トークン）"],
    [/\bAirbend/gi, "エアベンド（除外追跡）"],
    [/\bParadigm\b/gi, "パラダイム（除外追跡）"]
  ];
  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) hints.push(label);
  }

  // Adventure / Omen: detect named spell face
  for (const face of card.card_faces || []) {
    const tl = face.type_line || "";
    if (/adventure/i.test(tl)) hints.push(`出来事: ${face.name}`);
    if (/omen/i.test(tl)) hints.push(`前兆: ${face.name}`);
  }

  const createMatches = text.match(/create[s]? (?:a|an|one|two|three|four|x|that many) [^.]*?(?:token|copy|emblem)[s]?/gi) || [];
  for (const phrase of createMatches.slice(0, 3)) hints.push(phrase.replace(/\s+/g, " "));
  return [...new Set(hints)].slice(0, 8);
}

function makeVirtualObject(sourceCard, kind, name, note, auxiliaryId = "") {
  const typeLine = `${kind} helper`;
  const displayName = japaneseOperationalName({ name, typeLine, kind });
  return {
    id: `${sourceCard.id}-${kind.toLowerCase()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    virtual: true,
    ...(auxiliaryId ? { auxiliaryId } : {}),
    name,
    japaneseName: displayName,
    kind,
    category: displayCategory({ name, typeLine }),
    typeLine,
    set: "HELPERS",
    setName: "汎用マーカー・補助カード",
    releasedAt: "",
    image: sourceCard.image || "",
    imageSource: sourceCard.imageSource || "source-card",
    imageSourceLabel: sourceCard.imageSourceLabel || "発生源カード画像",
    imageSourceUrl: sourceCard.imageSourceUrl || sourceCard.scryfallUri || "",
    imageJa: sourceCard.imageJa || "",
    imageJaSource: sourceCard.imageJaSource || "source-card",
    imageJaSourceLabel: sourceCard.imageJaSourceLabel || "発生源カード画像",
    imageJaSourceUrl: sourceCard.imageJaSourceUrl || sourceCard.scryfallUri || "",
    scryfallUri: sourceCard.scryfallUri,
    note
  };
}

function subtypeNameFromTypeLine(typeLine) {
  const [, subtype = ""] = String(typeLine || "").split(/\s+—\s+/);
  return subtype.replace(/\b(Token|Artifact|Creature|Emblem)\b/gi, "").trim();
}

export function japaneseNameFromTypeLine(item) {
  if (item.kind === "Token" || /\bToken\b/i.test(item.typeLine || "")) {
    const exact = exactTokenJapaneseNameMap.get(item.name);
    if (exact) return exact;
  }
  const direct = tokenJapaneseNameMap.get(item.name);
  if (direct) return direct;

  const subtypeName = subtypeNameFromTypeLine(item.typeLine);
  if (!subtypeName) return "";

  const parts = subtypeName.split(/\s+/).filter(Boolean);
  const translated = parts.map((part) => tokenJapaneseNameMap.get(part) || "");
  if (translated.length && translated.every(Boolean)) return translated.join("・");

  return tokenJapaneseNameMap.get(subtypeName) || "";
}

export function japaneseOperationalName(item) {
  if (/^The Ring(?:\s*\/\/|$)/i.test(String(item.name || ""))) return "指輪（指輪の誘惑）";
  const tracking = auxiliaryForObject(item);
  if (tracking) return tracking.japaneseName;
  const typeLineName = japaneseNameFromTypeLine(item);
  if (typeLineName) return typeLineName;

  const name = String(item.name || "");
  if (/copy/i.test(name)) return "コピー・トークン/コピー用マーカー";
  if (/face-down|manifest|cloak|disguise/i.test(name)) return "裏向き/予示用補助";
  if (/start your engines/i.test(name)) return "エンジン始動補助";
  if (/plotted/i.test(name)) return "計画カード・マーカー";
  if (/airbend|airbent/i.test(name)) return "エアベンド・カード・マーカー";
  if (/paradigm/i.test(name)) return "パラダイム・カード・マーカー";
  if (/day\/night|day.night/i.test(name)) return "昼/夜マーカー";
  if (/emblem/i.test(name) || /emblem/i.test(item.typeLine || "") || item.kind === "Emblem") return "紋章";

  return `${displayCategory(item)}（名称要確認）`;
}

export async function objectsForSource(source, options = {}) {
  const enrichJapaneseAssets = options.enrichJapaneseAssets !== false;
  const produced = [];
  const required = new Map(auxiliaryRulesFor(source.raw).map(rule => [rule.id, rule]));
  const parts = (source.raw.all_parts || []).filter(isPreparationRelatedObject);
  // all_parts is incomplete for many older helpers. Resolve known paper
  // references independently; ordinary combo pieces are never followed.
  for (const part of parts) {
    const rule = auxiliaryForObject(part);
    if (rule) required.set(rule.id, rule);
  }
  if (options.resolveMissingHelpers !== false) {
    for (const rule of required.values()) {
      if (rule.referenceId && !parts.some(part => auxiliaryForObject(part)?.id === rule.id && part.uri)) {
        parts.push({ name: rule.name, type_line: rule.dungeon ? "Dungeon" : "Card", uri: `https://api.scryfall.com/cards/${rule.referenceId}` });
      }
    }
  }
  const visited = new Set();
  for (const part of parts) {
    const partKey = part.uri || part.id;
    if (!partKey || visited.has(partKey)) continue;
    visited.add(partKey);
    const tracking = auxiliaryForObject(part);
    try {
      const original = await fetchRelatedCard(part);
      if (!original) continue;
      // Related lists contain backlinks. Only a dungeon's own token outputs
      // are dependencies, never the other sources linked to a reminder.
      if (tracking?.dungeon) {
        parts.push(...(original.all_parts || []).filter(child => /\bToken\b/.test(child.type_line || "") || child.component === "token"));
        if (expectsTokenCreation(original) && !(original.all_parts || []).some(child => /\bToken\b/.test(child.type_line || "") || child.component === "token")) {
          options.warnings?.push(`${source.name}: ${original.name} の部屋から出るトークン情報が未取得です。`);
        }
      }
      // A generated token may itself have toxic/infect or a tracked state.
      for (const rule of (!tracking && objectKind(original) === "Token" ? auxiliaryRulesFor(original) : [])) {
        if (required.has(rule.id)) continue;
        required.set(rule.id, rule);
        if (rule.referenceId && options.resolveMissingHelpers !== false) parts.push({ name: rule.name, uri: `https://api.scryfall.com/cards/${rule.referenceId}` });
      }
      const preferred = await fetchPreferredTokenPrint(original, { preferredSet: options.preferSourceSet ? source.set : "",
        format: options.format,
        modernOnly: options.preferSourceSet === true && !options.stockOnly, stockOnly: options.stockOnly === true,
        sourceReleasedAt: source.releasedAt || "", today: options.targetDate || new Date().toISOString().slice(0, 10) });
      const related = preferred.card;
      if (!related) {
        const warning = `${source.name}: ${original.name} の紙の現物を確認できないため、デジタル版は表示していません。`;
        if (options.warnings) options.warnings.push(warning);
        continue;
      }
      const imageRef = imageRefFor(related);
      const item = {
        id: related.id,
        ...(tracking ? { auxiliaryId: tracking.id } : {}),
        printId: related.id,
        oracleId: related.oracle_id || "",
        power: related.power ?? "",
        toughness: related.toughness ?? "",
        loyalty: related.loyalty ?? "",
        defense: related.defense ?? "",
        cardFaces: related.card_faces || [],
        colors: related.colors || [],
        oracleText: cardText(related),
        name: related.name,
        japaneseName: "",
        kind: objectKind(related),
        typeLine: related.type_line,
        set: options.stockOnly && preferred.printUnconfirmed ? "NEEDS-PREPARATION" : preferred.printUnconfirmed ? source.set : (preferred.productCode?.toUpperCase() || officialExpansionCode(related.set || source.set)),
        setName: options.stockOnly && preferred.printUnconfirmed ? "別途用意するもの" : preferred.printUnconfirmed ? source.setName : officialExpansionName(preferred.productName || related.set_name || source.setName),
        releasedAt: options.stockOnly && preferred.printUnconfirmed ? "" : preferred.printUnconfirmed ? source.releasedAt : (related.released_at || source.releasedAt || ""),
        printUnconfirmed: Boolean(preferred.printUnconfirmed),
        stockStatus: preferred.stockStatus,
        image: preferred.printUnconfirmed ? "" : imageRef.url,
        imageSource: imageRef.source,
        imageSourceLabel: imageRef.sourceLabel,
        imageSourceUrl: imageRef.sourceUrl,
        scryfallUri: related.scryfall_uri || source.scryfallUri,
        note: [tracking?.note, preferred.note].filter(Boolean).join(" ")
      };
      item.category = displayCategory(item);
      item.japaneseName = japaneseOperationalName(item);
      if (enrichJapaneseAssets) {
        item.japaneseName = await fetchJapaneseRelatedObjectName(source.name, related)
          || item.japaneseName
          || await fetchJapaneseName(item.name);
        const jaCard = preferred.printUnconfirmed ? null : (await fetchPreferredTokenPrint(related, { lang: "ja", stockOnly: options.stockOnly === true, format: options.format })).card;
        const imageJaRef = jaCard ? imageRefFor(jaCard) : null;
        item.imageJa = imageJaRef?.url || "";
        item.imageJaSource = imageJaRef?.source || "none";
        item.imageJaSourceLabel = imageJaRef?.sourceLabel || "日本語画像なし";
        item.imageJaSourceUrl = imageJaRef?.sourceUrl || "";
      } else {
        item.imageJa = "";
        item.imageJaSource = "pending";
        item.imageJaSourceLabel = "補完待ち";
        item.imageJaSourceUrl = "";
      }
      produced.push(item);
    } catch (error) {
      options.warnings?.push(`${source.name}: 関連現物 ${part.name || part.id} を取得できません (${error.message})`);
    }
  }

  const text = physicalObjectText(source.raw);
  if (expectsTokenCreation(source.raw) && !produced.some(item => item.kind === "Token") && (!needsCopyMarker(source.raw) || expectsNamedToken(source.raw))) options.warnings?.push(`${source.name}: 生成するトークンの現物情報が未収録、または未取得です。`);
  if (needsCopyMarker(source.raw) && !produced.some((item) => /copy/i.test(item.name + item.typeLine))) {
    produced.push(makeVirtualObject(source, "Marker", "Copy token / copy marker", "コピー系。汎用コピー・トークンや空白トークンを探す。"));
  }
  if (/emblem/i.test(text) && !produced.some((item) => item.kind === "Emblem")) {
    produced.push(makeVirtualObject(source, "Emblem", `${source.name} Emblem`, "紋章。該当プレインズウォーカーの紋章を探す。"));
  }
  for (const rule of required.values()) {
    if (!produced.some(item => item.auxiliaryId === rule.id)) {
      produced.push(makeVirtualObject(source, "Marker", rule.name, rule.note, rule.id));
    }
  }
  // Impending の時間カウンターはサイコロで管理するためトークン準備不要

  // 関連カード由来の現物は category / japaneseName を上で確定済み。
  // 仮想オブジェクト（makeVirtualObject）は note / category を生成時に確定済みなので、
  // ここでは未取得の日本語名だけ補完する。
  for (const item of produced) {
    const rule = auxiliaryForObject(item);
    if (rule) item.legacyHelperNames = [rule.name, ...(rule.id === "manifest" ? [] : rule.aliases || [])];
    if (!item.japaneseName) {
      item.japaneseName = japaneseNameFromTypeLine(item)
        || (enrichJapaneseAssets ? await fetchJapaneseName(item.name) : "")
        || japaneseOperationalName(item);
    }
  }

  return [...new Map(produced.map(item => [item.auxiliaryId || objectKey(item), item])).values()];
}

export async function buildBulkObjects(matchedCards, options = {}) {
  const byKey = new Map();
  // 実検索は全deckUrlsの和集合で正確に数える。表示用decksの切り詰めと分離。
  // 古い呼び出し元でdeckUrlsがない場合だけoverflow近似を互換用に残す。
  const deckTallies = new Map();

  const batches = [];
  const physicalHelpers = new Map();
  for (const source of matchedCards) {
    const objects = await objectsForSource(source, options);
    batches.push({ source, objects });
    for (const object of objects) if (object.auxiliaryId && !object.virtual) {
      const previous = physicalHelpers.get(object.auxiliaryId);
      if (!previous || (previous.printUnconfirmed && !object.printUnconfirmed)) physicalHelpers.set(object.auxiliaryId, object);
    }
  }
  for (const { source, objects } of batches) {
    for (let object of objects) {
      // A temporary lookup failure on one source must not double-count a
      // helper whose physical card was resolved through another source.
      if (object.virtual && physicalHelpers.has(object.auxiliaryId)) object = physicalHelpers.get(object.auxiliaryId);
      const key = objectKey(object);
      if (!byKey.has(key)) {
        byKey.set(key, { ...object, deckCount: 0, decks: [], sources: [], sourceCards: [] });
        deckTallies.set(key, { urls: new Set(), overflow: 0 });
      }

      const existing = byKey.get(key);
      const tally = deckTallies.get(key);
      const sourceDecks = source.decks || [];
      for (const url of source.deckUrls || sourceDecks.map((deck) => deck.url)) tally.urls.add(url);
      if (!source.deckUrls) tally.overflow += Math.max(0, (source.deckCount || 0) - sourceDecks.length);
      existing.decks.push(...sourceDecks);
      existing.sources.push(...(source.sources || []));
      existing.sourceCards.push({
        name: source.name,
        japaneseName: source.japaneseName || "",
        deckCount: source.deckCount || 0,
        deckUrls: source.deckUrls || sourceDecks.map((deck) => deck.url),
        decks: sourceDecks,
        archetypes: archetypeStats(sourceDecks),
        set: source.set,
        setName: source.setName,
        releasedAt: source.releasedAt,
        oracleText: source.oracleText,
        scryfallUri: source.scryfallUri,
        image: source.image,
        imageSource: source.imageSource || "",
        imageSourceLabel: source.imageSourceLabel || "",
        imageSourceUrl: source.imageSourceUrl || "",
        imageJa: source.imageJa || "",
        imageJaSource: source.imageJaSource || "",
        imageJaSourceLabel: source.imageJaSourceLabel || "",
        imageJaSourceUrl: source.imageJaSourceUrl || "",
        hints: source.tokenHints
      });
      existing.decks = [...new Map(existing.decks.map((deck) => [deck.url, deck])).values()].slice(0, 36);
      existing.deckCount = tally.urls.size + tally.overflow;
      existing.deckUrls = [...tally.urls];
      existing.archetypes = archetypeStats(existing.decks);
      existing.sources = [...new Set(existing.sources)].slice(0, 12);
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const setOrder = a.setName.localeCompare(b.setName);
    if (setOrder) return setOrder;
    const categoryOrder = a.category.localeCompare(b.category, "ja");
    if (categoryOrder) return categoryOrder;
    return a.name.localeCompare(b.name);
  });
}

export function groupObjectsBySet(objects) {
  const groups = [];
  const bySet = new Map();

  for (const object of objects) {
    const key = `${object.set}|${object.setName}`;
    if (!bySet.has(key)) {
      const group = { set: object.set, setName: object.setName, releasedAt: object.releasedAt || "", count: 0, objects: [] };
      bySet.set(key, group);
      groups.push(group);
    }
    const group = bySet.get(key);
    group.objects.push(object);
    group.count += 1;
    if (!group.releasedAt || (object.releasedAt && object.releasedAt < group.releasedAt)) {
      group.releasedAt = object.releasedAt;
    }
  }

  return groups;
}
