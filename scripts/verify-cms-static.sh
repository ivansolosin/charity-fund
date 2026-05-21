#!/usr/bin/env bash
# Статическая проверка интеграции Strapi (без запущенных серверов)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pass=0
fail=0

ok()  { echo "  ✅ $1"; pass=$((pass + 1)); }
bad() { echo "  ❌ $1"; fail=$((fail + 1)); }

check_file() {
  if [ -f "$ROOT/$1" ]; then ok "файл $1"; else bad "нет файла $1"; fi
}

echo ""
echo "═══════════════════════════════════════════"
echo "  Strapi CMS — статическая проверка"
echo "═══════════════════════════════════════════"
echo ""

echo "── Frontend CMS-модули ──"
for f in \
  public/js/strapi-utils.js \
  public/js/strapi-api.js \
  public/js/cms-render.js \
  public/js/cms-init.js \
  public/js/legal-init.js; do
  check_file "$f"
done

echo ""
echo "── Backend ──"
check_file server/strapi-proxy.js
grep -q "mountStrapiProxy" "$ROOT/server.js" && ok "server.js → mountStrapiProxy" || bad "server.js не подключает прокси"
grep -q "STRAPI_URL" "$ROOT/.env.example" && ok ".env.example → STRAPI_URL" || bad ".env.example без STRAPI_URL"

echo ""
echo "── index.html CMS-разметка ──"
grep -q 'data-cms="homepage"' "$ROOT/public/index.html" && ok 'data-cms="homepage"' || bad 'нет data-cms="homepage"'
grep -q 'data-cms-field="badge"' "$ROOT/public/index.html" && ok "data-cms-field на hero/footer" || bad "нет data-cms-field"
grep -q 'cms-init.js' "$ROOT/public/index.html" && ok "cms-init.js подключён" || bad "cms-init.js не подключён"

echo ""
echo "── Legal pages ──"
for slug in offer privacy subscription-cancel contacts; do
  file="public/${slug}.html"
  if [ "$slug" = "contacts" ]; then file="public/contacts.html"; fi
  if [ "$slug" = "offer" ]; then file="public/offer.html"; fi
  if [ "$slug" = "privacy" ]; then file="public/privacy.html"; fi
  if [ "$slug" = "subscription-cancel" ]; then file="public/subscription-cancel.html"; fi
  if grep -q "data-cms-slug=\"$slug\"" "$ROOT/$file" 2>/dev/null; then
    ok "$slug.html → data-cms-slug"
  else
    bad "$slug.html — нет data-cms-slug=\"$slug\""
  fi
  grep -q 'class="legal-body"' "$ROOT/$file" 2>/dev/null && ok "$slug.html → legal-body" || bad "$slug.html — нет legal-body"
done

echo ""
echo "── Strapi CMS проект ──"
check_file strapi-cms/package.json
check_file strapi-cms/config/middlewares.ts
check_file strapi-cms/src/bootstrap.ts
check_file strapi-cms/src/seed-data.ts
check_file strapi-cms/src/api/homepage/content-types/homepage/schema.json
check_file strapi-cms/src/api/site-setting/content-types/site-setting/schema.json
check_file strapi-cms/src/api/legal-page/content-types/legal-page/schema.json

echo ""
echo "── API endpoints (frontend) ──"
grep -q '"/homepage"' "$ROOT/public/js/strapi-api.js" && ok "endpoint /homepage" || bad "нет /homepage"
grep -q '"/site-setting"' "$ROOT/public/js/strapi-api.js" && ok "endpoint /site-setting" || bad "нет /site-setting"
grep -q 'legal-pages' "$ROOT/public/js/strapi-api.js" && ok "endpoint /legal-pages" || bad "нет /legal-pages"
grep -q 'populate=\*' "$ROOT/public/js/strapi-api.js" && ok "?populate=*" || bad "нет populate=*"

echo ""
echo "── Strapi v5 transform ──"
if node -e "
import { transformSingle, transformCollection } from '$ROOT/public/js/strapi-utils.js';
const s = transformSingle({ data: { id: 1, title: 'T', createdAt: 'x' } });
const c = transformCollection({ data: [{ id: 1 }] });
if (!s || s.title !== 'T' || s.createdAt) process.exit(1);
if (c.length !== 1) process.exit(1);
" 2>/dev/null; then
  ok "transform v5 (без attributes)"
else
  bad "transform v5 — ошибка"
fi

echo ""
echo "── Синтаксис JS ──"
for f in server.js server/strapi-proxy.js public/script.js; do
  if node --check "$ROOT/$f" 2>/dev/null; then ok "syntax $f"; else bad "syntax $f"; fi
done

echo ""
echo "── Зависимости ──"
if [ -d "$ROOT/node_modules/express" ]; then
  ok "node_modules (Express) установлены"
else
  echo "  ⚠️  node_modules не установлены — выполните: npm install"
fi
if [ -d "$ROOT/strapi-cms/node_modules/@strapi/strapi" ]; then
  ok "strapi-cms/node_modules установлены"
else
  echo "  ⚠️  strapi-cms/node_modules не установлены — выполните: cd strapi-cms && npm install"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  Итог: ✅ $pass  ❌ $fail"
echo "═══════════════════════════════════════════"
echo ""

[ "$fail" -eq 0 ]
