# Python Script Scheduler

Веб-приложение для управления, планирования и мониторинга Python-скриптов.

**Стек:** FastAPI · Celery · Oracle DB · Redis · React 18 · TypeScript · Tailwind CSS

---

## Требования

- [Docker](https://docs.docker.com/get-docker/) 24+
- [Docker Compose](https://docs.docker.com/compose/) v2 (`docker compose` без дефиса)
- [Node.js](https://nodejs.org/) 20+ и npm (для сборки фронтенда)

---

## Установка и запуск

### 1. Сборка фронтенда

```bash
cd frontend
npm install
npm run build
cd ..
```

Команда создаёт `frontend/dist/` — статические файлы, которые Nginx раздаёт как SPA.

### 2. Запуск всех сервисов

```bash
docker compose up --build -d
```

Поднимаются 6 контейнеров: `oracle-db`, `redis`, `backend`, `celery-worker`, `celery-beat`, `nginx`.

### 3. Ожидание инициализации Oracle

> **При первом запуске Oracle Free занимает ~3–5 минут** для инициализации базы данных.

Следить за прогрессом:

```bash
# Ждём строку "DATABASE IS READY TO USE"
docker compose logs -f oracle-db
```

```bash
# Ждём строку "Application startup complete"
docker compose logs -f backend
```

После старта backend автоматически выполняет Alembic-миграции и создаёт все таблицы.

---

## Точки доступа

| Сервис | URL |
|---|---|
| UI (основной интерфейс) | http://localhost |
| Backend API напрямую | http://localhost:8000 |
| Swagger UI (интерактивное API) | http://localhost:8000/api/docs |
| Health check | http://localhost:8000/api/health |

---

## Тестирование через Swagger UI

Открыть **http://localhost:8000/api/docs**

**1. Проверить здоровье API:**
```
GET /api/health → {"status": "ok"}
```

**2. Проверить глобальные настройки:**
```
GET /api/settings → {"max_concurrent_workers": 2, ...}
```

**3. Создать тестовый скрипт:**
```
POST /api/scripts
{
  "name": "Hello World",
  "script_content": "import time\nfor i in range(5):\n    print(f'Step {i}')\n    time.sleep(1)\n",
  "priority": 3
}
```

**4. Запустить скрипт вручную:**
```
POST /api/scripts/{id}/run
→ {"run_id": 1, "task_id": "..."}
```

**5. Посмотреть статус выполнения:**
```
GET /api/runs/active
GET /api/runs/{run_id}
```

**6. Получить логи:**
```
GET /api/runs/{run_id}/logs
```

---

## Тестирование через UI

1. Открыть **http://localhost**
2. **Dashboard** — stat cards, активные задачи, история запусков
3. **Scripts → New Script** — создать скрипт, нажать "Run Now"
4. **Run Detail** — наблюдать live-логи в терминале в реальном времени (SSE)
5. **Settings** — изменить max concurrent workers, timeout, лимиты CPU/RAM

---

## Управление

```bash
# Статус контейнеров
docker compose ps

# Логи конкретного сервиса
docker compose logs -f backend
docker compose logs -f celery-worker
docker compose logs -f oracle-db

# Остановить все сервисы (данные сохраняются)
docker compose stop

# Остановить и удалить контейнеры
docker compose down

# Полный сброс (удалить контейнеры + данные Oracle)
docker compose down -v
```

---

## Разработка фронтенда (hot-reload)

Для разработки с автоматической перезагрузкой:

```bash
cd frontend
npm run dev
```

Фронтенд будет доступен на http://localhost:5173 и будет проксировать API-запросы на `http://localhost:8000`.

Backend при этом должен быть запущен отдельно (или через docker compose).

---

## Решение типичных проблем

| Проблема | Решение |
|---|---|
| Nginx отдаёт 404 на `/` | Выполнить `npm install && npm run build` в папке `frontend/` |
| Backend не стартует, ошибка подключения к Oracle | Oracle ещё инициализируется — подождать и проверить `docker compose logs oracle-db` |
| Celery worker не обрабатывает задачи | `docker compose logs celery-worker` — проверить подключение к Redis |
| `docker compose` не найдена | Убедиться что установлен Docker Compose v2 (команда без дефиса) |
| Порт 80 или 1521 занят | Изменить маппинг портов в `docker-compose.yml` |

---

## Архитектура

```
nginx:80          ← статический SPA + reverse proxy
  └─ backend:8000 ← FastAPI (REST API + SSE)
       └─ oracle-db:1521  ← Oracle Free 23c (хранение данных)
       └─ redis:6379       ← брокер задач Celery
  celery-worker   ← выполняет Python-скрипты
  celery-beat     ← триггеры по cron-расписанию
```
