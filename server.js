// =============================================================
// charity-fund — Express server
// - serves /public as static
// - GET  /api/slots — active slots with funded progress
// - POST /api/apply — applications + consents → PostgreSQL, Telegram notify
// - GET  /api/applications/:id — public application status
// - GET  /healthz   — liveness + DB probe
// =============================================================

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

let checkDb, isDbConfigured, query, withTransaction;
try {
  const db = await import("./db.js");
  checkDb = db.checkDb;
  isDbConfigured = db.isDbConfigured;
  query = db.query;
  withTransaction = db.withTransaction;
} catch (err) {
  console.error("[db] module failed to load:", err.message);
  isDbConfigured = () => false;
  checkDb = async () => false;
  query = async () => {
    throw new Error("Database module unavailable");
  };
  withTransaction = async () => {
    throw new Error("Database module unavailable");
  };
}

let ensureDbReady = async () => {};
try {
  const setup = await import("./db-setup.js");
  ensureDbReady = () => setup.ensureDbReady(query, isDbConfigured);
} catch (err) {
  console.error("[db] setup module failed to load:", err.message);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    null
  );
}

function isIsoTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function requireDb(_req, res, next) {
  if (!isDbConfigured()) {
    return res.status(503).json({ ok: false, error: "База данных не настроена." });
  }
  next();
}

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

setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of ipHits) {
    const fresh = times.filter((t) => now - t < RATE_WINDOW);
    if (fresh.length === 0) ipHits.delete(ip);
    else ipHits.set(ip, fresh);
  }
}, RATE_WINDOW).unref();

// ---- GET /api/slots ----
app.get("/api/slots", requireDb, async (_req, res) => {
  try {
    // TODO(payments): after payment integration, count only applications with status = 'paid'
    const { rows } = await query(
      `SELECT
         s.id,
         s.title,
         s.description,
         s.goal_amount,
         s.initial_funded_amount,
         s.is_active,
         COALESCE(SUM(a.amount), 0)::integer AS applications_sum
       FROM support_slots s
       LEFT JOIN applications a
         ON a.slot_id = s.id
         AND a.status IN ('created', 'pending_payment', 'paid')
       WHERE s.is_active = true
       GROUP BY s.id, s.title, s.description, s.goal_amount, s.initial_funded_amount, s.is_active
       ORDER BY s.id`
    );

    const slots = rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description || "",
      goal: row.goal_amount,
      funded: row.initial_funded_amount + row.applications_sum,
      isActive: row.is_active,
    }));

    return res.json(slots);
  } catch (err) {
    console.error("[slots] db error:", err.message);
    return res.status(500).json({ ok: false, error: "Не удалось загрузить слоты." });
  }
});

// ---- GET /api/applications/:id ----
app.get("/api/applications/:id", requireDb, async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ ok: false, error: "Некорректный идентификатор заявки." });
  }

  try {
    const { rows } = await query(
      `SELECT id, slot_title, email, amount, frequency, status, created_at
       FROM applications
       WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Заявка не найдена." });
    }

    const row = rows[0];
    return res.json({
      id: row.id,
      slotTitle: row.slot_title,
      email: row.email,
      amount: row.amount,
      frequency: row.frequency,
      status: row.status,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error("[applications] db error:", err.message);
    return res.status(500).json({ ok: false, error: "Не удалось получить заявку." });
  }
});

function telegramStatus() {
  return TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID ? "configured" : "not_configured";
}

async function sendTelegramNotification(submission) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn(
      "[apply] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — notification skipped."
    );
    return { forwarded: false, reason: "telegram_not_configured" };
  }

  const freq = submission.frequency;
  const text = [
    "🆕 <b>Новая заявка в фонд</b>",
    "",
    `<b>ID заявки:</b> <code>${escapeHtml(submission.applicationId)}</code>`,
    `<b>Слот:</b> ${escapeHtml(submission.slotTitle)}`,
    `<b>Сумма:</b> ${escapeHtml(fmtRub(submission.amount))}`,
    `<b>Частота:</b> ${freq === "monthly" ? "Ежемесячно" : "Разово"}`,
    `<b>Участник:</b> ${escapeHtml(submission.participantName || "—")}`,
    submission.phone
      ? `<b>Телефон:</b> <a href="tel:${escapeHtml(submission.phone)}">${escapeHtml(submission.phone)}</a>`
      : "",
    `<b>Email:</b> <code>${escapeHtml(submission.email)}</code>`,
    `<b>Статус:</b> ${escapeHtml(submission.status)}`,
    "",
    "<b>Согласия:</b>",
    `• Оферта: ${submission.offerAccepted ? "да" : "нет"} (${escapeHtml(submission.offerVersion || "—")})`,
    `• Политика ПД: ${submission.privacyAccepted ? "да" : "нет"} (${escapeHtml(submission.privacyPolicyVersion || "—")})`,
    `• Регулярное списание: ${submission.recurringAccepted ? "да" : "нет"}`,
    `• Отмена подписки: ${submission.cancellationTermsAccepted ? "да" : "нет"} (${escapeHtml(submission.subscriptionTermsVersion || "—")})`,
    "",
    `<b>Клиент (UTC):</b> <code>${escapeHtml(submission.consentClientTimestamp || "—")}</code>`,
    `<b>Сервер (UTC):</b> <code>${escapeHtml(submission.consentServerTimestamp)}</code>`,
    `<b>IP:</b> <code>${escapeHtml(submission.userIp || "—")}</code>`,
    `<b>User-Agent:</b> <code>${escapeHtml(submission.userAgent || "—")}</code>`,
  ]
    .filter(Boolean)
    .join("\n");

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
    console.error("[apply] telegram error:", tgRes.status, errText.slice(0, 200));
    return { forwarded: false, reason: "telegram_api_error" };
  }

  return { forwarded: true };
}

// ---- POST /api/apply ----
app.post("/api/apply", rateLimit, requireDb, async (req, res) => {
  try {
    const {
      slot,
      slotTitle,
      participantName,
      email,
      phone,
      amount,
      frequency,
      offerAccepted,
      privacyAccepted,
      recurringAccepted,
      cancellationTermsAccepted,
      offerVersion,
      privacyPolicyVersion,
      subscriptionTermsVersion,
      consentClientTimestamp,
    } = req.body || {};

    if (!slot || typeof slot !== "string") {
      return res.status(400).json({ ok: false, error: "Выберите слот." });
    }
    if (!slotTitle || typeof slotTitle !== "string" || !slotTitle.trim()) {
      return res.status(400).json({ ok: false, error: "Укажите название слота." });
    }
    if (offerAccepted !== true) {
      return res.status(400).json({
        ok: false,
        error: "Для отправки заявки необходимо принять условия Оферты.",
      });
    }
    if (privacyAccepted !== true) {
      return res.status(400).json({
        ok: false,
        error: "Для отправки заявки необходимо согласие с Политикой обработки персональных данных.",
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

    let phoneNormalized = null;
    if (phone != null && String(phone).trim() !== "") {
      if (typeof phone !== "string") {
        return res.status(400).json({ ok: false, error: "Укажите телефон для связи." });
      }
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
    } else {
      return res.status(400).json({ ok: false, error: "Укажите телефон для связи." });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > 10_000_000) {
      return res.status(400).json({ ok: false, error: "Невалидная сумма." });
    }

    const freq = frequency === "monthly" ? "monthly" : "once";
    if (freq !== "once" && freq !== "monthly") {
      return res.status(400).json({ ok: false, error: "Некорректная частота платежа." });
    }

    if (freq === "monthly") {
      if (recurringAccepted !== true) {
        return res.status(400).json({
          ok: false,
          error:
            "Для ежемесячного платежа необходимо согласие на регулярное автоматическое списание.",
        });
      }
      if (cancellationTermsAccepted !== true) {
        return res.status(400).json({
          ok: false,
          error:
            "Для ежемесячного платежа необходимо ознакомление с порядком отмены подписки.",
        });
      }
    }

    const offerVer = typeof offerVersion === "string" ? offerVersion.trim() : "";
    const privacyVer = typeof privacyPolicyVersion === "string" ? privacyPolicyVersion.trim() : "";
    const subscriptionVer =
      typeof subscriptionTermsVersion === "string" ? subscriptionTermsVersion.trim() : "";
    if (!offerVer || !privacyVer || !subscriptionVer) {
      return res.status(400).json({ ok: false, error: "Отсутствуют версии юридических документов." });
    }

    const consentServerTimestamp = new Date().toISOString();
    const userIp = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "";
    const clientTs = isIsoTimestamp(consentClientTimestamp) ? consentClientTimestamp : null;

    let applicationId;
    try {
      applicationId = await withTransaction(async (client) => {
        const appResult = await client.query(
          `INSERT INTO applications (
             slot_id, slot_title, participant_name, email, phone,
             amount, frequency, status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'created')
           RETURNING id`,
          [
            slot,
            slotTitle.trim(),
            participantName.trim(),
            email.trim(),
            phoneNormalized,
            amt,
            freq,
          ]
        );

        const appId = appResult.rows[0].id;

        await client.query(
          `INSERT INTO consents (
             application_id, email,
             offer_accepted, privacy_accepted,
             recurring_accepted, cancellation_terms_accepted,
             offer_version, privacy_policy_version, subscription_terms_version,
             consent_client_timestamp, consent_server_timestamp,
             user_ip, user_agent
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            appId,
            email.trim(),
            true,
            true,
            freq === "monthly",
            freq === "monthly",
            offerVer,
            privacyVer,
            subscriptionVer,
            clientTs,
            consentServerTimestamp,
            userIp,
            userAgent,
          ]
        );

        return appId;
      });
    } catch (err) {
      console.error("[apply] db save failed:", err.code || "", err.message);
      return res.status(500).json({ ok: false, error: "Не удалось сохранить заявку. Попробуйте ещё раз." });
    }

    const notify = await sendTelegramNotification({
      applicationId,
      status: "created",
      slotTitle: slotTitle.trim(),
      participantName: participantName.trim(),
      email: email.trim(),
      phone: phoneNormalized,
      amount: amt,
      frequency: freq,
      offerAccepted: true,
      privacyAccepted: true,
      recurringAccepted: freq === "monthly",
      cancellationTermsAccepted: freq === "monthly",
      offerVersion: offerVer,
      privacyPolicyVersion: privacyVer,
      subscriptionTermsVersion: subscriptionVer,
      consentClientTimestamp: clientTs,
      consentServerTimestamp,
      userIp,
      userAgent,
    });

    return res.json({
      ok: true,
      applicationId,
      status: "created",
      forwarded: notify.forwarded,
      ...(notify.reason && { notifyReason: notify.reason }),
    });
  } catch (err) {
    console.error("[apply] internal error:", err.message);
    return res.status(500).json({ ok: false, error: "Внутренняя ошибка." });
  }
});

// ---- Liveness probe ----
// Always HTTP 200 so Railway/load balancers keep the service up.
// DB status is informational; a down DB must not take the static site offline.
app.get("/healthz", async (_req, res) => {
  const telegram = telegramStatus();
  if (!isDbConfigured()) {
    return res.json({ ok: true, db: "not_configured", schema: "n/a", telegram });
  }
  const dbOk = await checkDb();
  let schema = "unknown";
  if (dbOk) {
    try {
      const { rows } = await query(`SELECT to_regclass('public.support_slots') AS slots`);
      if (!rows[0].slots) {
        schema = "missing_tables";
      } else {
        const { rows: countRows } = await query("SELECT COUNT(*)::int AS n FROM support_slots");
        schema = `ready:${countRows[0].n}`;
      }
    } catch (err) {
      schema = "error";
      console.error("[healthz] schema check:", err.message);
    }
  }
  return res.json({ ok: true, db: dbOk ? "ok" : "error", schema, telegram });
});

// ---- 404 fallback (SPA-friendly: send index.html for non-API routes) ----
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api")) {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  next();
});

const HOST = process.env.HOST || "0.0.0.0";

if (isDbConfigured()) {
  try {
    await ensureDbReady();
  } catch (err) {
    console.error("[db] ensureDbReady failed:", err.message);
  }
}

app.listen(PORT, HOST, () => {
  console.log(
    `charity-fund listening on ${HOST}:${PORT} (db: ${
      isDbConfigured() ? "configured" : "NOT configured"
    }, telegram: ${
      TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID ? "configured" : "NOT configured"
    })`
  );
  if (isDbConfigured()) {
    checkDb().then((ok) => {
      console.log(`[db] startup check: ${ok ? "connected" : "unreachable"}`);
    });
  }
});
