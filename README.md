# Живая школа «Клевер» — фонд помощи школе

> **Живой сайт:** [charity.up.railway.app](https://charity.up.railway.app)

Лендинг благотворительного фонда «Живая школа Клевер» с системой **слотов поддержки**: участник выбирает конкретный слот (нужду школы), получает счёт на email, оплачивает его полностью или частично, а по мере реализации получает фотоотчёт и отчёт о проделанной работе. Стилистика — гуманная педагогика: акварельный логотип-клевер, тёплая палитра, рукописные акценты.

## Концепция

- **Слот** — конкретная цель помощи с фиксированной суммой (например, «Деревья — 150 000 ₽», «Театральный занавес — 20 000 ₽»).
- **Прозрачность** — для каждого слота видно цель, собранную сумму и остаток.
- **Гибкость взноса** — полностью или частично, разово или ежемесячно.
- **Подтверждение** — фотоотчёт и отчёт о реализации по мере исполнения слота.

## Стек

- **Backend** — Node.js 20 + Express, PostgreSQL (`pg`), единый контейнер.
- **Frontend** — Vanilla HTML/CSS/JS, без сборки и фреймворков.
- **CSS3** — design tokens, `:has()`, `clamp()`, `IntersectionObserver`-driven reveal.
- **Шрифты** — **Inter** (UI) и **Cormorant Garamond** (display) из Google Fonts.

## Структура

```
.
├── public/                 # Статика
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── migrations/
│   └── 001_init.sql        # Схема БД
├── scripts/
│   ├── migrate.js          # Применение миграций
│   └── seed-slots.js       # Наполнение слотов
├── db.js                   # Пул PostgreSQL
├── server.js               # Express API + статика
├── package.json
├── Dockerfile
├── .env.example
└── README.md
```

## PostgreSQL на Railway

1. В проекте Railway нажмите **+ New** → **Database** → **PostgreSQL**.
2. Откройте сервис PostgreSQL → вкладка **Variables** или **Connect** — скопируйте `DATABASE_URL` (или соберите из `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT`).
3. Откройте сервис приложения (Node) → **Variables** → добавьте:
   - `DATABASE_URL` — вставьте URL из шага 2 (можно через **Add Reference** к PostgreSQL-сервису).
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — по желанию, для уведомлений координатору.
4. Задеплойте приложение. **Миграции и слоты создаются автоматически** при старте контейнера (`migrate` → `seed:slots` → `server`). Если таблиц нет — первый запрос к `/healthz` или API тоже запустит инициализацию.

Проверка после деплоя:

```bash
curl -s https://charity.up.railway.app/healthz
# {"ok":true,"db":"ok","schema":"ready:14","telegram":"configured"}
```

Ручной запуск (локально или через Railway CLI) — если нужно пересоздать схему:

```bash
npm install
npm run migrate
npm run seed:slots
npm run db:status   # проверить таблицы и последние заявки
```

Через Railway CLI:

```bash
railway link
railway run npm run db:status
```

### Переменные окружения

| Переменная | Обязательна | Описание |
|---|---|---|
| `PORT` | нет | Порт сервера (Railway подставляет сам) |
| `DATABASE_URL` | **да** | Строка подключения PostgreSQL |
| `TELEGRAM_BOT_TOKEN` | нет | Токен бота [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | нет | ID чата для уведомлений о заявках |
| `PGSSLMODE` | нет | `disable` — отключить SSL (только локально) |

Скопируйте `.env.example` в `.env` для локальной разработки:

```bash
cp .env.example .env
# отредактируйте DATABASE_URL
```

## Запуск локально

```bash
npm install
npm run migrate      # создать таблицы
npm run seed:slots   # загрузить 14 слотов
npm start
# открыть http://localhost:3000
```

С Telegram-уведомлениями:

```bash
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=yyy npm start
```

Локальный PostgreSQL (Docker):

```bash
docker run --name charity-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=charity -p 5432:5432 -d postgres:16-alpine
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/charity
npm run migrate && npm run seed:slots && npm start
```

## API

### `GET /api/slots`

Активные слоты с прогрессом. `funded` = `initial_funded_amount` + сумма заявок в статусах `created`, `pending_payment`, `paid`.

```bash
curl -s http://localhost:3000/api/slots | jq
```

### `POST /api/apply`

Сохраняет заявку и согласия в PostgreSQL, затем шлёт уведомление в Telegram (если настроен).

Ответ при успехе:

```json
{
  "ok": true,
  "applicationId": "uuid",
  "status": "created",
  "forwarded": true
}
```

### `GET /api/applications/:id`

Публичный статус заявки (без IP, user-agent и деталей согласий):

```bash
curl -s http://localhost:3000/api/applications/<uuid> | jq
```

### `GET /healthz`

```bash
curl -s http://localhost:3000/healthz
# {"ok":true,"db":"ok","schema":"ready:14","telegram":"configured"}
```

## Приём заявок

Форма «Помочь фонду» отправляет `POST /api/apply` с полями: `slot`, `slotTitle`, `participantName`, `email`, `phone`, `amount`, `frequency`, флаги согласий и версии документов.

Сервер валидирует данные, сохраняет строки в `applications` и `consents`, ограничивает rate-limit (10 заявок/мин с IP) и **уведомляет координатора в Telegram**. Telegram — только уведомление; источник правды — PostgreSQL.

### Как настроить Telegram (5 минут)

1. [@BotFather](https://t.me/BotFather) → `/newbot` → получить **TOKEN**.
2. Открыть бота → **Start**.
3. `https://api.telegram.org/bot<TOKEN>/getUpdates` → найти `"chat":{"id":...}`.
4. В Railway → Variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

Без Telegram заявки всё равно сохраняются в БД; `forwarded: false`.

## Проверка записи в БД

После отправки формы скопируйте `applicationId` из ответа API или из Telegram.

**HTTP:**

```bash
curl -s "https://charity.up.railway.app/api/applications/<applicationId>"
```

**Статус всей БД (локально или `railway run`):**

```bash
npm run db:status
```

**SQL в psql** (DATABASE_URL из Railway → PostgreSQL → Connect):

```sql
-- последние заявки
SELECT id, slot_title, email, amount, status, created_at
FROM applications ORDER BY created_at DESC LIMIT 10;

-- согласия к заявке
SELECT application_id, offer_accepted, privacy_accepted,
       offer_version, consent_server_timestamp, user_ip
FROM consents
WHERE application_id = '<uuid>';

-- прогресс слота
SELECT id, title, goal_amount, initial_funded_amount FROM support_slots;
```

## Деплой

Прод: **Railway** → [charity.up.railway.app](https://charity.up.railway.app). Push в `main` пересобирает контейнер.

```bash
docker build -t charity-fund .
docker run --rm -e DATABASE_URL=... -e PORT=3000 -p 3000:3000 charity-fund
```

## Что уже работает

- PostgreSQL: слоты, заявки, согласия, заготовка таблицы `payments`.
- `GET /api/slots` — прогресс слотов из БД.
- `POST /api/apply` — транзакционное сохранение + Telegram.
- `GET /api/applications/:id` — статус заявки.
- `GET /healthz` — проверка БД.
- Frontend загружает слоты из API с fallback на локальный массив.

## Что пока НЕ работает

- **Реальные платежи** — счёт высылает координатор вручную.
- **Админка** — нет UI для статусов и экспорта.
- **Фотоотчёты** — вручную из CRM фонда.

## Roadmap

- [x] Бэкенд: приём заявок (Express + Telegram)
- [x] Персистентное хранилище (PostgreSQL на Railway)
- [ ] Платёжный шлюз (ЮKassa / CloudPayments) + webhooks
- [ ] После оплаты считать прогресс слота только по `status = paid`
- [ ] Админка: заявки, статусы, экспорт CSV
- [ ] Автоматические фотоотчёты и отчёты о реализации

## Лицензия

MIT — используйте свободно для добрых дел.
