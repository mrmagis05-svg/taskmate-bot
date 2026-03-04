# TaskMate Bot

Telegram Mini App для управления задачами сотрудников малого бизнеса.

## Функциональность

- **Роли**: Администратор, Менеджер, Сотрудник.
- **Задачи**: Создание, назначение (мультивыбор), статусы, комментарии.
- **Повторяющиеся задачи**: Поддержка правил повтора (ежедневно, еженедельно и т.д.).
- **Статистика**: Отчеты по выполнению задач.
- **Telegram Bot**: Уведомления и регистрация через `/start`.

## Установка и запуск

1. **Установка зависимостей**:
   ```bash
   npm install
   ```

2. **Запуск в режиме разработки**:
   ```bash
   npm run dev
   ```
   Сервер запустится на порту 3000. База данных SQLite (`tasks.db`) будет создана автоматически.

3. **Сборка для продакшена**:
   ```bash
   npm run build
   npm start
   ```

## Переменные окружения

Создайте файл `.env`:

```env
GEMINI_API_KEY="your_key"
APP_URL="your_app_url"
# BOT_TOKEN="your_telegram_bot_token" # Для реальной работы с Telegram API
```

## API Endpoints

- `GET /api/users` - Список пользователей
- `GET /api/tasks` - Список задач (фильтры: user_id, role)
- `POST /api/tasks` - Создание задачи
- `POST /webhook/telegram` - Вебхук для Telegram Bot API

## Развертывание на Cloudflare Workers

1. **Установка зависимостей**:
   ```bash
   npm install
   ```

2. **Настройка D1**:
   Создайте базу данных D1:
   ```bash
   npx wrangler d1 create taskmate-db
   ```
   Обновите `database_id` в `wrangler.json`.

3. **Применение миграций**:
   ```bash
   npx wrangler d1 execute taskmate-db --file=./schema.sql
   ```

4. **Локальная разработка**:
   ```bash
   npm run worker:dev
   ```
   Worker будет доступен на `http://localhost:8787`.
   Frontend (`npm run dev`) нужно настроить на проксирование к этому порту или изменить API URL.

5. **Деплой**:
   ```bash
   npm run worker:deploy
   ```

## Переменные окружения

Для Workers переменные задаются через `wrangler secret put`:
```bash
npx wrangler secret put BOT_TOKEN
```

## API Endpoints

Worker обрабатывает:
- `POST /webhook/telegram`
- `/api/*`
- Cron triggers (автоматически)

