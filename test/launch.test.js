import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import {
  APP_RUNNING,
  checkLaunchPort,
  PORT_FREE,
  PORT_OCCUPIED
} from "../scripts/check-launch-port.mjs";

const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});

const close = (server) => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
});

test("checkLaunchPort reports the MTG Token Finder already running", async (t) => {
  const server = createServer((request, response) => {
    if (request.url === "/api/formats") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([
        { key: "standard" },
        { key: "pioneer" },
        { key: "modern" },
        { key: "legacy" }
      ]));
      return;
    }
    response.writeHead(404).end();
  });
  const port = await listen(server);
  t.after(() => close(server));

  assert.equal(await checkLaunchPort({ port, timeoutMs: 300 }), APP_RUNNING);
});

test("checkLaunchPort distinguishes another service from this app", async (t) => {
  const server = createServer((_request, response) => response.end("another app"));
  const port = await listen(server);
  t.after(() => close(server));

  assert.equal(await checkLaunchPort({ port, timeoutMs: 300 }), PORT_OCCUPIED);
});

test("checkLaunchPort reports a released port as free", async () => {
  const server = createServer();
  const port = await listen(server);
  await close(server);

  assert.equal(await checkLaunchPort({ port, timeoutMs: 300 }), PORT_FREE);
});
