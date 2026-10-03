import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { hostedRuntime } from "./runtime.js";
import { loginPage } from "./login-page.js";

const COOKIE = "mtg_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const localAttempts = new Map();
const digest = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
const signature = (value, config) => createHmac("sha256", config.key).update(`${config.hash}:${value}`).digest("base64url");

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
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[\w-]{32}$/.test(parts[1])) return false;
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
  const key = `${digest(c.req.header("cf-connecting-ip") || "local")}:${window}`;
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
    if (!required) return next();
    c.header("Cache-Control", "private, no-store");
    c.header("X-Robots-Tag", "noindex, nofollow");
    c.header("Referrer-Policy", "same-origin");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    const config = { hash: env.SITE_PASSWORD_SHA256 || "", key: env.SESSION_SECRET || "" };
    if (!/^[a-f0-9]{64}$/.test(config.hash) || config.key.length < 32) {
      return c.html(loginPage("公開準備中です。時間をおいて開き直してください。", false), 503);
    }
    const authenticated = validSession(getCookie(c, COOKIE), config);
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
      } catch (error) {
        console.error("[auth] login unavailable", error.message);
        return c.html(loginPage("ログインできませんでした。時間をおいて再試行してください。"), 503);
      }
    }
    if (path === "/logout" && c.req.method === "POST") {
      deleteCookie(c, COOKIE, { path: "/", secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax" });
      return c.redirect("/login", 303);
    }
    if (path === "/login" && c.req.method === "GET") return authenticated ? c.redirect("/") : c.html(loginPage());
    if (!authenticated) {
      if (path.startsWith("/api/")) return c.json({ error: "パスワードを入力してログインしてください。", loginRequired: true }, 401);
      return c.redirect("/login", 303);
    }
    await next();
  };
}
