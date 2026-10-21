import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { hostedRuntime } from "./runtime.js";
import { loginPage } from "./login-page.js";
import { requestLogs } from "./request-logs.js";

const COOKIE = "mtg_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const localAttempts = new Map();
const revokedLocal = new Map();
const digest = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => { const a = Buffer.from(left), b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); };
const signature = (value, config) => createHmac("sha256", config.key).update(`${config.hash}:${value}`).digest("base64url");
let localConfig;
const getLocalConfig = () => localConfig ||= { hash: digest("local progress scope"), key: randomBytes(32).toString("hex") };

async function isRevoked(c, scope) {
  if (hostedRuntime()) return Boolean(await c.env.DB.prepare("SELECT token_hash FROM revoked_sessions WHERE token_hash = ? AND expires_at > ?").bind(scope, Math.floor(Date.now() / 1000)).first());
  return (revokedLocal.get(scope) || 0) > Date.now();
}

async function revoke(c, token) {
  const scope = digest(token), expires = Number(token.split(".")[0]);
  if (hostedRuntime()) {
    await c.env.DB.prepare("INSERT OR IGNORE INTO revoked_sessions (token_hash, expires_at) VALUES (?, ?)").bind(scope, expires).run();
    await c.env.DB.prepare("DELETE FROM revoked_sessions WHERE expires_at <= ?").bind(Math.floor(Date.now() / 1000)).run();
  } else {
    for (const [key, expiry] of revokedLocal) if (expiry <= Date.now()) revokedLocal.delete(key);
    revokedLocal.set(scope, expires * 1000);
  }
  requestLogs.clear(scope);
}

async function loginPassword(request) {
  if (Number(request.headers.get("content-length")) > 8192 || !request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 8192) { await reader.cancel(); return ""; }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return new URLSearchParams(text).get("password") || "";
  } finally { reader.releaseLock(); }
}

export function validSession(token, config, now = Date.now()) {
  if (!token || token.length > 256) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[\w-]{32}$/.test(parts[1]) || !/^[\w-]{43}$/.test(parts[2])) return false;
  const expires = Number(parts[0]);
  if (expires <= Math.floor(now / 1000) || expires > Math.floor(now / 1000) + SESSION_SECONDS) return false;
  return same(parts[2], signature(`${parts[0]}.${parts[1]}`, config));
}

export function issueSession(config, now = Date.now()) {
  const value = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(24).toString("base64url")}`;
  return `${value}.${signature(value, config)}`;
}

async function allowAttempt(c) {
  const window = Math.floor(Date.now() / 600_000);
  const secret = hostedRuntime() ? c.env.SESSION_SECRET : getLocalConfig().key;
  const key = `${createHmac("sha256", secret).update(c.req.header("cf-connecting-ip") || "local").digest("hex")}:${window}`;
  if (hostedRuntime()) {
    if (!c.env.DB) throw new Error("認証を利用できません。時間をおいて再試行してください。");
    const row = await c.env.DB.prepare("INSERT INTO login_attempts (key, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts")
      .bind(key, (window + 2) * 600).first();
    await c.env.DB.prepare("DELETE FROM login_attempts WHERE expires_at < ?").bind(Math.floor(Date.now() / 1000)).run();
    return Number(row?.attempts) <= 20;
  }
  if (localAttempts.size > 1000) localAttempts.clear();
  const attempts = (localAttempts.get(key) || 0) + 1;
  localAttempts.set(key, attempts);
  return attempts <= 20;
}

export function passwordGate() {
  return async (c, next) => {
    const env = hostedRuntime() ? c.env : process.env;
    const required = Boolean(hostedRuntime()) || env.AUTH_REQUIRED === "true";
    c.header("Cache-Control", "private, no-store");
    c.header("X-Robots-Tag", "noindex, nofollow");
    // no-referrer can make a form POST's Origin "null". same-origin keeps
    // external image hosts private while retaining strict form CSRF checks.
    c.header("Referrer-Policy", "same-origin");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cards.scryfall.io https://svgs.scryfall.io https://gatherer.wizards.com https://mtg-jp.com https://media.wizards.com https://media.wpn.wizards.com; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (!required) {
      const localConfig = getLocalConfig();
      let token = getCookie(c, "mtg_local_scope");
      if (!validSession(token, localConfig)) {
        token = issueSession(localConfig);
        setCookie(c, "mtg_local_scope", token, { httpOnly: true, sameSite: "Strict", path: "/", maxAge: SESSION_SECONDS });
      }
      c.set("sessionScope", digest(token));
      c.set("sessionExpires", Number(token.split(".")[0]) * 1000);
      c.set("sessionActive", async () => validSession(token, localConfig));
      return next();
    }
    const config = { hash: env.SITE_PASSWORD_SHA256 || "", key: env.SESSION_SECRET || "" };
    if (!/^[a-f0-9]{64}$/.test(config.hash) || config.key.length < 32) {
      return c.html(loginPage("公開準備中です。時間をおいて開き直してください。", false), 503);
    }
    const token = getCookie(c, COOKIE);
    let authenticated = false;
    try { authenticated = validSession(token, config) && !await isRevoked(c, digest(token)); }
    catch { return c.json({ error: "認証を確認できません。時間をおいて再試行してください。" }, 503); }
    const path = c.req.path;
    if (c.req.method === "POST") {
      const origin = c.req.header("origin");
      if ((origin && origin !== new URL(c.req.url).origin) || c.req.header("sec-fetch-site") === "cross-site") return c.json({ error: "同じ画面から操作してください。" }, 403);
    }
    if (path === "/login" && c.req.method === "POST") {
      try {
        if (!await allowAttempt(c)) {
          c.header("Retry-After", "600");
          return c.html(loginPage("入力回数が多いため、10分ほど待って再試行してください。"), 429);
        }
        const password = await loginPassword(c.req.raw);
        if (!same(digest(password), config.hash)) return c.html(loginPage("パスワードが違います。もう一度入力してください。"), 401);
        setCookie(c, COOKIE, issueSession(config), { httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax", path: "/", maxAge: SESSION_SECONDS });
        return c.redirect("/", 303);
      } catch {
        console.error("[auth] login unavailable");
        return c.html(loginPage("ログインできませんでした。時間をおいて再試行してください。"), 503);
      }
    }
    if (path === "/logout" && c.req.method === "POST") {
      if (authenticated) {
        try { await revoke(c, token); }
        catch { return c.html(loginPage("ログアウトを完了できませんでした。もう一度操作してください。", false), 503); }
      }
      deleteCookie(c, COOKIE, { path: "/", secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax" });
      if (c.req.query("clear") === "1") c.header("Clear-Site-Data", '"cache", "storage"');
      return c.redirect("/login", 303);
    }
    if (path === "/login" && c.req.method === "GET") return authenticated ? c.redirect("/") : c.html(loginPage());
    if (!authenticated) {
      if (path.startsWith("/api/")) return c.json({ error: "パスワードを入力してログインしてください。", loginRequired: true }, 401);
      return c.redirect("/login", 303);
    }
    c.set("sessionScope", digest(token));
    c.set("sessionExpires", Number(token.split(".")[0]) * 1000);
    c.set("sessionActive", async () => validSession(token, config) && !await isRevoked(c, digest(token)));
    await next();
  };
}
