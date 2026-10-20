import { goldfishSideboardPool } from "./goldfish-sideboard.js?v=20261020-public30a";

export function renderSideboardEditor(container, state, apply) {
  const pool = goldfishSideboardPool(state);
  let counts = Object.fromEntries(pool.map(r => [r.name, state.deckRows.filter(c => c.name === r.name).reduce((n, c) => n + c.count, 0)]));
  const required = state.deckRows.reduce((n, r) => n + r.count, 0);
  const el = (tag, text = "", cls = "") => { const e = document.createElement(tag); e.textContent = text; e.className = cls; return e; };
  container.replaceChildren();
  const hint = el("p", "入れるカードと抜くカードを選び、入れ替え後の初手から始めます。盤面は「戻す」で復元できます。", "goldfish-panel-hint");
  const search = el("input"); search.type = "search"; search.placeholder = "カード名で絞る"; search.setAttribute("aria-label", "入れ替えるカード名");
  const lists = el("div", "", "goldfish-sideboard-lists"), footer = el("div", "", "goldfish-sideboard-footer");
  const tabs = el("nav", "", "goldfish-sideboard-tabs"); tabs.setAttribute("aria-label", "入れ替える側");
  let active = "side";
  const tabButtons = ["side", "main"].map(direction => {
    const button = el("button", direction === "side" ? "入れる：サイドから" : "抜く：メインから");
    button.type = "button";
    button.addEventListener("click", () => { active = direction; render(); lists.scrollTop = 0; });
    tabs.append(button); return button;
  });
  const summary = el("p"), reset = el("button", "元のリストへ戻す"), start = el("button", "この構成で初手から", "primary-button");
  reset.type = start.type = "button";
  footer.append(summary, reset, start); container.append(hint, search, tabs, lists, footer);
  const render = () => {
    lists.dataset.active = active;
    tabButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(active === (i === 0 ? "side" : "main"))));
    const total = Object.values(counts).reduce((n, c) => n + c, 0), difference = total - required;
    summary.textContent = `メイン ${total}枚 / サイド ${pool.reduce((n, c) => n + c.count, 0) - total}枚` + (difference ? ` — あと${Math.abs(difference)}枚${difference > 0 ? "抜いて" : "入れて"}ください` : " — 入れ替えできます");
    summary.setAttribute("role", "status"); start.disabled = difference !== 0;
    lists.replaceChildren();
    for (const side of [true, false]) {
      const section = el("section"), title = el("h4", side ? "入れる：サイドから" : "抜く：メインから"); section.append(title);
      section.dataset.direction = side ? "side" : "main";
      for (const row of pool.filter(r => (side ? r.count - counts[r.name] : counts[r.name]) > 0 && r.name.toLowerCase().includes(search.value.toLowerCase()))) {
        const item = el("div", "", "goldfish-sideboard-row"), name = el("span", `${side ? row.count - counts[row.name] : counts[row.name]}枚  ${row.name}`), button = el("button", side ? "＋ 入れる" : "− 抜く");
        button.type = "button"; button.setAttribute("aria-label", `${row.name}を1枚${side ? "入れる" : "抜く"}`);
        button.addEventListener("click", () => { counts[row.name] += side ? 1 : -1; render(); }); item.append(name, button); section.append(item);
      }
      lists.append(section);
    }
  };
  search.addEventListener("input", render);
  reset.addEventListener("click", () => { counts = Object.fromEntries(pool.map(r => [r.name, (state.registeredDeck?.main || state.deckRows).filter(c => c.name === r.name).reduce((n, c) => n + c.count, 0)])); render(); });
  start.addEventListener("click", () => { try { apply(counts); } catch (error) { summary.textContent = error.message; } });
  render();
}
