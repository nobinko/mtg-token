import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

export const updateUrl = "https://raw.githubusercontent.com/nobinko/mtg-token/main/data/environment-events.json";
const formats = ["standard", "pioneer", "modern", "legacy"];
const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function validateEnvironmentPack(pack) {
  if (pack?.schemaVersion === undefined) throw new Error("配信元が旧形式のため更新できません。作成者による対応データの公開が必要です（手元の検索は利用できます）。");
  if (pack?.schemaVersion !== 1 || pack.minimumReaderVersion !== 1) throw new Error("環境データの形式に対応していません。本体の更新が必要です。");
  if (!Array.isArray(pack.events) || !pack.events.length || pack.events.length > 10000) throw new Error("環境イベント表が不正です。");
  for (const event of pack.events) {
    if (!validDate(event.date) || !["rotation", "banned-restricted", "set-release"].includes(event.type)
      || typeof event.title !== "string" || !event.title || !Array.isArray(event.formatsAffected)
      || !event.formatsAffected.every((format) => formats.includes(format))
      || !(event.formatsUnchanged || []).every((format) => formats.includes(format))
      || typeof event.sourceUrl !== "string" || !event.sourceUrl.startsWith("https://")) throw new Error("環境イベントの内容が不正です。");
    if (event.effectiveDate !== undefined && !validDate(event.effectiveDate)) throw new Error("適用日が不正です。");
    if (event.announcedAt !== undefined && !validDate(event.announcedAt)) throw new Error("発表日が不正です。");
    if (event.autoDetected && event.confirmed === true && !validDate(event.effectiveDate)) throw new Error("自動検知イベントの確認には適用日が必要です。");
  }
  return pack;
}

export function confirmedEvents(pack) {
  return pack.events.filter((event) => !event.autoDetected || event.confirmed === true)
    .map((event) => ({ ...event, date: event.effectiveDate || event.date }));
}

export function createUpdateStore({ path = resolve(".cache", "environment", "active.json"), bundledPath = resolve("data", "environment-events.json"), fetcher = fetch } = {}) {
  let active;
  let error = "";
  let busy = false;
  async function read() {
    if (active) return active;
    try {
      const saved = JSON.parse(await readFile(path, "utf8"));
      validateEnvironmentPack(saved.pack);
      if (!Array.isArray(saved.setEvents) || !Array.isArray(saved.candidates) || !formats.includes(saved.format) || !Number.isFinite(Date.parse(saved.checkedAt))) throw new Error("保存データ不正");
      active = saved;
    } catch {
      active = { pack: validateEnvironmentPack(JSON.parse(await readFile(bundledPath, "utf8"))), checkedAt: null, revision: "同梱版" };
    }
    return active;
  }
  async function status() {
    const current = await read();
    const nextAnnouncement = current.pack.events.map((event) => event.nextAnnouncementDate || "").sort().at(-1);
    return { checkedAt: current.checkedAt, revision: current.revision, format: current.format || null, busy, error,
      verifiedThrough: current.pack.verifiedThrough || null,
      announcementOverdue: Boolean(nextAnnouncement && nextAnnouncement < new Date().toISOString().slice(0, 10) && !confirmedEvents(current.pack).some((event) => event.type === "banned-restricted" && event.date >= nextAnnouncement)),
      pending: current.pack.events.filter((event) => event.autoDetected && event.confirmed !== true).map((event) => ({ title: event.title, formats: event.formatsAffected })),
      lastEvent: confirmedEvents(current.pack).filter((event) => event.date <= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.date || null };
  }
  async function update(format, { fetchSets, fetchCandidates }) {
    if (busy) throw new Error("環境データを更新中です。");
    if (!formats.includes(format)) throw new Error("フォーマットが不正です。");
    busy = true;
    try {
      await read();
      const response = await fetcher(updateUrl, { signal: AbortSignal.timeout(25000), headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
      if (!response.ok) throw new Error(`環境データを取得できません (${response.status})。配信版が公開済みか確認してください。`);
      const raw = await response.text();
      if (raw.length > 2_000_000) throw new Error("環境データが大きすぎます。");
      const pack = validateEnvironmentPack(JSON.parse(raw));
      const setEvents = await fetchSets();
      const candidates = await fetchCandidates(format);
      if (!Array.isArray(setEvents) || !setEvents.length || !Array.isArray(candidates) || !candidates.length) throw new Error("取得データが空です。");
      const next = { pack, setEvents, candidates, format, checkedAt: new Date().toISOString(), revision: createHash("sha256").update(raw).digest("hex").slice(0, 12) };
      await mkdir(dirname(path), { recursive: true });
      await writeFile(`${path}.tmp`, JSON.stringify(next), "utf8");
      await rename(`${path}.tmp`, path);
      active = next;
      error = "";
      return await status();
    } catch (cause) {
      error = cause.message;
      throw cause;
    } finally { busy = false; }
  }
  return { read, status, update, get busy() { return busy; } };
}

export const environmentUpdates = createUpdateStore();
