import { AsyncLocalStorage } from "node:async_hooks";

const runtime = new AsyncLocalStorage();
export const hostedRuntime = () => runtime.getStore();
export const withHostedRuntime = (env, ctx, callback) => runtime.run({ env, ctx }, callback);
