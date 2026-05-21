import type { Core } from "@strapi/strapi";
import { bootstrap } from "./bootstrap";

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},
  bootstrap,
};
