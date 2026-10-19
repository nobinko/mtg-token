import { nextGoldfishTurn as nextTurn, endGoldfishTurn as endTurn, chooseGoldfishRule } from "../../public/goldfish.js";
// Old focused scenarios deliberately add cards to hand. Finish the newly
// enforced cleanup choice before asserting the next turn's unrelated behavior.
export function completeCleanup(state) {
  while (state.rules.pendingChoice?.type === "cleanup") {
    const c = state.rules.pendingChoice;
    state = chooseGoldfishRule(state, { refs: c.candidates.slice(0, c.min).map(c => c.ref) });
  }
  return state;
}
export const nextGoldfishTurn = state => completeCleanup(nextTurn(state));
export const endGoldfishTurn = state => completeCleanup(endTurn(state));
