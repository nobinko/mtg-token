// Pure mapping also used to verify that browser shortcuts, typing, IME and a
// held key never trigger repeated game actions.
export function goldfishShortcut(event, { editing = false, nativeActivation = false } = {}) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey) return null;
  const key = String(event.key || "").toLowerCase();
  if (editing && key !== "escape") return null;
  if (event.ctrlKey || event.metaKey) {
    if (editing) return null;
    if (key === "z") return event.shiftKey ? "redo" : "undo";
    if (key === "y" && !event.shiftKey) return "redo";
    return null;
  }
  if (key === "?") return "help";
  if (event.shiftKey) return null;
  if (["enter", " "].includes(key) && nativeActivation) return null;
  if (key === "enter") return "play";
  if (key === " ") return "primary";
  if (/^[1-9]$/.test(key)) return `hand:${key}`;
  return { t: "tap", u: "untap", d: "draw", n: "next", l: "library", f: "fetch",
    b: "battlefield", g: "graveyard", e: "exile", h: "hand", k: "keep", m: "mulligan", escape: "escape" }[key] || null;
}
