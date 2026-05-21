#!/usr/bin/env bash
# Проверка интеграции Strapi v5 CMS
# Запуск: ./scripts/verify-cms.sh
# Требует: Express на :3000, Strapi на :1337 (опционально)

set -euo pipefail

EXPRESS_URL="${EXPRESS_URL:-http://localhost:3000}"
STRAPI_URL="${STRAPI_URL:-http://localhost:1337}"

pass=0
fail=0
warn=0

ok()   { echo "  ✅ $1"; pass=$((pass + 1)); }
bad()  { echo "  ❌ $1"; fail=$((fail + 1)); }
info() { echo "  ⚠️  $1"; warn=$((warn + 1)); }

check_http() {
  local url="$1"
  local expect="$2"
  local label="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [ "$code" = "$expect" ]; then
    ok "$label (HTTP $code)"
  else
    bad "$label — ожидался HTTP $expect, получен $code"
  fi
}

check_no_attributes() {
  local url="$1"
  local label="$2"
  local body
  body=$(curl -s "$url" 2>/dev/null || echo "")
  if [ -z "$body" ]; then
    bad "$label — пустой ответ"
    return
  fi
  if echo "$body" | grep -q '"attributes"'; then
    bad "$label — найден attributes (формат v4, не v5!)"
  else
    ok "$label — без attributes (v5)"
  fi
}

echo ""
echo "═══════════════════════════════════════════"
echo "  Strapi CMS — проверка интеграции"
echo "═══════════════════════════════════════════"
echo ""
echo "Express: $EXPRESS_URL"
echo "Strapi:  $STRAPI_URL"
echo ""

echo "── Express ──"
check_http "$EXPRESS_URL/healthz" "200" "GET /healthz"
check_http "$EXPRESS_URL/api/config.js" "200" "GET /api/config.js"
check_http "$EXPRESS_URL/" "200" "GET / (index.html)"

CONFIG=$(curl -s "$EXPRESS_URL/api/config.js" 2>/dev/null || echo "")
if echo "$CONFIG" | grep -q "__STRAPI_URL__"; then
  ok "/api/config.js содержит __STRAPI_URL__"
else
  bad "/api/config.js — нет window.__STRAPI_URL__"
fi

echo ""
echo "── Express → Strapi proxy ──"
PROXY_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$EXPRESS_URL/api/cms/homepage?populate=*" 2>/dev/null || echo "000")
if [ "$PROXY_CODE" = "200" ]; then
  ok "GET /api/cms/homepage — прокси работает (200)"
  check_no_attributes "$EXPRESS_URL/api/cms/homepage?populate=*" "Homepage через прокси"
elif [ "$PROXY_CODE" = "502" ] || [ "$PROXY_CODE" = "404" ]; then
  info "GET /api/cms/homepage — HTTP $PROXY_CODE (Strapi не запущен или пустой CMS)"
else
  bad "GET /api/cms/homepage — HTTP $PROXY_CODE"
fi

echo ""
echo "── Strapi напрямую ──"
STRAPI_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$STRAPI_URL/api/homepage?populate=*" 2>/dev/null || echo "000")
if [ "$STRAPI_CODE" = "200" ]; then
  ok "GET /api/homepage — Strapi отвечает (200)"
  check_no_attributes "$STRAPI_URL/api/homepage?populate=*" "Homepage Strapi"
  check_http "$STRAPI_URL/api/site-setting?populate=*" "200" "GET /api/site-setting"
  check_http "$STRAPI_URL/api/legal-pages?populate=*" "200" "GET /api/legal-pages"
  check_http "$STRAPI_URL/api/legal-pages?filters[slug][\$eq]=offer&populate=*" "200" "GET /api/legal-pages?slug=offer"
elif [ "$STRAPI_CODE" = "403" ]; then
  bad "GET /api/homepage — 403 Forbidden (Public permissions не включены)"
elif [ "$STRAPI_CODE" = "000" ]; then
  info "Strapi недоступен на $STRAPI_URL — пропуск прямых проверок"
else
  info "GET /api/homepage — HTTP $STRAPI_CODE (возможно CMS не заполнен / не опубликован)"
fi

echo ""
echo "── Статические файлы CMS ──"
for f in js/strapi-utils.js js/strapi-api.js js/cms-render.js js/cms-init.js js/legal-init.js; do
  check_http "$EXPRESS_URL/$f" "200" "GET /$f"
done

echo ""
echo "── PostgreSQL API (не Strapi) ──"
SLOTS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$EXPRESS_URL/api/slots" 2>/dev/null || echo "000")
if [ "$SLOTS_CODE" = "200" ]; then
  ok "GET /api/slots — слоты из PostgreSQL (200)"
elif [ "$SLOTS_CODE" = "503" ]; then
  info "GET /api/slots — 503 (DATABASE_URL не настроен, fallback в script.js)"
else
  info "GET /api/slots — HTTP $SLOTS_CODE"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  Итог: ✅ $pass  ❌ $fail  ⚠️  $warn"
echo "═══════════════════════════════════════════"
echo ""

if [ "$fail" -gt 0 ]; then
  exit 1
fi
