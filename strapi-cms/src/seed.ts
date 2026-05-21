import type { Core } from "@strapi/strapi";
import {
  HOMEPAGE_SEED,
  LEGAL_PAGES_SEED,
  SITE_SETTING_SEED,
} from "./seed-data";

async function seedHomepage(strapi: Core.Strapi) {
  const uid = "api::homepage.homepage" as const;
  const existing = await strapi.documents(uid).findFirst();
  if (existing) {
    strapi.log.info("[seed] Homepage already exists — skip");
    return;
  }

  await strapi.documents(uid).create({
    data: HOMEPAGE_SEED,
    status: "published",
  });
  strapi.log.info("[seed] Homepage created and published");
}

async function seedSiteSettings(strapi: Core.Strapi) {
  const uid = "api::site-setting.site-setting" as const;
  const existing = await strapi.documents(uid).findFirst();
  if (existing) {
    strapi.log.info("[seed] Site settings already exist — skip");
    return;
  }

  await strapi.documents(uid).create({
    data: SITE_SETTING_SEED,
  });
  strapi.log.info("[seed] Site settings created");
}

async function seedLegalPages(strapi: Core.Strapi) {
  const uid = "api::legal-page.legal-page" as const;

  for (const page of LEGAL_PAGES_SEED) {
    const existing = await strapi.documents(uid).findFirst({
      filters: { slug: page.slug },
    });
    if (existing) {
      strapi.log.info(`[seed] Legal page "${page.slug}" already exists — skip`);
      continue;
    }

    await strapi.documents(uid).create({
      data: page,
      status: "published",
    });
    strapi.log.info(`[seed] Legal page "${page.slug}" created and published`);
  }
}

export async function seedContent(strapi: Core.Strapi) {
  try {
    await seedHomepage(strapi);
    await seedSiteSettings(strapi);
    await seedLegalPages(strapi);
    strapi.log.info("[seed] Content seed complete");
  } catch (error) {
    strapi.log.warn("[seed] Content seed failed:", error);
  }
}
