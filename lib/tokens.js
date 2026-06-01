import { imageRefFor, officialExpansionCode, officialExpansionName } from "./util.js";
import { archetypeStats } from "./archetype.js";
import { fetchRelatedCard, fetchJapaneseName, fetchJapaneseRelatedObjectName, fetchJapanesePrint } from "./scryfall.js";

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
  return /token (?:that's|that is) a copy|create[s]? (?:a|an|one|two|three|four|x|that many) [^.]*copy|Offspring/i.test(text);
}

export function objectKind(cardOrPart) {
  const type = cardOrPart?.type_line || "";
  if (/emblem/i.test(type)) return "Emblem";
  if (/token/i.test(type)) return "Token";
  return "Marker";
}

export function displayCategory(item) {
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
  // impending はカウンター管理のみのためカテゴリ不要
  if (haystack.includes("omen")) return "前兆";
  if (haystack.includes("job select") || haystack.includes("hero token")) return "ジョブセレクト";
  return item.kind === "Emblem" ? "紋章" : "トークン";
}

export function tokenHints(card) {
  const text = physicalObjectText(card);
  const hints = [];
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
    [/Manifest|Cloak|Disguise/gi, "Face-down marker"],
    [/Start Your Engines/gi, "エンジン始動（SYE）"],
    [/\bPlot\b\s+\{/gi, "計画（Plot）"],
    [/daybound|nightbound/gi, "夜昼変身"],
    // Impending の時間カウンターはサイコロで管理するため除外
    [/\bEndure\b/gi, "Endure（Spiritトークン）"],
    [/\bMobilize\b/gi, "Mobilize（Warriorトークン）"],
    [/\bBehold\b/gi, "Behold（宝物）"],
    [/Job Select/gi, "Job Select（Heroトークン）"]
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

function makeVirtualObject(sourceCard, kind, name, note) {
  const typeLine = `${kind} helper`;
  return {
    id: `${sourceCard.id}-${kind.toLowerCase()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    japaneseName: "",
    kind,
    category: displayCategory({ name, typeLine }),
    typeLine,
    set: sourceCard.set,
    setName: sourceCard.setName,
    releasedAt: sourceCard.releasedAt || "",
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

export async function objectsForSource(source) {
  const produced = [];
  const parts = source.raw.all_parts || [];

  for (const part of parts) {
    const typeLine = part.type_line || "";
    if (!/token|emblem/i.test(typeLine) && !/token|emblem/i.test(part.component || "")) continue;
    try {
      const related = await fetchRelatedCard(part);
      if (!related) continue;
      const imageRef = imageRefFor(related);
      const item = {
        id: related.id,
        name: related.name,
        japaneseName: "",
        kind: objectKind(related),
        typeLine: related.type_line,
        set: officialExpansionCode(related.set || source.set),
        setName: officialExpansionName(related.set_name || source.setName),
        releasedAt: related.released_at || source.releasedAt || "",
        image: imageRef.url,
        imageSource: imageRef.source,
        imageSourceLabel: imageRef.sourceLabel,
        imageSourceUrl: imageRef.sourceUrl,
        scryfallUri: related.scryfall_uri || source.scryfallUri,
        note: ""
      };
      item.category = displayCategory(item);
      item.japaneseName = await fetchJapaneseRelatedObjectName(source.name, related) || await fetchJapaneseName(item.name);
      const jaCard = await fetchJapanesePrint(item.name, { objectKind: item.kind });
      const imageJaRef = jaCard ? imageRefFor(jaCard) : null;
      item.imageJa = imageJaRef?.url || "";
      item.imageJaSource = imageJaRef?.source || "none";
      item.imageJaSourceLabel = imageJaRef?.sourceLabel || "日本語画像なし";
      item.imageJaSourceUrl = imageJaRef?.sourceUrl || "";
      produced.push(item);
    } catch {
      // Keep going if Scryfall omits a related object.
    }
  }

  const text = physicalObjectText(source.raw);
  if (needsCopyMarker(source.raw) && !produced.some((item) => /copy/i.test(item.name + item.typeLine))) {
    produced.push(makeVirtualObject(source, "Marker", "Copy token / copy marker", "コピー系。汎用コピー・トークンや空白トークンを探す。"));
  }
  if (/emblem/i.test(text) && !produced.some((item) => item.kind === "Emblem")) {
    produced.push(makeVirtualObject(source, "Emblem", `${source.name} Emblem`, "紋章。該当プレインズウォーカーの紋章を探す。"));
  }
  if (/Manifest|Cloak|Disguise/i.test(text)) {
    produced.push(makeVirtualObject(source, "Marker", "Face-down / Manifest helper", "予示・偽装・変装など。必要なら裏向き用の補助カードを用意。"));
  }
  if (/Start Your Engines/i.test(text) && !produced.length) {
    produced.push(makeVirtualObject(source, "Marker", "Start Your Engines helper", "エンジン始動カード。デッキ内の関連トークンやマーカーを確認する。"));
  }
  if (/\bPlot\b\s+\{/i.test(text) && !produced.some((item) => /plotted/i.test(item.name))) {
    produced.push(makeVirtualObject(source, "Marker", "Plotted card marker", "計画カード。除外ゾーンに表向きで置かれ後で無料キャスト。放送中は除外ゾーンの追跡が必要。"));
  }
  if (/daybound|nightbound/i.test(text) && !produced.some((item) => /day.night/i.test(item.name))) {
    produced.push(makeVirtualObject(source, "Marker", "Day/Night marker", "昼夜マーカー。現在が昼か夜かを追跡するマーカーが必要。"));
  }
  // Impending の時間カウンターはサイコロで管理するためトークン準備不要

  // 関連カード由来の現物は category / japaneseName を上で確定済み。
  // 仮想オブジェクト（makeVirtualObject）は note / category を生成時に確定済みなので、
  // ここでは未取得の日本語名だけ補完する。
  for (const item of produced) {
    if (!item.japaneseName) item.japaneseName = await fetchJapaneseName(item.name);
  }

  return produced;
}

export async function buildBulkObjects(matchedCards) {
  const byKey = new Map();

  for (const source of matchedCards) {
    const objects = await objectsForSource(source);
    for (const object of objects) {
      const key = `${object.set}|${object.name}|${object.typeLine}`;
      if (!byKey.has(key)) {
        byKey.set(key, { ...object, deckCount: 0, decks: [], sources: [], sourceCards: [] });
      }

      const existing = byKey.get(key);
      existing.deckCount += source.deckCount || 0;
      existing.decks.push(...(source.decks || []));
      existing.sources.push(...source.sources);
      existing.sourceCards.push({
        name: source.name,
        japaneseName: source.japaneseName || "",
        deckCount: source.deckCount || 0,
        decks: source.decks || [],
        archetypes: archetypeStats(source.decks || []),
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
      existing.deckCount = existing.decks.length || existing.deckCount;
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
