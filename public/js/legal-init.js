import { loadLegalPage } from "./cms-render.js";

const contentEl = document.getElementById("legal-content");
const slug = contentEl?.dataset.cmsSlug;
if (slug) {
  loadLegalPage(slug);
}
