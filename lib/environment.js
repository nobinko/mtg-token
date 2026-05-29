import { formatEnvironmentEvents } from "./data.js";

export function isDateInEnvironment(date, environmentStartDate, targetDate) {
  if (!date) return true;
  const target = new Date(`${targetDate}T00:00:00Z`);
  const start = new Date(`${environmentStartDate}T00:00:00Z`);
  const current = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(target.getTime()) || Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) return true;
  return current >= start && current <= target;
}

export function formatEnvironmentInfo(format, targetDate) {
  const events = formatEnvironmentEvents[format] || [];
  const applicable = events
    .filter((event) => event.date <= targetDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const resetEvent = [...applicable].reverse().find((event) => event.affectsFormat);
  const contextEvents = applicable
    .filter((event) => !event.affectsFormat && event.date >= (resetEvent?.date || "0000-00-00"))
    .slice(-3);

  if (!resetEvent) {
    return {
      format,
      targetDate,
      startDate: "",
      reason: "環境開始日を自動判定できませんでした。日付の取れるデッキは大会日以前として扱います。",
      resetEvent: null,
      contextEvents
    };
  }

  return {
    format,
    targetDate,
    startDate: resetEvent.date,
    reason: `${resetEvent.date} の ${resetEvent.title} により現在の${format.toUpperCase()}環境が始まったものとして扱います。`,
    resetEvent,
    contextEvents
  };
}
