import assert from "node:assert/strict";
import test from "node:test";
import { fork } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { objectKey } from "../public/object-identity.js";

function messageOf(child, type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Fixture timeout: ${type}`)), 15000);
    const onMessage = (message) => { if (message.type === type) finish(null, message); };
    const onExit = () => finish(new Error("Fixture exited before responding"));
    function finish(error, value) {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("exit", onExit);
      if (error) reject(error); else resolve(value);
    }
    child.on("message", onMessage);
    child.on("exit", onExit);
  });
}

for (const cacheMode of ["fresh", "stale", "missing"]) {
  test(`HTTP search after an expired environment update retains ${cacheMode} cache fallback`, async (t) => {
    const child = fork(fileURLToPath(new URL("../scripts/verify-audit-fixes.mjs", import.meta.url)), [`--cache=${cacheMode}`], { env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    let logs = "";
    child.stdout.on("data", (chunk) => { logs += chunk; });
    child.stderr.on("data", (chunk) => { logs += chunk; });
    t.after(async () => {
      if (child.exitCode !== null) return;
      const exited = once(child, "exit");
      child.send("close");
      await exited;
    });
    const ready = await messageOf(child, "ready");
    const post = async (path, body) => {
      const response = await fetch(`http://127.0.0.1:${ready.port}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      return { status: response.status, body: await response.json() };
    };
    const input = { format: "modern", targetDate: "2026-09-26", maxChildPages: 20, sources: ["https://mtgtop8.com/event?e=90000&d=90001&f=MO"] };
    const result = await post("/api/token-cards", input);
    assert.equal(result.status, 200, logs);
    assert.equal(result.body.searchedDeckCount, 1, logs);
    assert.equal(result.body.objects.filter((object) => object.name === "Spirit").length, 3);
    assert.equal(result.body.cards.some((card) => card.name === "Sidebar Only"), false);
    const stats = messageOf(child, "stats");
    child.send("stats");
    assert.equal((await stats).candidateRequests, cacheMode === "fresh" ? 0 : 1);
    if (cacheMode === "missing") assert.match(result.body.candidateWarnings.join(""), /保存した候補/);

    if (cacheMode !== "fresh") return;
    const marker = result.body.objects.find((object) => object.kind === "Marker");
    const enriched = await post("/api/enrich-card-assets", { objects: [{ ...marker, key: objectKey(marker), sourceNames: ["Ocelot Pride"] }] });
    assert.equal(enriched.status, 200);
    assert.equal(enriched.body.objects[0].key, objectKey(marker));
    assert.equal(enriched.body.objects[0].japaneseName, "コピー・トークン/コピー用マーカー");
    const metadata = await post("/api/card-metadata", { names: ["Boggart Trawler", "Sink into Stupor", "Tamiyo, Inquisitive Student"] });
    assert.ok(metadata.body.cards.every((card) => card.faces?.length === 2 && card.requestedName));
    const japanese = await post("/api/card-metadata", { names: ["Island", "Boggart Trawler", "Spirit Source 1"], language: "ja" });
    assert.equal(japanese.body.cards[0].printedName, "島");
    assert.equal(japanese.body.cards[0].language, "ja");
    assert.equal(japanese.body.cards[1].faces[1].printedName, "日本語の裏面");
    assert.equal(japanese.body.cards[2].japaneseImageUnavailable, true);
    for (const language of ["en", "invalid", "", null]) {
      const fallback = await post("/api/card-metadata", { names: ["Island"], language });
      assert.equal(fallback.body.cards[0].language, "en");
      assert.equal(fallback.body.cards[0].printedName, "Island");
    }
    const empty = await post("/api/card-metadata", { names: [], language: "ja" });
    assert.deepEqual(empty.body.cards, []);
    const preparation = await post("/api/token-cards", { ...input, targetDate: "2026-10-03", preparation: { setCode: "fra", startsAt: "2026-10-02" } });
    assert.equal(preparation.status, 200, logs);
    const cacheStats = messageOf(child, "stats");
    child.send("stats");
    assert.equal((await cacheStats).candidateRequests, 0);

    const before = await readFile(join(ready.temporary, ".cache", "environment", "active.json"), "utf8");
    const update = await post("/api/environment/update", { format: "modern" });
    assert.notEqual(update.status, 200, "Explicit updates must still fail atomically on candidate service failure");
    assert.equal(await readFile(join(ready.temporary, ".cache", "environment", "active.json"), "utf8"), before);
    const otherFormat = await post("/api/token-cards", { ...input, format: "pioneer" });
    assert.equal(otherFormat.status, 500, "Never borrow the saved Modern candidates for another format");
  });
}
