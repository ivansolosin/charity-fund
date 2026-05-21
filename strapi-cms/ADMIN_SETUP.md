# Этап 3: Admin Setup — инструкция

## 1. Первый запуск

```bash
cd strapi-cms
cp .env.example .env
# Замените APP_KEYS, JWT_SECRET и другие секреты на случайные значения

npm install
npm run develop
```

Откройте [http://localhost:1337/admin](http://localhost:1337/admin) и создайте admin-аккаунт.

## 2. Автоматический seed

При первом запуске `src/seed.ts` автоматически создаёт:


| Content Type        | Что заполняется                               |
| ------------------- | --------------------------------------------- |
| **Homepage**        | Hero, секции, 3 шага, footer, meta            |
| **Site Setting**    | Email, реквизиты, presets сумм, legalVersion  |
| **Legal Pages × 4** | offer, privacy, subscription-cancel, contacts |


Проверьте логи Strapi:

```
[seed] Homepage created and published
[seed] Site settings created
[seed] Legal page "offer" created and published
...
```

## 3. Проверка в Content Manager

1. **Content Manager → Homepage** — все поля заполнены, статус **Published**
2. **Content Manager → Site Setting** — email, реквизиты, amountPresets
3. **Content Manager → Legal Pages** — 4 записи со slug:
  - `offer`
  - `privacy`
  - `subscription-cancel`
  - `contacts`

## 4. Public Permissions

Уже включены автоматически в `src/bootstrap.ts`:

- Homepage → find
- Site Setting → find
- Legal Pages → find, findOne

Ручная проверка: **Settings → Users & Permissions → Roles → Public** — все 4 action должны быть ✓.

## 5. Редактирование контента

### Homepage

- Измените badge, hero, тексты секций
- Steps — repeatable component (number, title, description)
- После изменений нажмите **Publish**

### Site Setting

- `legalVersion` — обновляйте при изменении оферты/политики
- `amountPresets` — JSON массив, например `[300, 500, 1000, 3000, 5000]`

### Legal Pages

- Поле `content` — HTML (отображается через innerHTML на сайте)
- Поле `slug` — не менять без обновления frontend
- После изменений — **Publish**

## 6. Проверка API

```bash
# Homepage — формат v5, без attributes
curl -s "http://localhost:1337/api/homepage?populate=*" | python3 -m json.tool | head -40

# Site settings
curl -s "http://localhost:1337/api/site-setting?populate=*" | python3 -m json.tool

# Legal page по slug
curl -s "http://localhost:1337/api/legal-pages?filters[slug][\$eq]=offer&populate=*" | python3 -m json.tool | head -30

# Должен быть status 200, не 403
curl -s -o /dev/null -w "%{http_code}" "http://localhost:1337/api/legal-pages?populate=*"
```

Ожидаемый формат v5:

```json
{
  "data": {
    "id": 1,
    "documentId": "abc123",
    "badgeText": "Гуманная педагогика · Прозрачная помощь",
    "heroTitle": "..."
  }
}
```

**Без** `"attributes": { ... }`!

## 7. Через Express-прокси

```bash
# В корне проекта, STRAPI_URL=http://localhost:1337 в .env
npm run dev

curl -s "http://localhost:3000/api/cms/homepage?populate=*" | python3 -m json.tool | head -20
curl -s "http://localhost:3000/api/cms/legal-pages?filters[slug][\$eq]=offer&populate=*"
```

## 8. Повторный seed

Seed пропускает записи, которые уже существуют. Чтобы пересоздать:

1. Удалите записи в Content Manager, или
2. Удалите `strapi-cms/.tmp/data.db` и перезапустите Strapi

## 9. Типичные проблемы


| Проблема                   | Решение                                              |
| -------------------------- | ---------------------------------------------------- |
| 403 Forbidden              | Перезапустите Strapi — bootstrap включит permissions |
| Пустой API                 | Нажмите Publish в Content Manager                    |
| Seed не сработал           | Проверьте логи `[seed]` при старте                   |
| Старый формат с attributes | Убедитесь что Strapi v5, не v4                       |


