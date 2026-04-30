// =============================================================
// charity-fund — Express server
// - serves /public as static
// - POST /api/apply — receives applications, forwards to Telegram
// - GET /healthz   — liveness probe
// =============================================================

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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
const fmtRub = (n) => n.toLocaleString("ru-RU") + " ₽";

// ---- Naive in-memory rate limit (per IP, sliding 1 min window) ----
const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;
const ipHits = new Map();

function rateLimit(req, res, next) {
  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.ip ||
    "unknown";
  const now = Date.now();
  const recent = (ipHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  if (recent.length >= RATE_LIMIT) {
    return res.status(429).json({ ok: false, error: "Слишком много запросов. Попробуйте через минуту." });
  }
  recent.push(now);
  ipHits.set(ip, recent);
  next();
}

// Periodic cleanup so Map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of ipHits) {
    const fresh = times.filter((t) => now - t < RATE_WINDOW);
    if (fresh.length === 0) ipHits.delete(ip);
    else ipHits.set(ip, fresh);
  }
}, RATE_WINDOW).unref();

// ---- POST /api/apply ----
app.post("/api/apply", rateLimit, async (req, res) => {
  try {
    const {
      slot,
      slotTitle,
      participantName,
      email,
      phone,
      amount,
      frequency,
      consent,
      consentTs,
    } = req.body || {};

    if (!slot || !participantName || !email || amount == null) {
      return res.status(400).json({ ok: false, error: "Заполните все поля." });
    }
    if (consent !== true) {
      return res.status(400).json({
        ok: false,
        error: "Для отправки заявки необходимо согласие на обработку персональных данных.",
      });
    }
    if (typeof participantName !== "string" || participantName.trim().length < 2 || participantName.length > 200) {
      return res
        .status(400)
        .json({ ok: false, error: "Укажите ФИО или наименование организации." });
    }
    if (typeof email !== "string" || email.length > 200) {
      return res.status(400).json({ ok: false, error: "Укажите email." });
    }
    if (!email.includes("@")) {
      return res
        .status(400)
        .json({ ok: false, error: "Email должен содержать знак @ — например, name@example.com." });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ ok: false, error: "Введите корректный email." });
    }

    // Phone: ожидаем +7XXXXXXXXXX (12 символов), но допускаем любую кириллицу/пробелы/скобки
    let phoneNormalized = "";
    if (typeof phone !== "string" || !phone.trim()) {
      return res.status(400).json({ ok: false, error: "Укажите телефон для связи." });
    }
    {
      let digits = phone.replace(/\D/g, "");
      if (digits.startsWith("8") && digits.length === 11) digits = "7" + digits.slice(1);
      if (digits.startsWith("7") && digits.length === 11) {
        phoneNormalized = "+" + digits;
      } else if (digits.length === 10) {
        phoneNormalized = "+7" + digits;
      } else {
        const after7 = digits.startsWith("7") || digits.startsWith("8") ? digits.slice(1) : digits;
        return res.status(400).json({
          ok: false,
          error: `В номере не хватает цифр: получено ${after7.length} из 10. Полный формат: +7 (999) 123-45-67.`,
        });
      }
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > 10_000_000) {
      return res.status(400).json({ ok: false, error: "Невалидная сумма." });
    }
    const freq = frequency === "monthly" ? "monthly" : "once";

    // Согласие: используем клиентскую метку времени, если она вменяемая,
    // иначе — серверное «сейчас». Это не доверенная подпись, но подтверждает,
    // что заявка прошла именно через нашу форму с активным чекбоксом.
    const submittedTs = new Date().toISOString();
    const consentTimestamp =
      typeof consentTs === "string" && !Number.isNaN(Date.parse(consentTs))
        ? consentTs
        : submittedTs;

    const submission = {
      slot,
      slotTitle: slotTitle || slot,
      participantName: participantName.trim(),
      email: email.trim(),
      phone: phoneNormalized,
      amount: amt,
      frequency: freq,
      consent: true,
      consentTs: consentTimestamp,
      ts: submittedTs,
      ip:
        (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
        req.ip ||
        null,
      ua: req.headers["user-agent"] || null,
    };

    // If Telegram not configured — log & accept.
    // (Useful in local dev so the form still feels alive.)
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn(
        "[apply] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — submission accepted but not forwarded."
      );
      console.log("[apply] submission:", submission);
      return res.json({ ok: true, forwarded: false });
    }

    const text = [
      "🆕 <b>Новая заявка в фонд</b>",
      "",
      `<b>Слот:</b> ${escapeHtml(submission.slotTitle)}`,
      `<b>Сумма:</b> ${escapeHtml(fmtRub(amt))}`,
      `<b>Частота:</b> ${freq === "monthly" ? "Ежемесячно" : "Разово"}`,
      `<b>Участник:</b> ${escapeHtml(submission.participantName)}`,
      `<b>Телефон:</b> <a href="tel:${escapeHtml(submission.phone)}">${escapeHtml(submission.phone)}</a>`,
      `<b>Email:</b> <code>${escapeHtml(submission.email)}</code>`,
      "",
      `✅ <i>Согласие на обработку персональных данных получено</i>`,
      `<i>${escapeHtml(submission.ts)}</i>`,
    ].join("\n");

    const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const tgRes = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!tgRes.ok) {
      const errText = await tgRes.text().catch(() => "");
      console.error("[apply] telegram error:", tgRes.status, errText);
      return res
        .status(502)
        .json({ ok: false, error: "Не удалось отправить заявку. Попробуйте ещё раз." });
    }

    return res.json({ ok: true, forwarded: true });
  } catch (err) {
    console.error("[apply] internal error:", err);
    return res.status(500).json({ ok: false, error: "Внутренняя ошибка." });
  }
});

// ---- Liveness probe ----
app.get("/healthz", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ---- 404 fallback (SPA-friendly: send index.html for non-API routes) ----
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api")) {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  next();
});

app.listen(PORT, () => {
  console.log(
    `charity-fund listening on :${PORT} (telegram: ${
      TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID ? "configured" : "NOT configured"
    })`
  );
});
