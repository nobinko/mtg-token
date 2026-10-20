// Only timestamps cross request boundaries. A Worker request must not await a
// timer Promise created by another request (which may already be cancelled).
export function createRequestPacer({ now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let lastReservedAt = 0;
  return async delayMs => {
    const start = now();
    const reserved = Math.max(start, lastReservedAt + delayMs);
    lastReservedAt = reserved;
    if (reserved > start) await sleep(reserved - start);
  };
}
