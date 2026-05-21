/**
 * Strapi v5 proxy — forwards /api/cms/* to STRAPI_URL/api/*
 * Avoids CORS and keeps STRAPI_URL server-side only.
 */

export function mountStrapiProxy(app) {
  const STRAPI_URL = (process.env.STRAPI_URL || "").replace(/\/$/, "");

  app.get("/api/config.js", (_req, res) => {
    res
      .type("application/javascript")
      .set("Cache-Control", "public, max-age=60")
      .send(`window.__STRAPI_URL__ = ${JSON.stringify(STRAPI_URL)};`);
  });

  if (!STRAPI_URL) {
    console.warn("[cms] STRAPI_URL not set — /api/cms/* proxy disabled");
    return;
  }

  app.get(/^\/api\/cms(?:\/(.*))?$/, async (req, res) => {
    const subPath = req.params[0] || "";
    const query = new URLSearchParams(req.query).toString();
    const targetPath = `/api/${subPath}${query ? `?${query}` : ""}`;
    const url = `${STRAPI_URL}${targetPath}`;

    console.log("🔄 Proxy to Strapi:", url);

    try {
      const headers = { Accept: "application/json" };
      if (process.env.STRAPI_API_TOKEN) {
        headers.Authorization = `Bearer ${process.env.STRAPI_API_TOKEN}`;
      }

      const response = await fetch(url, { headers });
      const contentType = response.headers.get("content-type") || "";
      let body;

      if (contentType.includes("application/json")) {
        body = await response.json();
      } else {
        const text = await response.text();
        console.error("❌ Strapi non-JSON response:", response.status, text.slice(0, 200));
        return res.status(response.status).json({
          ok: false,
          error: "CMS returned non-JSON response",
        });
      }

      if (!response.ok) {
        console.error("❌ Strapi error:", response.status, body);
      }

      return res.status(response.status).json(body);
    } catch (err) {
      console.error("❌ Strapi proxy error:", err.message);
      return res.status(502).json({ ok: false, error: "CMS unavailable" });
    }
  });

  console.log(`[cms] Strapi proxy enabled → ${STRAPI_URL}`);
}
