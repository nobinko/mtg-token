import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requiredIds = [
  "goldfish-opponent-life",
  "goldfish-self-life",
  "goldfish-battlefield-land",
  "goldfish-battlefield-creature",
  "goldfish-battlefield-other",
  "goldfish-hand",
  "goldfish-graveyard",
  "goldfish-exile",
  "goldfish-command",
  "goldfish-sideboard",
  "goldfish-library-browser",
  "goldfish-top-results",
  "goldfish-token-form",
  "goldfish-undo",
  "goldfish-redo",
  "goldfish-save",
  "goldfish-resume",
  "goldfish-game-log"
];

test("the playtest table exposes every primary paper-play zone and control", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  for (const id of requiredIds) assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  assert.match(html, /data-goldfish-action="fetch"/);
  assert.match(html, /data-goldfish-library-mode="search"/);
  assert.match(html, /data-goldfish-library-mode="top"/);
});

test("the application uses the unified controller instead of the retired inline UI", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const controller = await readFile(new URL("../public/goldfish-ui.js", import.meta.url), "utf8");
  assert.match(app, /createGoldfishController/);
  assert.doesNotMatch(app, /function renderGoldfish\(/);
  assert.doesNotMatch(app, /const goldfishState/);
  assert.match(controller, /button\.draggable = state\?\.phase === "playing"/);
  assert.match(controller, /addEventListener\("dragstart"/);
  assert.match(controller, /addEventListener\("drop"/);
  assert.match(controller, /dataset\.battlefieldLane/);
});

test("battlefield tap presentation rotates the physical card surface", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.battlefield-drop-zone \.goldfish-card-visual\.is-tapped \.goldfish-card-surface\s*\{[^}]*rotate\(90deg\)/s);
});
