# Process Automation — Scheduler / Job Manager

Quick reference for Claude Code sessions on this project.

---

## Project Overview

A Python script scheduler with a React UI. Users create Python scripts, schedule them via cron, run them manually or via webhook, monitor logs in real time, and receive alerts on failure.

**Stack:** FastAPI + Celery + Oracle DB + React + Vite
**Docker services:** `backend`, `celery-worker`, `celery-beat`, `redis`, `frontend` (nginx, port **8090**)
**Docker logs:** capped at 20 MB × 5 files per service (configured in docker-compose.yml)

---

## Repo Structure

```
process_automation/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, router includes
│   │   ├── config.py            # Settings from env vars
│   │   ├── database.py          # Async SQLAlchemy engine + session
│   │   ├── celery_app.py        # Celery app + queue helpers
│   │   ├── beat_schedule.py     # Celery beat cron loader
│   │   ├── tasks.py             # execute_script Celery task
│   │   ├── models/
│   │   │   ├── script.py        # SH_SCRIPTS
│   │   │   ├── run.py           # SH_SCRIPT_RUNS
│   │   │   ├── log.py           # SH_RUN_LOGS
│   │   │   ├── settings.py      # SH_APP_SETTINGS
│   │   │   ├── alert.py         # SH_ALERT_CONFIGS
│   │   │   └── variable.py      # SH_GLOBAL_VARS
│   │   ├── schemas/
│   │   │   ├── script.py        # Pydantic schemas for scripts
│   │   │   ├── run.py           # Pydantic schemas for runs
│   │   │   ├── settings.py      # Pydantic schemas for settings
│   │   │   ├── alert.py         # Pydantic schemas for alerts
│   │   │   └── variable.py      # Pydantic schemas for global vars
│   │   ├── routers/
│   │   │   ├── scripts.py       # CRUD + run + webhook regen
│   │   │   ├── runs.py          # List/get runs, logs, SSE stream, cancel
│   │   │   ├── settings.py      # GET/PUT global app settings
│   │   │   ├── alerts.py        # Alert config CRUD
│   │   │   ├── variables.py     # Global variables CRUD
│   │   │   └── webhooks.py      # POST /api/webhooks/{token}
│   │   └── services/
│   │       └── alerts.py        # Email/Telegram send logic
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   │       ├── 001_initial_schema.py   # All base tables (idempotent)
│   │       ├── 002_features.py         # webhook_token, parameters_schema, SH_GLOBAL_VARS
│   │       └── 003_tags.py             # tag column on SH_SCRIPTS
│   ├── requirements.txt         # oracledb==2.3.0 (must be >=2.0)
│   └── Dockerfile
├── frontend/
│   ├── Dockerfile               # Multi-stage: node:20 build + nginx:1.25 serve
│   └── src/
│       ├── App.tsx              # Routes: / /scripts /scripts/:id /runs/:id /variables /settings
│       ├── context/
│       │   └── TimezoneContext.tsx  # Timezone from settings, formatDateTime helper
│       ├── api/
│       │   ├── client.ts        # Axios, baseURL=/api
│       │   ├── scripts.ts       # Scripts + alerts API
│       │   ├── runs.ts          # Runs API
│       │   ├── variables.ts     # Global variables API
│       │   └── settings.ts      # Settings API
│       ├── pages/
│       │   ├── Dashboard.tsx    # Stats + live running + recent runs
│       │   ├── Scripts.tsx      # Scripts list + create modal
│       │   ├── ScriptDetail.tsx # 6 tabs: Editor/Requirements/Settings/Parameters/Alerts/History
│       │   ├── RunDetail.tsx    # Logs viewer, back link → /scripts/:id?tab=history
│       │   ├── Variables.tsx    # Global variables CRUD table
│       │   └── Settings.tsx     # App-wide settings form
│       ├── utils/
│       │   ├── cronUtils.ts         # getNextCronRun(expr, tz): Date|null; describeCron(expr): string
│       │   └── dateUtils.ts         # parseUTC(s): Date — always parses timestamps as UTC
│       └── components/
│           ├── layout/Sidebar.tsx   # Nav: Dashboard, Scripts, Global Variables, Settings
│           ├── layout/Header.tsx    # Dynamic page title
│           ├── LogViewer.tsx        # Terminal log viewer + SSE streaming
│           ├── ScriptEditor.tsx     # Monaco editor wrapper
│           ├── CronInput.tsx        # Cron expression input + next run preview
│           └── StatusBadge.tsx      # Run status badge
├── docker-compose.yml
├── docker-compose.prod.yml      # Production compose (uses CI registry images, env vars substituted via envsubst)
├── .gitlab-ci.yml               # CI/CD: build-backend, build-frontend, mirror-redis, deploy (master only)
├── nginx.conf
├── test_api.py                  # Smoke tests (pip install httpx; python test_api.py)
└── CLAUDE.md                    # This file
```

---

## Database Tables (Oracle, all prefixed SH_)

| Table | Purpose |
|-------|---------|
| `SH_SCRIPTS` | Script definitions |
| `SH_SCRIPT_RUNS` | Each execution instance |
| `SH_RUN_LOGS` | stdout/stderr lines per run |
| `SH_APP_SETTINGS` | Key-value global settings |
| `SH_ALERT_CONFIGS` | Email/Telegram alert rules per script |
| `SH_GLOBAL_VARS` | Global env variables injected into every run |

**Oracle gotchas:**
- Empty string `''` = NULL — don't insert `''` into NOT NULL columns
- DDL auto-commits — alembic migration is idempotent (checks `user_tables` before CREATE)
- `oracledb` must be `>=2.0` — SQLAlchemy 2.x requires it
- Migrations: never edit `001_initial_schema.py`. Create a new file `002_*.py`, set `down_revision = "001"`
- **Timezone**: `database.py` and `tasks.py` both run `ALTER SESSION SET TIME_ZONE = '+00:00'` on connect → Oracle always returns UTC. Do NOT remove this — without it, oracledb 2.x returns tz-aware datetimes with the session offset (+05:00 when `TZ=Asia/Almaty` is in `.env`), causing "5 hours ago" drift in the UI

---

## Key Flows

### Script Execution (tasks.py)
1. Load script + run from DB
2. Set run.status = "running"
3. `pip install --index-url https://pypi.org/simple/ -r requirements` (if any)
4. Write script to temp `.py` file
5. Load `SH_GLOBAL_VARS` → inject as env vars
6. Inject `TZ=<timezone>` from `SH_APP_SETTINGS` so `datetime.now()` returns local time
7. Parse `run.parameters` JSON → inject as `PARAM_<NAME>` env vars + write `SCHED_PARAMS_FILE=/tmp/params_{run_id}.json`
8. Spawn subprocess with `env=child_env`
8. Stream stdout/stderr to `SH_RUN_LOGS`
9. Update run status (success/failed/timeout)
10. Retry or send alert if failed

### Webhook trigger
`POST /api/webhooks/{token}` → finds script by `webhook_token`, creates ScriptRun with `triggered_by="webhook"`, body JSON becomes `run.parameters`.

### Parameters in scripts
```python
import os
input_file = os.environ.get("PARAM_INPUT_FILE", "default.csv")

# Or read the full params JSON:
import json
params = json.load(open(os.environ["SCHED_PARAMS_FILE"]))
```

### Global Variables in scripts
```python
import os
api_key = os.environ["MY_API_KEY"]  # set in Global Variables page
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check → `{"status": "ok"}` |
| GET/PUT | `/api/settings` | Global app settings |
| GET/POST | `/api/scripts` | List / create scripts |
| GET/PUT/DELETE | `/api/scripts/{id}` | Get / update / delete |
| PATCH | `/api/scripts/{id}/toggle` | Toggle is_active |
| PATCH | `/api/scripts/{id}/regenerate-webhook` | New webhook token |
| POST | `/api/scripts/{id}/run` | Manual run (optional JSON body = parameters) |
| GET | `/api/runs` | List runs (paginated, `?script_id=&script_ids=&status=&date_from=&date_to=`) |
| GET | `/api/runs/active` | Running/pending runs |
| GET/DELETE | `/api/runs/{id}` | Get run / cancel |
| GET | `/api/runs/{id}/logs` | All log lines |
| GET | `/api/runs/{id}/logs/stream` | SSE live stream |
| GET/POST | `/api/variables` | List / create global vars |
| PUT/DELETE | `/api/variables/{id}` | Update / delete |
| GET/POST | `/api/alerts/{script_id}` | List / create alert configs |
| POST | `/api/alerts/{id}/test` | Send test alert for a config |
| DELETE | `/api/alerts/{id}` | Delete alert |
| POST | `/api/webhooks/{token}` | Webhook trigger |
| GET | `/api/docs` | Swagger UI |

---

## Migrations — How to Add a Column

1. Create `backend/alembic/versions/003_my_change.py`:
```python
revision = "003"
down_revision = "002"

def upgrade():
    conn = op.get_bind()
    if not _col_exists(conn, "SH_SCRIPTS", "my_new_col"):
        op.add_column("SH_SCRIPTS", sa.Column("my_new_col", sa.String(200)))

def downgrade():
    op.drop_column("SH_SCRIPTS", "my_new_col")
```
2. Add field to `app/models/script.py`
3. Add field to `app/schemas/script.py` (ScriptBase, ScriptUpdate, ScriptResponse)
4. `docker compose up -d --build` — Alembic runs on startup

---

## Dev Commands

```bash
# Start everything
docker compose up -d --build

# View backend logs
docker compose logs -f backend

# View worker logs
docker compose logs -f worker

# Run smoke tests (from host, requires httpx)
python test_api.py

# Rebuild only backend (after Python changes)
docker compose up -d --build backend worker beat

# Rebuild only frontend (after TS/React changes)
docker compose up -d --build frontend

# Reset DB tables (run in Oracle SQL Developer before fresh migration):
BEGIN
  FOR t IN (SELECT table_name FROM user_tables
            WHERE table_name IN ('SH_APP_SETTINGS','SH_SCRIPTS',
                                  'SH_SCRIPT_RUNS','SH_RUN_LOGS',
                                  'SH_ALERT_CONFIGS','SH_GLOBAL_VARS'))
  LOOP
    EXECUTE IMMEDIATE 'DROP TABLE "' || t.table_name || '" CASCADE CONSTRAINTS';
  END LOOP;
END;
/
BEGIN EXECUTE IMMEDIATE 'DROP TABLE alembic_version'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
```

---

## Beat Scheduler — важные детали

`celery-beat` использует кастомный `DatabaseScheduler` (beat_schedule.py):
- Читает скрипты из DB каждые 60 сек (+ Redis force-reload сигнал из API при создании/активации скрипта)
- Cron выражения интерпретируются в timezone из `SH_APP_SETTINGS.timezone`
- Cron должен быть с пробелами: `* * * * *`, не `*****`
- `last_run_at` для новых записей = `datetime.now(UTC)` — НЕ год 2000. Год 2000 вызывает немедленный старт.
- Если `last_run_at.year < 2020` в существующей shelve-записи — сбрасывается в `now()` (защита от stale данных)
- Shelve-файл: `celerybeat-schedule` (volume `celery_beat_schedule:/data`)
- При деплое: CI удаляет beat-контейнер + volume → чистый старт без stale расписания
- `_signal_beat_reload()` вызывается при create/toggle скрипта → beat подхватывает немедленно

## SH_APP_SETTINGS — известные ключи

| Key | Default | Description |
|-----|---------|-------------|
| `timezone` | `Asia/Almaty` | Timezone для cron и отображения времени |
| `max_concurrent_workers` | `2` | Макс параллельных воркеров |
| `default_timeout_seconds` | `3600` | Таймаут скрипта по умолчанию |
| `default_max_retries` | `0` | Кол-во повторных попыток |
| `global_alert_on_failure` | `false` | Глобальный алерт при failed |
| `global_alert_on_timeout` | `false` | Глобальный алерт при timeout |
| `global_alert_channel` | — | `email` или `telegram` |
| `global_alert_destination` | — | Email или Telegram chat ID |

## Tags on Scripts

`SH_SCRIPTS.tag` (VARCHAR2 100) — optional label set in ScriptDetail → Settings tab.
- Scripts page groups scripts by tag with collapsible sections
- Dashboard Recent Runs shows Tag column + tag filter pills (server-side filtering via `script_ids`)
- `api/client.ts` has a `paramsSerializer` that serialises arrays as repeated params (`k=1&k=2`) for FastAPI compatibility

## UI Features (добавлены)

- **Scripts page**: поиск по name/description (client-side); Schedule column показывает `describeCron()` + "Next: ..."
- **Dashboard Recent Runs**: поиск по script_name — при активном поиске грузит `page_size=1000` и пагинирует клиентски
- **ScriptDetail → History**: пагинация 15/страницу + фильтр по периоду (по умолчанию последние 30 дней)
- **ScriptDetail → Alerts**: кнопка "Test" → `POST /api/alerts/{id}/test` → toast с результатом
- **Variables page**: значения скрыты (`••••`), кнопки Eye/Copy появляются при hover
- **Kill confirmation**: на Dashboard и RunDetail — модальное окно подтверждения перед отменой запуска
- **Kill log**: при отмене записывается `[Process killed by user]` в `SH_RUN_LOGS`
- **Alert messages**: включают Tag, human-readable статус и описательную фразу (email + Telegram)
- **Global Alerts**: настройка в Settings → "Admin Alerts" секция (хранится в `SH_APP_SETTINGS`)

## tasks.py — важные детали (после исправлений)

- **SIGTERM handler**: установлен перед Popen. При `celery revoke(terminate=True)` → `os.killpg(os.getpgid(proc.pid), SIGTERM)` убивает весь process group subprocess'а. `os.setsid()` в `preexec_fn` создаёт новую группу процессов.
- **Distributed lock**: `script_run_lock:{script_id}:{minute_bucket}` (TTL=300s, НЕ удаляется явно) — блокирует дублирующие задачи в пределах одной минуты.
- **fork safety**: `worker_process_init` сигнал → `engine.dispose()` после форка. Event `checkout` (не `connect`) гарантирует UTC на каждом соединении.
- **Temp files**: `tmp_script`, `tmp_req`, `tmp_params` — все три удаляются в `finally`. `tmp_params` = `SCHED_PARAMS_FILE` JSON файл.
- **Default parameters**: при scheduled run — извлекаются из `parameters_schema` (поле `default`). Хранятся в `run.parameters` как JSON.

## runs.py — важные детали (после исправлений)

- **cancel_run**: использует только `celery_app.control.revoke(terminate=True, signal="SIGTERM")`. `os.kill(worker_pid)` УБРАН — API и worker в разных контейнерах, PID не пересекаются.
- **SSE stream**: timeout 8 часов (защита от вечного поллинга при зависшем run). При таймауте шлёт `{type: "timeout"}`.
- **date_from/date_to**: нормализуются в UTC naive через `_utc_naive()` перед сравнением с Oracle DATE колонками.

## cronUtils.ts — важные детали

`frontend/src/utils/cronUtils.ts`:
- `getNextCronRun(expr, timezone)` — итерирует по минутам (макс. 10080 = 1 неделя) используя `Intl.DateTimeFormat.formatToParts()` в целевом timezone
- `describeCron(expr)` — человекочитаемое описание; `* * * * *` → "Every minute" (не "Every hour")
- Поддерживает: `*`, `*/n`, списки через запятую, диапазоны, конкретные значения

## dateUtils.ts — важные детали

`frontend/src/utils/dateUtils.ts`:
- `parseUTC(s)` — парсит datetime строку как UTC. Если строка без timezone маркера (`Z` / `+HH:MM`), добавляет `Z`
- Используется везде где `new Date(timestamp)` для расчётов ("time ago", elapsed timer)
- Не используется в `formatDateTime` — там `Intl.DateTimeFormat` сам конвертирует в нужный timezone

## CI/CD (.gitlab-ci.yml)

- **build stage** (параллельно): `build-backend`, `build-frontend`, `mirror-redis`
  - `mirror-redis`: пулит `redis:7-alpine` с Docker Hub на раннере и пушит в GitLab registry → сервер не обращается к Docker Hub напрямую
- **deploy stage** (только `master`): SSH на сервер, `envsubst` подставляет переменные в `docker-compose.prod.yml`, затем:
  1. `docker-compose stop celery-beat && docker-compose rm -f celery-beat`
  2. `docker volume rm ${CI_PROJECT_NAME}_celery_beat_schedule || true`
  3. `docker-compose up -d --remove-orphans`
- `--remove-orphans` убивает контейнеры от предыдущих деплоев
- Раннер образ `governmentpaas/git-ssh` (Alpine) — `envsubst` устанавливается через `apk add gettext`
- `COMPOSE_PATH` = `/data/docker-compose/$CI_PROJECT_NAMESPACE/$CI_PROJECT_NAME`
- `.env` файл лежит на сервере в `$COMPOSE_PATH/.env` (не в репо) — содержит Oracle credentials, TZ и др.

## Production .env (на сервере)

```env
ORACLE_HOST=...
ORACLE_PORT=1521
ORACLE_SERVICE_NAME=FREEPDB1
ORACLE_USER=...
ORACLE_PASSWORD=...
REDIS_URL=redis://redis:6379/0
SECRET_KEY=...
# Alerts (опционально)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
TELEGRAM_BOT_TOKEN=
```
