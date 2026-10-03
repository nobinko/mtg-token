import { app } from "./app.mjs";
import { withHostedRuntime } from "./lib/runtime.js";
import assets from "virtual:public-assets";

app.get("*", c => {
  const path = c.req.path === "/" ? "/index.html" : c.req.path;
  const asset = assets[path];
  if (!asset) return c.notFound();
  return c.body(asset.body, 200, { "Content-Type": asset.type });
});

export default {
  fetch(request, env, ctx) {
    return withHostedRuntime(env, ctx, () => app.fetch(request, env, ctx));
  },
};
