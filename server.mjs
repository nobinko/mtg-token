import { relative } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { app } from "./app.mjs";
import { port, publicDir } from "./lib/config.js";

app.use("/*", serveStatic({ root: relative(process.cwd(), publicDir) }));
export const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`MTG Token Finder running at http://localhost:${port}`);
});
