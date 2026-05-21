import type { Core } from "@strapi/strapi";
import { seedContent } from "./seed";

const PUBLIC_ACTIONS = [
  "api::homepage.homepage.find",
  "api::site-setting.site-setting.find",
  "api::legal-page.legal-page.find",
  "api::legal-page.legal-page.findOne",
];

async function enablePublicPermissions(strapi: Core.Strapi) {
  const publicRole = await strapi.db
    .query("plugin::users-permissions.role")
    .findOne({ where: { type: "public" } });

  if (!publicRole) {
    strapi.log.warn("[bootstrap] Public role not found — skip permissions");
    return;
  }

  for (const action of PUBLIC_ACTIONS) {
    const existing = await strapi.db
      .query("plugin::users-permissions.permission")
      .findOne({ where: { action, role: publicRole.id } });

    if (!existing) {
      await strapi.db.query("plugin::users-permissions.permission").create({
        data: { action, role: publicRole.id, enabled: true },
      });
      strapi.log.info(`[bootstrap] Public permission enabled: ${action}`);
    }
  }
}

export async function bootstrap({ strapi }: { strapi: Core.Strapi }) {
  try {
    await enablePublicPermissions(strapi);
    await seedContent(strapi);
  } catch (error) {
    strapi.log.warn("[bootstrap] Failed:", error);
  }
}
