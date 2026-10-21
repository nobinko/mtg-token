import { AsyncLocalStorage } from "node:async_hooks";

export const logContext = new AsyncLocalStorage();

// Request logs live only in memory. Neither a client-supplied run ID nor an
// unscoped process log is authority to read another session's progress.
export function createRequestLogs({ now = Date.now, maxEntries = 600, ttlMs = 15 * 60_000 } = {}) {
  let entries = [];
  const listeners = new Set();
  const prune = () => { entries = entries.filter(item => item.expires > now()); };
  return {
    publish(context, line) {
      if (!context?.sessionScope || context.privateTournament) return;
      prune();
      const entry = { line: redactLog(line).slice(0, 2000), runId: context.runId || "", at: new Date(now()).toISOString() };
      const expires = Math.min(now() + ttlMs, context.sessionExpires || Infinity);
      if (expires <= now()) return;
      entries.push({ owner: context.sessionScope, entry, expires });
      if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);
      for (const listener of listeners) {
        if (listener.owner === context.sessionScope) Promise.resolve().then(() => listener.write(entry)).catch(() => listeners.delete(listener));
      }
    },
    subscribe(owner, write) {
      prune();
      if (!owner) return () => {};
      const listener = { owner, write };
      listeners.add(listener);
      for (const item of entries) if (item.owner === owner) Promise.resolve().then(() => write(item.entry)).catch(() => listeners.delete(listener));
      return () => listeners.delete(listener);
    },
    clear(owner) { entries = entries.filter(item => item.owner !== owner); }
  };
}

export function redactLog(value) {
  return String(value)
    .replace(/\bhttps?:\/\/[^\s<>"']+/gi, text => {
      try { const url = new URL(text); url.username = ""; url.password = ""; url.search = ""; url.hash = ""; return url.href; }
      catch { return "[URL]"; }
    })
    .replace(/\b(authorization|cookie|password|secret|token|api[_-]?key|client[_-]?secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

export const requestLogs = createRequestLogs();
