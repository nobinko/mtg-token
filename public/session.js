// Send an expired session back to login, including sessions expiring mid-search.
const originalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (response.status === 401 && new URL(response.url, location.href).origin === location.origin) location.replace("/login");
  return response;
};
originalFetch("/api/session").then(response => response.json()).then(session => {
  document.querySelector("#logout-form").hidden = !session.protected;
}).catch(() => {});
