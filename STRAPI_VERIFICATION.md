# Этап 5: Финальная проверка Strapi CMS

## Быстрая проверка (одна команда)

```bash
chmod +x scripts/verify-cms.sh
./scripts/verify-cms.sh
```

Требует запущенный Express (`npm run dev`). Strapi опционален — скрипт покажет ⚠️ если CMS недоступен.

---

## Полный чеклист

### Strapi v5 формат данных

- [ ] API возвращает JSON **без** `"attributes"`
- [ ] Поля на верхнем уровне: `{ "data": { "id": 1, "title": "..." } }`
- [ ] Collection Type: `{ "data": [ {...}, {...} ] }` — массив
- [ ] Single Type: `{ "data": { ... } }` — объект

```bash
curl -s "http://localhost:1337/api/homepage?populate=*" | grep -c attributes
# Должно быть 0
```

### Endpoints (множественное число)

| Правильно | Неправильно |
|-----------|-------------|
| `/api/legal-pages` | `/api/legal-page` |
| `/api/homepage` | — (single) |
| `/api/site-setting` | — (single, singularName) |

### Express-прокси

- [ ] `STRAPI_URL=http://localhost:1337` в `.env`
- [ ] `GET /api/config.js` → `window.__STRAPI_URL__ = "..."`
- [ ] `GET /api/cms/homepage?populate=*` → 200 (Strapi запущен)

```bash
curl -s http://localhost:3000/api/config.js
curl -s "http://localhost:3000/api/cms/homepage?populate=*" | head -c 300
```

### Frontend

- [ ] http://localhost:3000 — контент из CMS (консоль: `✅ Homepage CMS loaded`)
- [ ] http://localhost:3000/offer.html — legal page из CMS
- [ ] Strapi выключен → статический fallback, сайт работает
- [ ] Форма заявки работает (`POST /api/apply`)
- [ ] Слоты загружаются (`GET /api/slots` или FALLBACK_SLOTS)

### Admin

- [ ] Content Manager: Homepage **Published**
- [ ] Site Setting заполнен
- [ ] Legal Pages × 4 **Published**
- [ ] Public permissions: find / findOne включены

### Permissions

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:1337/api/homepage?populate=*"
# 200, не 403
```

---

## Команды проверки API

```bash
# Strapi напрямую
curl -s "http://localhost:1337/api/homepage?populate=*" | python3 -m json.tool | head -30
curl -s "http://localhost:1337/api/site-setting?populate=*" | python3 -m json.tool
curl -s "http://localhost:1337/api/legal-pages?filters[slug][\$eq]=offer&populate=*" | python3 -m json.tool | head -20

# Через Express-прокси
curl -s "http://localhost:3000/api/cms/homepage?populate=*" | python3 -m json.tool | head -30
curl -s "http://localhost:3000/api/cms/legal-pages?filters[slug][\$eq]=privacy&populate=*"

# PostgreSQL (не Strapi)
curl -s http://localhost:3000/api/slots | python3 -m json.tool | head -10
curl -s http://localhost:3000/healthz | python3 -m json.tool
```

---

## Типичные ошибки

| Симптом | Причина | Решение |
|---------|---------|---------|
| `Cannot read 'toLowerCase' of undefined` | поле CMS пустое | `item.title \|\| 'Untitled'` |
| 404 Not Found | единственное число в URL | `/legal-pages`, не `/legal-page` |
| CORS policy blocked | прямой fetch к :1337 | Используйте `/api/cms/*` |
| Данные есть, UI пустой | ищете `attributes.title` | v5: `item.title` напрямую |
| 403 Forbidden | нет Public permissions | Перезапустите Strapi (bootstrap) |
| 502 CMS unavailable | Strapi не запущен | `cd strapi-cms && npm run develop` |
| Пустой homepage | не опубликован | Content Manager → Publish |
| `.env` не работает в браузере | vanilla JS | `/api/config.js` + прокси |
| Слоты не грузятся | нет DATABASE_URL | Fallback в script.js, или настройте PG |

---

## Архитектура (итог)

```
Браузер
  ├── /api/cms/*     → Strapi (контент: hero, legal, settings)
  ├── /api/slots     → PostgreSQL (слоты + прогресс)
  └── /api/apply     → PostgreSQL + Telegram (заявки)
```

**Strapi управляет:** тексты, legal pages, email, реквизиты, presets, legalVersion  
**PostgreSQL управляет:** слоты, funded, заявки, согласия

---

## Production деплой

1. Задеплойте Strapi (Railway/Render) с PostgreSQL
2. В Express `.env`: `STRAPI_URL=https://your-strapi.example.com`
3. Добавьте production origin в `strapi-cms/config/middlewares.ts`
4. Заполните/опубликуйте контент в Strapi Admin

---

## Фаза 2 (опционально)

- `support-slots` в Strapi для управления title/goal через CMS
- Express merge: metadata из Strapi + funded из PostgreSQL
