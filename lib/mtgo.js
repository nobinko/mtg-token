export function expandMtgoSources(sources, startDate, endDate, today = new Date().toISOString().slice(0, 10)) {
  const end = [endDate || today, today].sort()[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") || startDate > end) return sources;
  const months = [];
  const cursor = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
  const firstMonth = startDate.slice(0, 7);
  while (cursor.toISOString().slice(0, 7) >= firstMonth && months.length < 120) {
    months.push(cursor.toISOString().slice(0, 7) === today.slice(0, 7) ? "https://www.mtgo.com/decklists"
      : `https://www.mtgo.com/decklists/${cursor.getUTCFullYear()}/${cursor.getUTCMonth() + 1}`);
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return sources.flatMap((url) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "") === "mtgo.com" && /^\/decklists\/?$/.test(parsed.pathname) ? months : [url];
    } catch { return [url]; }
  });
}
