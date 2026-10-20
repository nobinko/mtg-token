import { createGoldfishGame } from "./goldfish.js?v=20261020-public30c";

// Registered rows, not cards currently in zones: a Wish, token or stolen card
// must never become part of the next game's deck.
export function goldfishSideboardPool(state) {
  const pool = new Map();
  const registered = state.registeredDeck || { main: state.deckRows, side: state.sideboardRows };
  for (const row of [...registered.main, ...registered.side]) {
    const previous = pool.get(row.name);
    pool.set(row.name, { ...row, count: (previous?.count || 0) + row.count });
  }
  return [...pool.values()];
}

export function sideboardGoldfishGame(state, mainCounts, { random = Math.random } = {}) {
  const pool = goldfishSideboardPool(state), names = new Set(pool.map(r => r.name));
  const registeredDeck = state.registeredDeck || { main: state.deckRows, side: state.sideboardRows };
  const required = registeredDeck.main.reduce((n, r) => n + r.count, 0);
  if (!mainCounts || typeof mainCounts !== "object" || Array.isArray(mainCounts) || Object.keys(mainCounts).some(n => !names.has(n))) throw new Error("元のリストにあるカードを選んでください。");
  const main = [], side = [];
  for (const row of pool) {
    const count = mainCounts[row.name] ?? 0;
    if (!Number.isInteger(count) || count < 0 || count > row.count) throw new Error(`${row.name}の枚数を確認してください。`);
    if (count) main.push({ ...row, count });
    if (count < row.count) side.push({ ...row, count: row.count - count });
  }
  if (main.reduce((n, r) => n + r.count, 0) !== required) throw new Error(`入れる枚数と抜く枚数を揃えてください（メイン${required}枚）。`);
  return createGoldfishGame(main, { sideboardRows: side, onThePlay: state.onThePlay, registeredDeck, random });
}

export function goldfishFinish(state) {
  if (state.rules.win) return state.rules.win;
  if (state.phase !== "playing" || state.rules.pendingChoice || state.stack.length || state.rules.sacrificeSequence) return null;
  const selfLost = state.players.self.life <= 0 || state.players.self.poison >= 10 || state.rules.emptyDraw;
  const opponentLost = state.players.opponent.life <= 0 || state.players.opponent.poison >= 10 || state.rules.opponentEmptyDraw;
  if (selfLost && opponentLost) return { kind: "draw", label: "両者の敗北条件に到達" };
  if (selfLost) return { kind: "loss", label: state.rules.emptyDraw ? "山札が空の状態でドローしました" : "自分の敗北条件に到達" };
  if (opponentLost) return { kind: "win", label: state.rules.opponentEmptyDraw ? "相手が山札のない状態でドローしました" : state.players.opponent.poison >= 10 ? "相手の毒が10個に到達" : "相手のライフを0以下にしました" };
  return null;
}
