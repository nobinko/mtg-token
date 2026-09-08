import { dateOnly } from "./preparation.js";

const types = {
  expansion: "通常拡張セット", core: "基本セット", masters: "再録中心のセット",
  draft_innovation: "特殊ドラフト製品", commander: "統率者向け製品"
};

// These are preparation choices, not assertions that every card in a product
// is legal. Card-level eligibility is still checked by preparationSources.
export function preparationSetChoices(sets, events, format, targetDate) {
  if (!["standard", "pioneer", "modern", "legacy"].includes(format) || !dateOnly(targetDate)) throw new Error("フォーマットと大会日を確認してください。");
  const official = new Map(events.filter((event) => event.type === "set-release" && event.setCode
    && (!event.autoDetected || event.confirmed === true) && event.formatsAffected?.includes(format))
    .map((event) => [event.setCode.toLowerCase(), event]));
  const catalog = new Map(sets.map((set) => [set.code, set]));
  for (const [code, event] of official) {
    if (!catalog.has(code)) catalog.set(code, { code, name: event.setName || event.title.replace(/ tabletop.*$/i, ""), set_type: "expansion" });
  }
  const choices = [];
  const targetTime = Date.parse(`${targetDate}T00:00:00Z`);
  for (const set of catalog.values()) {
    if (set.digital || !types[set.set_type] || !/^[a-z0-9]{2,8}$/.test(set.code || "")) continue;
    const event = official.get(set.code);
    const normal = ["expansion", "core"].includes(set.set_type);
    if (!normal && !event && (format === "standard" || format === "pioneer" || (format === "modern" && set.set_type === "commander"))) continue;
    const startsAt = event?.effectiveDate || event?.date || set.released_at;
    if (!dateOnly(startsAt)) continue;
    const daysBefore = Math.round((targetTime - Date.parse(`${startsAt}T00:00:00Z`)) / 86400000);
    if (daysBefore > 180 || daysBefore < -90) continue;
    const eligible = daysBefore >= 0;
    const confirmed = Boolean(event);
    choices.push({ code: set.code, name: event?.setName || set.name, type: set.set_type, typeLabel: types[set.set_type],
      releasedAt: set.released_at || "", startsAt, confirmed, eligible, daysBefore,
      sourceUrl: event?.sourceUrl || set.scryfall_uri || "",
      description: `${types[set.set_type]}。${eligible ? `大会の${daysBefore}日前${confirmed ? "に構築適用" : "が適用日の仮置き"}です。` : "大会日より後の予定なので、この大会の対象には選べません。"}`
        + (confirmed ? "環境履歴に登録された適用日を使用します。" : "構築適用日は未確認のため、発売日を仮置きしています。公式案内を確認してください。")
        + (!normal ? "全カードがこのフォーマットで使用可能になる製品ではありません。カードごとの使用可否で絞り込みます。" : "") });
  }
  choices.sort((a, b) => Number(b.eligible) - Number(a.eligible) || (a.eligible ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)) || a.name.localeCompare(b.name));
  const recommendation = choices.find((choice) => choice.eligible && (["expansion", "core"].includes(choice.type) || official.has(choice.code)));
  return { choices, recommendedCode: recommendation?.code || "" };
}
