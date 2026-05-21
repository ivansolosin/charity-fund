import { transformCollection, transformSingle } from "./strapi-utils.js";

const CMS_BASE = "/api/cms";

async function cmsGet(endpoint) {
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${CMS_BASE}${endpoint}${separator}populate=*`;
  console.log("🔄 Fetching from:", url);

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("❌ Error:", response.status, text);
      throw new Error(`CMS ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

export async function fetchHomepage() {
  const data = await cmsGet("/homepage");
  return transformSingle(data);
}

export async function fetchSiteSettings() {
  const data = await cmsGet("/site-setting");
  return transformSingle(data);
}

export async function fetchLegalPage(slug) {
  if (!slug) return null;
  const data = await cmsGet(
    `/legal-pages?filters[slug][$eq]=${encodeURIComponent(slug)}`
  );
  const items = transformCollection(data);
  return items[0] || null;
}

export async function fetchSupportSlots() {
  const data = await cmsGet("/support-slots");
  return transformCollection(data);
}
