import {
  fetchHomepage,
  fetchLegalPage,
  fetchSiteSettings,
} from "./strapi-api.js";
import { safeText } from "./strapi-utils.js";

function setText(selector, value, fallback) {
  const el = document.querySelector(selector);
  if (!el || value == null) return;
  el.textContent = safeText(value, fallback);
}

function setHtml(selector, value, fallback) {
  const el = document.querySelector(selector);
  if (!el || value == null) return;
  el.innerHTML = safeText(value, fallback);
}

export async function loadHomepage() {
  const container = document.querySelector('[data-cms="homepage"]');
  if (!container) return;

  container.classList.add("is-loading");

  try {
    const homepage = await fetchHomepage();
    if (!homepage) throw new Error("empty homepage");

    setText('[data-cms-field="badge"]', homepage.badgeText);
    setText('[data-cms-field="heroScript"]', homepage.heroScript);
    setHtml('[data-cms-field="heroTitle"]', homepage.heroTitle);
    setText('[data-cms-field="heroLead"]', homepage.heroLead);
    setText('[data-cms-field="heroCtaPrimary"]', homepage.heroCtaPrimary);
    setText('[data-cms-field="heroCtaSecondary"]', homepage.heroCtaSecondary);

    setText('[data-cms-field="howEyebrow"]', homepage.howEyebrow);
    setText('[data-cms-field="howTitle"]', homepage.howTitle);
    setText('[data-cms-field="howText"]', homepage.howText);

    setText('[data-cms-field="slotsEyebrow"]', homepage.slotsEyebrow);
    setText('[data-cms-field="slotsTitle"]', homepage.slotsTitle);
    setText('[data-cms-field="slotsText"]', homepage.slotsText);

    setText('[data-cms-field="supportEyebrow"]', homepage.supportEyebrow);
    setText('[data-cms-field="supportTitle"]', homepage.supportTitle);
    setText('[data-cms-field="supportText"]', homepage.supportText);
    setText('[data-cms-field="frequencyNote"]', homepage.frequencyNote);

    setText('[data-cms-field="footerScript"]', homepage.footerScript);
    setText('[data-cms-field="footerText"]', homepage.footerText);

    if (homepage.metaTitle) {
      document.title = homepage.metaTitle;
    }
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && homepage.metaDescription) {
      metaDesc.setAttribute("content", homepage.metaDescription);
    }

    const steps = Array.isArray(homepage.steps) ? homepage.steps : [];
    const stepsGrid = document.querySelector(".steps-grid");
    if (stepsGrid && steps.length > 0) {
      stepsGrid.innerHTML = steps
        .map((step, index) => {
          const num =
            step.number || String(index + 1).padStart(2, "0");
          const title = safeText(step.title, "Untitled");
          const description = safeText(step.description, "No description");
          return `
        <article class="step-card" data-reveal>
          <span class="step-num">${num}</span>
          <h3>${title}</h3>
          <p>${description}</p>
        </article>`;
        })
        .join("");
    }

    console.log("✅ Homepage CMS loaded");
  } catch (err) {
    console.error("❌ CMS homepage failed, using static HTML fallback:", err.message);
  } finally {
    container.classList.remove("is-loading");
  }
}

export async function loadLegalPage(slug) {
  const contentEl = document.getElementById("legal-content");
  if (!contentEl || !slug) return null;

  contentEl.classList.add("is-loading");

  try {
    const page = await fetchLegalPage(slug);
    if (!page) throw new Error("empty legal page");

    if (page.title) {
      document.title = `${page.title} — Живая школа «Клевер»`;
    }
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && page.metaDescription) {
      metaDesc.setAttribute("content", page.metaDescription);
    }

    const titleEl = contentEl.querySelector("h1");
    if (titleEl && page.title) {
      titleEl.textContent = page.title;
    }

    const versionEl = contentEl.querySelector(".legal-meta");
    if (versionEl && page.versionDate) {
      versionEl.textContent = page.versionDate;
    }

    const bodyEl = contentEl.querySelector(".legal-body");
    if (bodyEl && page.content) {
      bodyEl.innerHTML = page.content;
    }

    console.log("✅ Legal page CMS loaded:", slug);
    return page;
  } catch (err) {
    console.error(
      `❌ CMS legal page "${slug}" failed, using static HTML fallback:`,
      err.message
    );
    return null;
  } finally {
    contentEl.classList.remove("is-loading");
  }
}

export async function loadSiteSettings() {
  try {
    const settings = await fetchSiteSettings();
    if (!settings) return null;
    console.log("✅ Site settings CMS loaded");
    return settings;
  } catch (err) {
    console.error("❌ CMS site-settings failed:", err.message);
    return null;
  }
}

export function renderAmountPresets(presets) {
  const fieldset = document.querySelector(".amount-chips");
  if (!fieldset || !Array.isArray(presets) || presets.length === 0) return;

  const values = presets
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return;

  const rub = (value) => `${value.toLocaleString("ru-RU")} ₽`;
  const defaultValue = values.includes(500) ? 500 : values[0];

  const presetHtml = values
    .map(
      (value) => `
    <label class="chip">
      <input type="radio" name="amountPreset" value="${value}"${value === defaultValue ? " checked" : ""} />
      <span>${rub(value)}</span>
    </label>`
    )
    .join("");

  fieldset.innerHTML = `
    <legend class="visually-hidden">Сумма пожертвования</legend>
    ${presetHtml}
    <label class="chip chip-custom">
      <input type="radio" name="amountPreset" value="custom" />
      <span>Другая сумма ₽</span>
    </label>`;

  console.log("✅ Amount presets from CMS:", values);
}
