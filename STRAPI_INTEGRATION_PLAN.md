# План интеграции Strapi v5 CMS

> Проект: **Живая школа «Клевер»** — charity-fund landing  
> Дата: 21 мая 2026

## Анализ проекта

### Стек

| Слой | Технология |
|------|------------|
| Backend | Node.js 20+, Express 4, PostgreSQL (`pg`) |
| Frontend | Vanilla HTML/CSS/JS — без Vite, React, Next.js |
| Dev-сервер | `npm run dev` → порт **3000** |
| Деплой | Railway (`charity.up.railway.app`) |
| HTTP | Нативный `fetch` |

**Особенность:** переменные `VITE_*` / `NEXT_PUBLIC_*` не подходят — браузер не видит `.env`.  
Используем **Express-прокси** `/api/cms/*` и endpoint `/api/config.js`.

```env
# .env (сервер Express)
STRAPI_URL=http://localhost:1337
STRAPI_API_TOKEN=
PORT=3000
```

### Статический контент → Strapi

| Блок | Файл | Content Type |
|------|------|--------------|
| Hero, секции, footer | `public/index.html` | Single: `homepage` |
| Email, реквизиты, presets | `public/contacts.html`, форма | Single: `site-settings` |
| Оферта, политика, отмена подписки | `public/*.html` | Collection: `legal-pages` |
| Слоты (fallback) | `public/script.js` | Collection: `support-slots` (фаза 2) |

### НЕ переносить в Strapi

- `POST /api/apply` — заявки → PostgreSQL + Telegram
- `funded` прогресс слотов — считается из PostgreSQL

---

## Критические моменты Strapi v5

### 1. Формат данных (БЕЗ attributes)

```javascript
// V5:
{ data: { id: 1, documentId: "abc", title: "...", createdAt: "..." } }

// V4 (НЕ использовать):
{ data: { id: 1, attributes: { title: "..." } } }

const { id, documentId, createdAt, updatedAt, publishedAt, locale, localizations, ...contentFields } = item;
return { id, ...contentFields };
```

### 2. API Endpoints

- Множественное число: `/articles`, `/legal-pages`
- С дефисами: `/menu-items`
- Всегда: `?populate=*`
- Collection Type **всегда** возвращает массив

### 3. Массивы vs объекты

```javascript
const items = response.data.data; // массив
const transformed = items.map(transformItem);
const firstItem = response.data.data[0]; // Single Type тоже массив в некоторых ответах
```

### 4. Изображения

```javascript
function getStrapiMedia(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${STRAPI_URL}${url}`;
}
```

### 5. Обработка undefined

```javascript
title: item.title || 'Untitled'
description: item.description || 'No description'
if (!content) return defaultIcon;
```

### 6. CORS (Strapi config/middlewares.ts)

```typescript
{
  name: 'strapi::cors',
  config: {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://charity.up.railway.app'],
    credentials: true,
    headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
  },
}
```

### 7. Логирование

```javascript
console.log('🔄 Fetching from:', url);
console.log('✅ Raw response:', response.data);
console.log('📦 Before transform:', item);
console.log('✅ After transform:', result);
console.error('❌ Error:', error.response?.status, error.response?.data);
```

---

## Этап 1: Frontend Setup

- [x] Переменные в `.env.example`
- [x] `public/js/strapi-utils.js` — transformItem, getStrapiMedia
- [x] `public/js/strapi-api.js` — fetchHomepage, fetchSiteSettings, fetchLegalPage
- [x] `public/js/cms-render.js` — renderHomepage, renderLegalPage
- [x] `server/strapi-proxy.js` — прокси `/api/cms/*`
- [x] Подключение прокси в `server.js`
- [x] Endpoint `/api/config.js`

**Проверка:**

```bash
curl -s http://localhost:3000/api/config.js
curl -s http://localhost:3000/api/cms/homepage?populate=*  # после запуска Strapi
```

---

## Этап 2: Strapi Backend

- [x] Проект `strapi-cms/` (ручной scaffold — npx недоступен в CI)
- [x] CORS с портом 3000
- [x] Content Types: homepage, site-setting, legal-page
- [x] Component: shared.step-item
- [x] Bootstrap: Public permissions
- [x] README с инструкциями

**Проверка:**

```bash
curl -s "http://localhost:1337/api/homepage?populate=*"
# Формат v5 без attributes
```

---

## Этап 3: Admin Setup (ручные шаги)

- [x] Инструкция [`strapi-cms/ADMIN_SETUP.md`](strapi-cms/ADMIN_SETUP.md)
- [x] Автоматический seed: homepage, site-setting, 4 legal-pages
- [x] Public permissions (bootstrap)
- [x] Контент из HTML (`src/seed-data.ts`)

**Проверка:**

```bash
curl -s "http://localhost:1337/api/legal-pages?filters[slug][\$eq]=offer&populate=*"
# status 200, не 403
```

---

## Этап 4: Интеграция

- [x] `data-cms-field` атрибуты в `index.html`
- [x] `cms-init.js` — homepage + site-settings
- [x] `legal-init.js` — 4 legal-pages
- [x] `LEGAL_VERSION` из Strapi (`getLegalVersion()`)
- [x] Amount presets из site-settings
- [x] Fallback на статический HTML
- [x] Loading states в CSS

---

## Этап 5: Проверка

- [x] Скрипт [`scripts/verify-cms.sh`](scripts/verify-cms.sh)
- [x] Документ [`STRAPI_VERIFICATION.md`](STRAPI_VERIFICATION.md)
- [x] Unit-проверка transform v5 (strapi-utils.js)

### Чеклист

- [x] JSON без `attributes` — transformItem реализован
- [x] Endpoints: `/legal-pages`, `/homepage`, `/site-setting`
- [x] `?populate=*` на всех CMS-запросах
- [x] Collection → массив, Single → объект
- [x] CORS / прокси `/api/cms/*`
- [x] Fallback при недоступности CMS
- [x] Заявки и слоты — PostgreSQL (не затронуты)

---

## Content Types (схема)

### Single: `homepage`

badgeText, heroScript, heroTitle, heroLead, heroCtaPrimary, heroCtaSecondary, howEyebrow, howTitle, howText, steps[] (number, title, description), slotsEyebrow, slotsTitle, slotsText, supportEyebrow, supportTitle, supportText, frequencyNote, footerScript, footerText, metaTitle, metaDescription

### Single: `site-settings`

supportEmail, legalEntityName, inn, ogrn, address, bankName, bik, corrAccount, accountNumber, amountPresets[], legalVersion

### Collection: `legal-pages`

slug (offer/privacy/subscription-cancel/contacts), title, versionDate, metaDescription, content (Rich Text)

### Collection: `support-slots` (фаза 2, опционально)

slug, title, description, goalAmount, initialFundedAmount, isActive, image
