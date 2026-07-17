import { formatEnvironmentEvents } from "./data.js";
import { fetchSetReleaseEvents } from "./set-events.js";

export function isDateInEnvironment(date, environmentStartDate, targetDate) {
  if (!date) return !environmentStartDate;
  const target = new Date(`${targetDate}T00:00:00Z`);
  const start = new Date(`${environmentStartDate}T00:00:00Z`);
  const current = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(target.getTime()) || Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) return false;
  return current >= start && current <= target;
}

// 手書きイベント（禁止改定・ローテーション）と Scryfall 由来の自動セットイベントを統合する。
// 同じ日付・同種の手書きイベントがある場合はそちらを正とし、自動側は重複表示しない。
export function mergeEnvironmentEvents(manualEvents, autoEvents) {
  const manual = Array.isArray(manualEvents) ? manualEvents : [];
  const manualKeys = new Set(manual.map((event) => `${event.date}|${event.type}`));
  const merged = [...manual];
  for (const event of autoEvents || []) {
    if (!manualKeys.has(`${event.date}|${event.type}`)) merged.push(event);
  }
  return merged;
}

function eventsForFormat(events, format, targetDate) {
  return (events || [])
    .filter((event) => event.date <= targetDate)
    .filter((event) => {
      const affected = event.formatsAffected || [];
      const unchanged = event.formatsUnchanged || [];
      return affected.includes(format) || unchanged.includes(format);
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function affectsFormat(event, format) {
  return (event.formatsAffected || []).includes(format);
}

function eventReason(event, format) {
  return event.changes?.[format] || event.title || "";
}

// イベント一覧から環境開始日を解決する純粋関数。テストはこちらを対象にする。
export function resolveEnvironmentFromEvents(events, format, targetDate) {
  const applicable = eventsForFormat(events, format, targetDate);
  const resetEvent = [...applicable].reverse().find((event) => affectsFormat(event, format));
  const contextEvents = applicable
    .filter((event) => !affectsFormat(event, format) && event.date >= (resetEvent?.date || "0000-00-00"))
    .slice(-3);

  if (!resetEvent) {
    return {
      format,
      targetDate,
      startDate: "",
      resolved: false,
      reason: "環境開始日を公式イベント表から確定できませんでした。検索は実行しません。",
      resetEvent: null,
      contextEvents
    };
  }

  return {
    format,
    targetDate,
    startDate: resetEvent.date,
    resolved: true,
    reason: `${resetEvent.date} の ${resetEvent.title} により現在の${format.toUpperCase()}環境が始まったものとして扱います。${eventReason(resetEvent, format)}`,
    resetEvent: {
      ...resetEvent,
      affectsFormat: true,
      reason: eventReason(resetEvent, format)
    },
    contextEvents: contextEvents.map((event) => ({
      ...event,
      affectsFormat: false,
      reason: eventReason(event, format)
    }))
  };
}

export async function formatEnvironmentInfo(format, targetDate) {
  const manual = Array.isArray(formatEnvironmentEvents?.events) ? formatEnvironmentEvents.events : [];
  const events = mergeEnvironmentEvents(manual, await fetchSetReleaseEvents());
  return resolveEnvironmentFromEvents(events, format, targetDate);
}
