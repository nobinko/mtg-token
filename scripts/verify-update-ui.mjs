// Local-only UI verification. No external requests and no changes to user caches.
import { mkdtemp, cp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const verifyTokens = process.argv.includes("--tokens");
const token = { id: "09faad62-42ff-4e37-b8a5-d8e8a0f6d096", oracle_id: "4465eff4-5851-4721-a248-866c686c2ab8", name: "Goblin", type_line: "Token Creature — Goblin", oracle_text: "", power: "1", toughness: "1", colors: ["R"], lang: "en", games: ["paper"], set: "sld", set_name: "Secret Lair Drop", released_at: "2026-05-18" };
const regularToken = { ...token, id: "e265ca24-96c0-4654-a8f3-bbffe288970a", set: "ttdm", set_name: "Tarkir: Dragonstorm Tokens", released_at: "2025-04-11", scryfall_uri: "https://scryfall.com/card/ttdm/12/goblin", image_uris: { normal: "https://cards.scryfall.io/normal/front/e/2/e265ca24-96c0-4654-a8f3-bbffe288970a.jpg?1783906784" } };
const tokenCandidates = [
  { id: "fixture", name: "Goblin generator (UI検証用)", oracle_text: "Create two 1/1 red Goblin creature tokens.", all_parts: [{ component: "token", name: "Goblin", type_line: token.type_line, uri: `https://api.scryfall.com/cards/${token.id}` }] },
  ...[
    ["Rest in Peace", "If a card or token would be put into a graveyard from anywhere, exile it instead."],
    ["Sheoldred's Edict", "Each opponent sacrifices a creature token of their choice."],
    ["Necrodominance", "If a card or token would be put into your graveyard from anywhere, exile it instead."],
    ["Belladonna Took", "Whenever a token you control enters, you gain 1 life."]
  ].map(([name, oracle_text]) => ({ id: name, name, oracle_text }))
].map((card) => ({ ...card, set: "fra", set_name: "UI検証用", type_line: "Sorcery", legalities: { standard: "legal", pioneer: "legal", modern: "legal", legacy: "legal" } }));
const temporary = await mkdtemp(join(tmpdir(), "mtg-update-ui-"));
await cp(join(root, "public"), join(temporary, "public"), { recursive: true });
await cp(join(root, "data"), join(temporary, "data"), { recursive: true });
const pack = JSON.parse(await readFile(join(root, "data", "environment-events.json"), "utf8"));
pack.events.push({ date: "2026-09-01", effectiveDate: "2026-09-02", type: "banned-restricted", title: "UI検証用イベント（実際の改定ではありません）", sourceUrl: "https://example.com/test-only", formatsAffected: ["modern"] });
globalThis.fetch = async (url) => {
  if (String(url).startsWith("https://raw.githubusercontent.com/")) return Response.json(pack);
  if (String(url) === "https://api.scryfall.com/sets") return Response.json({ data: [{ code: "fixture", name: "UI fixture", set_type: "expansion", digital: false, released_at: "2026-06-01" }, { code: "ttdm", set_type: "token", parent_set_code: "tdm" }, { code: "tdm", set_type: "expansion" }, { code: "sld", set_type: "box" }] });
  if (String(url) === "https://api.scryfall.com/sets/fra") return Response.json({ name: "Reality Fracture (UI検証用)", code: "fra", set_type: "expansion", digital: false });
  if (verifyTokens) {
    if (String(url) === `https://api.scryfall.com/cards/${token.id}`) return Response.json(token);
    if (String(url) === `https://api.scryfall.com/cards/${regularToken.id}`) return Response.json(regularToken);
    if (String(url).startsWith("https://api.scryfall.com/cards/search")) {
      const q = new URL(url).searchParams.get("q") || "";
      if (q.includes("lang:ja")) return new Response("No Japanese fixture print", { status: 404 });
      return Response.json({ data: q.includes("oracleid:") ? [token, regularToken] : tokenCandidates });
    }
  }
  if (String(url).startsWith("https://api.scryfall.com/cards/search")) return Response.json({ data: [{ id: "fixture", name: "UI fixture candidate", set: "fra", set_name: "UI fixture", type_line: "Sorcery", oracle_text: "Create a token that's a copy of target creature.", legalities: { standard: "legal", pioneer: "legal", modern: "legal", legacy: "legal" }, scryfall_uri: "https://example.com/test-only" }], has_more: false });
  throw new Error("UI検証では外部ネットワークを使用しません。");
};
process.chdir(temporary);
process.env.PORT = "5188";
process.on("SIGINT", async () => { await rm(temporary, { recursive: true, force: true }); process.exit(0); });
console.log(`UI fixture only: http://localhost:5188 ; isolated data: ${temporary}`);
await import("../server.mjs");
