# Strapi v5 CMS — Живая школа «Клевер»

Headless CMS для управления контентом сайта фонда.

## Быстрый старт

```bash
cd strapi-cms
cp .env.example .env
# Отредактируйте APP_KEYS, JWT_SECRET и другие секреты в .env

npm install
npm run develop
```

Admin panel: http://localhost:1337/admin  
API: http://localhost:1337/api

## Content Types

| Тип | Endpoint | Описание |
|-----|----------|----------|
| Single: Homepage | `GET /api/homepage?populate=*` | Hero, секции, footer |
| Single: Site Setting | `GET /api/site-setting?populate=*` | Email, реквизиты, presets |
| Collection: Legal Pages | `GET /api/legal-pages?populate=*` | Оферта, политика, контакты |

## CORS

Разрешены origin:
- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `https://charity.up.railway.app`

## Public Permissions

При первом запуске `src/bootstrap.ts` автоматически включает `find` / `findOne` для Public роли и **заполняет контент** из `src/seed-data.ts`.

Подробнее: [ADMIN_SETUP.md](./ADMIN_SETUP.md)

## Проверка API

```bash
curl -s "http://localhost:1337/api/homepage?populate=*"
curl -s "http://localhost:1337/api/site-setting?populate=*"
curl -s "http://localhost:1337/api/legal-pages?populate=*"
```

Формат Strapi v5 — **без `attributes`**, поля на верхнем уровне объекта `data`.

## Первый запуск

1. `npm run develop`
2. Создайте admin-аккаунт в браузере
3. Заполните контент в Content Manager (см. Этап 3 в `STRAPI_INTEGRATION_PLAN.md`)
4. Опубликуйте записи (Publish) для типов с Draft & Publish

## Production

Для Railway используйте PostgreSQL:

```env
DATABASE_CLIENT=postgres
DATABASE_URL=postgres://...
```

Сгенерируйте секреты:

```bash
node -e "console.log(require('crypto').randomBytes(16).toString('base64'))"
```
