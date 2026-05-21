import { loadHomepage, loadSiteSettings, renderAmountPresets } from "./cms-render.js";

async function initCms() {
  const [settings] = await Promise.all([loadSiteSettings(), loadHomepage()]);

  if (settings?.legalVersion) {
    window.__LEGAL_VERSION__ = settings.legalVersion;
    console.log("✅ Legal version from CMS:", settings.legalVersion);
  }

  if (settings?.amountPresets) {
    renderAmountPresets(settings.amountPresets);
  }
}

initCms();
