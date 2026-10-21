import { clearDeviceData } from "./device-privacy.js";

const form = document.querySelector("#privacy-logout");
const status = document.querySelector("#privacy-status");
const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("mtg-token-session") : null;
form.addEventListener("submit", async event => {
  event.preventDefault();
  const url = event.submitter?.getAttribute("formaction") || form.action;
  for (const button of form.querySelectorAll("button")) button.disabled = true;
  status.textContent = "ログアウトしています…";
  // Other app tabs stop processing and saving before the clear-storage response.
  channel?.postMessage("leave-app");
  try {
    if (new URL(url, location.href).searchParams.get("clear") === "1") await clearDeviceData();
    const response = await fetch(url, { method: "POST" });
    if (!response.ok || new URL(response.url).pathname !== "/login") throw new Error("ログアウトを完了できませんでした。もう一度操作してください。");
    channel?.postMessage("logged-out");
    location.replace("/login");
  } catch (error) {
    status.textContent = error.message;
    for (const button of form.querySelectorAll("button")) button.disabled = false;
  }
});
channel?.addEventListener("message", event => { if (event.data === "logged-out") location.replace("/login"); });
