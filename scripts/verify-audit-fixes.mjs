// Deterministic API/browser fixture. Uses only an isolated temporary directory.
import { mkdtemp, cp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), "mtg-audit-fixes-"));
const cacheMode = process.argv.find((arg) => arg.startsWith("--cache="))?.split("=")[1] || "fresh";
const image = (label, color = "#dae7df") => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="335"><rect width="240" height="335" rx="14" fill="${color}"/><text x="16" y="45" font-family="sans-serif" font-size="17">${label}</text><text x="16" y="295" font-family="sans-serif" font-size="14">LOCAL TEST FIXTURE</text></svg>`)}`;
const sets = [{ code: "tcmm", set_type: "token", parent_set_code: "cmm" }, { code: "cmm", name: "Commander Masters", set_type: "masters" }, { code: "fra", name: "Fixture Set", set_type: "expansion", released_at: "2026-10-02" },
  { code: "teld", set_type: "token", parent_set_code: "eld" }, { code: "eld", name: "Throne of Eldraine", set_type: "expansion", released_at: "2019-10-04" },
  { code: "tm21", set_type: "token", parent_set_code: "m21" }, { code: "m21", name: "Core Set 2021", set_type: "core", released_at: "2020-07-03" },
  { code: "ttdm", set_type: "token", parent_set_code: "tdm" }, { code: "tdm", name: "Tarkir: Dragonstorm", set_type: "expansion", released_at: "2025-04-11" }];
const pack = { schemaVersion: 1, minimumReaderVersion: 1, verifiedThrough: "2026-09-26", events: [{ date: "2026-09-01", type: "banned-restricted", title: "ローカル検証用の環境境界", sourceUrl: "https://example.test/fixture", formatsAffected: ["standard", "pioneer", "modern", "legacy"] }] };
const tokens = [
  { id: "colorless-spirit", oracle_id: "colorless-spirit", name: "Spirit", colors: [], power: "2", toughness: "2", oracle_text: "" },
  { id: "white-spirit", oracle_id: "white-spirit", name: "Spirit", colors: ["W"], power: "1", toughness: "1", oracle_text: "Flying" },
  { id: "white-black-spirit", oracle_id: "white-black-spirit", name: "Spirit", colors: ["W", "B"], power: "1", toughness: "1", oracle_text: "Flying" },
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", oracle_id: "cat", name: "Cat", colors: ["W"], power: "1", toughness: "1", oracle_text: "" }
].map((card) => ({ ...card, type_line: `Token Creature — ${card.name}`, set: "tcmm", set_name: "Commander Masters Tokens", lang: "en", games: ["paper"], released_at: "2023-08-04", image_uris: { normal: image(`${card.name} ${card.power}/${card.toughness} ${card.colors.join("") || "C"}`) }, scryfall_uri: "https://example.test/token" }));
const ordinaryPrints = [
  { ...tokens[0], id: "colorless-m21", set: "tm21", set_name: "Core Set 2021 Tokens", released_at: "2020-07-03" },
  { ...tokens[1], id: "white-eld", set: "teld", set_name: "Throne of Eldraine Tokens", released_at: "2019-10-04" },
  { ...tokens[3], id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", set: "ttdm", set_name: "Tarkir: Dragonstorm Tokens", released_at: "2025-04-11" },
  { ...tokens[3], id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", set: "teld", set_name: "Throne of Eldraine Tokens", released_at: "2019-10-04" }
];
const candidates = tokens.map((token, index) => ({
  id: `source-${index}`, name: index === 3 ? "Ocelot Pride" : `Spirit Source ${index + 1}`, type_line: "Creature", set: "cmm", set_name: "Commander Masters",
  oracle_text: index === 3 ? "Create a Cat token. Create a token that's a copy of target creature." : `Create a ${token.power}/${token.toughness} Spirit creature token.`,
  image_uris: { normal: image(index === 3 ? "Ocelot Pride" : `Spirit Source ${index + 1}`, "#e8e0ca") },
  all_parts: [{ ...token, component: "token", uri: `https://api.scryfall.com/cards/${token.id}` }], games: ["paper"], legalities: { modern: "legal" }
}));
candidates.push({ id: "sidebar", name: "Sidebar Only", type_line: "Sorcery", oracle_text: "Create a token that's a copy of target creature." });
const dfcs = [["Boggart Trawler", "Boggart Bog", "Creature", "Land"], ["Sink into Stupor", "Soporific Springs", "Instant", "Land"], ["Tamiyo, Inquisitive Student", "Tamiyo, Seasoned Scholar", "Creature", "Planeswalker"]]
  .map(([front, back, frontType, backType]) => ({ name: `${front} // ${back}`, type_line: `${frontType} // ${backType}`, card_faces: [{ name: front, type_line: frontType, image_uris: { normal: image(front) } }, { name: back, type_line: backType, image_uris: { normal: image(back, "#c4c6ee") } }] }));
const rows = [...candidates.slice(0, 4).map((card) => [4, card.name]), ...dfcs.map((card) => [4, card.card_faces[0].name]), [32, "Island"]];
const deckHtml = `<title>Audit fixture deck</title><div>64 players - 20/09/26</div>${rows.map(([count, name], index) => `<div class="deck_line" id="md${index}">${count} <span class="L14">${name}</span></div>`).join("")}<div class="deck_line" id="sb0">3 <span class="L14">Dispel</span></div><aside>Other deck feature: Sidebar Only</aside>`;

await cp(join(root, "public"), join(temporary, "public"), { recursive: true });
await mkdir(join(temporary, "data"), { recursive: true });
await mkdir(join(temporary, ".cache", "environment"), { recursive: true });
await mkdir(join(temporary, ".cache", "scryfall"), { recursive: true });
await writeFile(join(temporary, "data", "environment-events.json"), JSON.stringify(pack));
await writeFile(join(temporary, ".cache", "environment", "active.json"), JSON.stringify({ pack, setEvents: [], candidates, format: "modern", checkedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), revision: "local-fixture" }));
if (cacheMode !== "missing") await writeFile(join(temporary, ".cache", "scryfall", "candidates-modern.json"), JSON.stringify({ queryVersion: 3, expiresAt: Date.now() + (cacheMode === "stale" ? -1000 : 86400000), cards: candidates }));

let candidateRequests = 0;
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  if (parsed.hostname === "raw.githubusercontent.com") return Response.json(pack);
  if (parsed.hostname === "mtgtop8.com") {
    if (parsed.pathname === "/format") return new Response('<div class=S14>1 decks</div><div class=S14><a href="/archetype?a=90000&meta=54&f=MO">Audit fixture</a></div><div class=S14>100 %</div><a href="/event?e=90000&d=90001&f=MO">Fixture deck</a>');
    if (parsed.pathname === "/archetype") return new Response('<table><tr><td><a href="/event?e=90000&d=90001&f=MO">Audit fixture deck</a></td><td>20/09/26</td></tr></table>');
    return new Response(deckHtml);
  }
  if (parsed.pathname === "/sets") return Response.json({ data: sets });
  if (parsed.pathname === "/sets/fra") return Response.json(sets[2]);
  if (parsed.pathname === "/cards/collection") {
    const names = JSON.parse(options.body).identifiers.map((item) => item.name);
    return Response.json({ data: names.filter(name => name !== "Unresolved Card").map((name) => candidates.find(card => card.name === name) || dfcs.find((card) => card.name === name || card.card_faces.some((face) => face.name === name)) || { name, type_line: name === "Island" ? "Basic Land — Island" : "Creature", image_uris: { normal: image(name) } }), not_found: names.filter(name => name === "Unresolved Card").map(name => ({ name })) });
  }
  if (parsed.pathname === "/cards/search") {
    const q = parsed.searchParams.get("q") || "";
    if (q.includes("legal:")) { candidateRequests += 1; throw new Error("Fixture candidate service offline"); }
    if (q.includes("set:fra")) return Response.json({ data: [candidates[3]] });
    if (q.includes("lang:ja")) {
      if (q.includes('!"Ocelot Pride"')) return Response.json({ data: [{ ...candidates[3], lang: "ja", printed_name: "オセロットの群れ", image_uris: { normal: image("オセロットの群れ") }, printed_text: "白の1/1の猫・クリーチャー・トークン１体を生成する。" }] });
      const double = dfcs.find((card) => q.includes(`!"${card.name}"`));
      if (double) return Response.json({ data: [{ ...double, lang: "ja", card_faces: double.card_faces.map((face, index) => ({ ...face, printed_name: index ? "日本語の裏面" : "日本語の表面", image_uris: { normal: image(index ? "日本語の裏面" : "日本語の表面") } })) }] });
      const basic = [["Island", "島"], ["Dispel", "払拭"]].find(([name]) => q.includes(`!"${name}"`));
      if (basic) return Response.json({ data: [{ name: basic[0], lang: "ja", printed_name: basic[1], image_uris: { normal: image(basic[1]) } }] });
      return Response.json({ data: [] });
    }
    return Response.json({ data: [...tokens, ...ordinaryPrints].filter((card) => q.includes(`oracleid:${card.oracle_id} `)) });
  }
  const token = [...tokens, ...ordinaryPrints].find((card) => parsed.pathname === `/cards/${card.id}`);
  if (token) return Response.json(token);
  throw new Error(`Unmocked fixture request: ${url}`);
};
process.chdir(temporary);
process.env.PORT ||= "0";
const { server } = await import("../server.mjs");
if (!server.listening) await once(server, "listening");
const port = server.address().port;
const ready = { port, temporary, cacheMode };
process.send?.({ type: "ready", ...ready });
console.log(`Audit fixture: http://127.0.0.1:${port} (${cacheMode} cache); isolated data: ${temporary}`);

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  process.chdir(root);
  await rm(temporary, { recursive: true, force: true });
  process.exit(0);
}
process.on("message", (message) => {
  if (message === "stats") process.send?.({ type: "stats", candidateRequests });
  if (message === "close") void close();
});
process.on("SIGINT", () => { void close(); });
process.on("SIGTERM", () => { void close(); });
process.on("disconnect", () => { void close(); });
