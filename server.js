// =============================================================
// charity-fund — Express server
// - serves /public statics (main site + admin)
// - POST /api/apply           — public, accepts applications
//                               persists to SQLite, forwards to Telegram
// - POST /api/auth/login      — admin login (sets signed cookie)
// - POST /api/auth/logout
// - GET  /api/auth/me
// - GET  /api/admin/stats     — admin only
// - GET  /api/admin/applications
// - PATCH /api/admin/applications/:id
// - GET  /api/admin/export    — CSV
// - GET  /healthz
// =============================================================

import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  stmtInsert,
  stmtList,
  stmtCount,
  stmtUpdateStatus,
  stmtById,
  stmtAllForExport,
  stmtSummary,
} from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ----------------------------------------------------------------------------
//  Admin credentials.
//  Defaults are intentionally weak so the admin "just works" out of the box.
//  CHANGE BEFORE EXPOSING TO REAL USERS — set ADMIN_PASSWORD on Railway.
// ----------------------------------------------------------------------------
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const COOKIE_NAME = "cf_sess";

const usingDefaultPassword = !process.env.ADMIN_PASSWORD;
if (usingDefaultPassword) {
  console.warn("");
  console.warn("==============================================================");
  console.warn("  ⚠  WARNING: using DEFAULT admin credentials (admin / 123456)");
  console.warn("     Source code is public on GitHub — anyone can read this.");
  console.warn("     Set ADMIN_PASSWORD env var on Railway as soon as possible.");
  console.warn("==============================================================");
  console.warn("");
}
if (!process.env.SESSION_SECRET) {
  console.warn(
    "[auth] SESSION_SECRET is not set — using ephemeral random secret. Sessions will reset on each redeploy."
  );
}

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "10kb" }));

// ---- Static site ----
app.use(
  express.static(path.join(__dirname, "public"), {
    extensions: ["html"],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
      } else {
        res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
      }
    },
  })
);

// ---- Helpers ----
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const escapeHtml = (s) =>
  String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
const fmtRub = (n) => Number(n).toLocaleString("ru-RU") + " ₽";

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

// ---- Signed cookie helpers (HMAC-SHA256, no deps) ----
function signSession(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("hex");
  return `${data}.${sig}`;
}

function verifySession(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function setSessionCookie(res, payload) {
  const token = signSession(payload);
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function getSession(req) {
  const cookies = parseCookies(req);
  return verifySession(cookies[COOKIE_NAME]);
}

// ---- CSRF-lite: same-origin check for mutating admin endpoints ----
function sameOrigin(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const origin = req.headers.origin || req.headers.referer || "";
  const host = req.headers.host;
  if (!origin) return res.status(403).json({ ok: false, error: "Forbidden" });
  try {
    const u = new URL(origin);
    if (u.host === host) return next();
  } catch {
    /* fallthrough */
  }
  return res.status(403).json({ ok: false, error: "Forbidden" });
}

// ---- Auth middleware ----
function requireAuth(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      ok: false,
      error: "Админка не настроена: задайте ADMIN_PASSWORD в переменных окружения.",
    });
  }
  const session = getSession(req);
  if (!session || session.role !== "admin") {
    return res.status(401).json({ ok: false, error: "Требуется вход в админку." });
  }
  req.session = session;
  next();
}

// ---- Naive in-memory rate limit (per IP, sliding 1 min window) ----
function makeRateLimiter(limit, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of hits) {
      const fresh = times.filter((t) => now - t < windowMs);
      if (fresh.length === 0) hits.delete(ip);
      else hits.set(ip, fresh);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const ip =
      (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
      req.ip ||
      "unknown";
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      return res
        .status(429)
        .json({ ok: false, error: "Слишком много запросов. Попробуйте через минуту." });
    }
    recent.push(now);
    hits.set(ip, recent);
    next();
  };
}

const applyRateLimit = makeRateLimiter(10, 60_000);
const loginRateLimit = makeRateLimiter(8, 5 * 60_000); // 8 / 5 min

// =============================================================
// Public: POST /api/apply
// =============================================================

app.post("/api/apply", applyRateLimit, async (req, res) => {
  try {
    const { slot, slotTitle, participantName, email, amount, frequency } = req.body || {};

    if (!slot || !participantName || !email || amount == null) {
      return res.status(400).json({ ok: false, error: "Заполните все поля." });
    }
    if (
      typeof participantName !== "string" ||
      participantName.trim().length < 2 ||
      participantName.length > 200
    ) {
      return res
        .status(400)
        .json({ ok: false, error: "Имя должно быть от 2 до 200 символов." });
    }
    if (typeof email !== "string" || !isEmail(email) || email.length > 200) {
      return res.status(400).json({ ok: false, error: "Невалидный email." });
    }
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0 || amt > 10_000_000) {
      return res.status(400).json({ ok: false, error: "Невалидная сумма." });
    }
    const freq = frequency === "monthly" ? "monthly" : "once";

    const ip =
      (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
      req.ip ||
      null;
    const ua = req.headers["user-agent"] || null;

    // ---- Telegram (best-effort, doesn't block intake) ----
    let forwardedToTelegram = 0;
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        const text = [
          "🆕 <b>Новая заявка в фонд</b>",
          "",
          `<b>Слот:</b> ${escapeHtml(slotTitle || slot)}`,
          `<b>Сумма:</b> ${escapeHtml(fmtRub(amt))}`,
          `<b>Частота:</b> ${freq === "monthly" ? "Ежемесячно" : "Разово"}`,
          `<b>Участник:</b> ${escapeHtml(participantName.trim())}`,
          `<b>Email:</b> <code>${escapeHtml(email.trim())}</code>`,
          "",
          `<i>${escapeHtml(new Date().toISOString())}</i>`,
        ].join("\n");

        const tgRes = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: TELEGRAM_CHAT_ID,
              text,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            }),
          }
        );
        forwardedToTelegram = tgRes.ok ? 1 : 0;
        if (!tgRes.ok) {
          console.error("[apply] telegram non-2xx:", tgRes.status, await tgRes.text().catch(() => ""));
        }
      } catch (err) {
        console.error("[apply] telegram fetch failed:", err);
      }
    }

    // ---- Persist to SQLite ----
    const result = stmtInsert.run({
      slot,
      slot_title: slotTitle || slot,
      participant_name: participantName.trim(),
      email: email.trim(),
      amount: amt,
      frequency: freq,
      ip,
      user_agent: ua,
      forwarded_to_telegram: forwardedToTelegram,
    });

    return res.json({ ok: true, id: result.lastInsertRowid, forwarded: !!forwardedToTelegram });
  } catch (err) {
    console.error("[apply] internal error:", err);
    return res.status(500).json({ ok: false, error: "Внутренняя ошибка." });
  }
});

// =============================================================
// Auth
// =============================================================

app.post("/api/auth/login", sameOrigin, loginRateLimit, (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      ok: false,
      error: "Админка не настроена: задайте ADMIN_PASSWORD в переменных окружения.",
    });
  }
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ ok: false, error: "Неверные данные." });
  }

  // Constant-time compare
  const u = Buffer.from(username);
  const p = Buffer.from(password);
  const eu = Buffer.from(ADMIN_USERNAME);
  const ep = Buffer.from(ADMIN_PASSWORD);
  const userMatch = u.length === eu.length && crypto.timingSafeEqual(u, eu);
  const passMatch = p.length === ep.length && crypto.timingSafeEqual(p, ep);
  if (!userMatch || !passMatch) {
    return res.status(401).json({ ok: false, error: "Неверный логин или пароль." });
  }

  setSessionCookie(res, {
    role: "admin",
    sub: ADMIN_USERNAME,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  });
  res.json({ ok: true });
});

app.post("/api/auth/logout", sameOrigin, (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ ok: false });
  res.json({ ok: true, user: { username: session.sub, role: session.role } });
});

// =============================================================
// Admin API
// =============================================================

app.get("/api/admin/stats", requireAuth, (_req, res) => {
  res.json({ ok: true, stats: stmtSummary.get() });
});

app.get("/api/admin/applications/:id", requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Невалидный id." });
  }
  const item = stmtById.get(id);
  if (!item) return res.status(404).json({ ok: false, error: "Заявка не найдена." });
  res.json({ ok: true, item });
});

app.get("/api/admin/applications", requireAuth, (req, res) => {
  const status = ["new", "in_progress", "done", "rejected"].includes(req.query.status)
    ? req.query.status
    : null;
  const search = req.query.q ? `%${String(req.query.q).slice(0, 100).replace(/[%_]/g, "\\$&")}%` : null;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const rows = stmtList.all({ status, search, limit, offset });
  const { cnt } = stmtCount.get({ status, search });
  res.json({ ok: true, total: cnt, limit, offset, items: rows });
});

app.patch("/api/admin/applications/:id", requireAuth, sameOrigin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "Невалидный id." });
  }
  const allowed = ["new", "in_progress", "done", "rejected"];
  const status = req.body?.status;
  if (!allowed.includes(status)) {
    return res.status(400).json({ ok: false, error: "Невалидный статус." });
  }
  const notes =
    typeof req.body?.notes === "string" ? req.body.notes.slice(0, 2000) : null;

  const existing = stmtById.get(id);
  if (!existing) return res.status(404).json({ ok: false, error: "Заявка не найдена." });

  stmtUpdateStatus.run({ id, status, notes });
  res.json({ ok: true, item: stmtById.get(id) });
});

app.get("/api/admin/export", requireAuth, (_req, res) => {
  const rows = stmtAllForExport.all();
  const headers = [
    "id",
    "created_at",
    "status",
    "slot",
    "slot_title",
    "participant_name",
    "email",
    "amount",
    "frequency",
    "forwarded_to_telegram",
    "notes",
    "ip",
    "user_agent",
    "updated_at",
  ];
  const escape = (v) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="charity-applications-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send("\uFEFF" + csv); // BOM for Excel
});

// =============================================================
// Liveness + 404 fallback
// =============================================================

app.get("/healthz", (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api")) {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  next();
});

app.listen(PORT, () => {
  console.log(
    `charity-fund :${PORT} | telegram=${
      TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID ? "on" : "off"
    } | admin=${ADMIN_PASSWORD ? "on" : "off"}`
  );
});
