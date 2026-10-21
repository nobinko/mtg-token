// Send an expired session back to login, including sessions expiring mid-search.
const originalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (response.status === 401 && new URL(response.url, location.href).origin === location.origin) {
    const error = await response.clone().json().catch(() => ({}));
    if (error.loginRequired) location.replace("/login");
  }
  return response;
};
originalFetch("/api/session").then(response => response.json()).then(session => {
  document.querySelector("#logout-form").hidden = !session.protected;
}).catch(() => {});

// A restored history page must recheck its session before showing old lists.
window.addEventListener("pagehide", () => { document.documentElement.style.visibility = "hidden"; });
window.addEventListener("pageshow", event => {
  if (event.persisted) location.reload();
  else document.documentElement.style.visibility = "";
});
if (typeof BroadcastChannel === "function") {
  const channel = new BroadcastChannel("mtg-token-session");
  channel.addEventListener("message", event => {
    if (event.data === "leave-app") location.replace("/privacy.html");
    if (event.data === "logged-out") location.replace("/login");
  });
}
