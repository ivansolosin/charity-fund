/** Strapi v5 helpers — flat response format (no attributes). */

export function getStrapiUrl() {
  return window.__STRAPI_URL__ || "";
}

export function getStrapiMedia(url) {
  if (!url) return "";
  if (typeof url === "object" && url !== null) {
    const mediaUrl = url.url || url.data?.url;
    return getStrapiMedia(mediaUrl);
  }
  if (String(url).startsWith("http")) return String(url);
  const base = getStrapiUrl();
  return base ? `${base}${url}` : String(url);
}

/** Strip Strapi system fields; return flat content object. */
export function transformItem(item) {
  if (!item) return null;

  console.log("📦 Before transform:", item);

  const {
    id,
    documentId,
    createdAt,
    updatedAt,
    publishedAt,
    locale,
    localizations,
    ...contentFields
  } = item;

  const result = { id, documentId, ...contentFields };
  console.log("✅ After transform:", result);
  return result;
}

export function transformCollection(response) {
  console.log("✅ Raw response:", response);
  const items = response?.data;
  if (!Array.isArray(items)) {
    console.warn("⚠️ Expected array in response.data, got:", items);
    return [];
  }
  return items.map(transformItem);
}

export function transformSingle(response) {
  console.log("✅ Raw response:", response);
  const item = response?.data;
  if (Array.isArray(item)) {
    if (item.length === 0) {
      console.warn("⚠️ Empty array in single response");
      return null;
    }
    return transformItem(item[0]);
  }
  if (item && typeof item === "object") {
    return transformItem(item);
  }
  console.warn("⚠️ No data in single response");
  return null;
}

export function safeText(value, fallback = "") {
  if (value == null || value === "") return fallback;
  return String(value);
}
