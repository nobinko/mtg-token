// Runs before first paint (classic script in <head>) so the saved theme never flashes.
(() => {
  const storageKey = "mtg-token-finder.theme";
  const themeColors = { dark: "#0b100f", light: "#f3efe6" };
  const root = document.documentElement;
  let theme = "dark";
  try { if (localStorage.getItem(storageKey) === "light") theme = "light"; } catch { /* storage unavailable */ }
  root.dataset.theme = theme;

  function sync(button) {
    const current = root.dataset.theme === "light" ? "light" : "dark";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColors[current]);
    if (!button) return;
    const label = current === "light" ? "暗い表示に切り替え" : "明るい表示に切り替え";
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const button = document.querySelector("#theme-toggle");
    sync(button);
    button?.addEventListener("click", () => {
      root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
      try { localStorage.setItem(storageKey, root.dataset.theme); } catch { /* storage unavailable */ }
      sync(button);
    });
  });
})();
