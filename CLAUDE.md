# Process Automation — Scheduler / Job Manager

Quick reference for Claude Code sessions on this project.

---

## Project Overview

A Python script scheduler with a React UI. Users create Python scripts, schedule them via cron, run them manually or via webhook, monitor logs in real time, and receive alerts on failure.

**Stack:** FastAPI + Celery + Oracle DB + React + Vite
**Docker services:** `backend`, `celery-worker`, `celery-beat`, `redis`, `nginx`
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
│   │       └── 002_features.py         # webhook_token, parameters_schema, SH_GLOBAL_VARS
│   ├── requirements.txt         # oracledb==2.3.0 (must be >=2.0)
│   └── Dockerfile
├── frontend/
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
│       └── components/
│           ├── layout/Sidebar.tsx   # Nav: Dashboard, Scripts, Global Variables, Settings
│           ├── layout/Header.tsx    # Dynamic page title
│           ├── LogViewer.tsx        # Terminal log viewer + SSE streaming
│           ├── ScriptEditor.tsx     # Monaco editor wrapper
│           ├── CronInput.tsx        # Cron expression input
│           └── StatusBadge.tsx      # Run status badge
├── docker-compose.yml
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
| GET | `/api/runs` | List runs (paginated, `?script_id=&status=&date_from=&date_to=`) |
| GET | `/api/runs/active` | Running/pending runs |
| GET/DELETE | `/api/runs/{id}` | Get run / cancel |
| GET | `/api/runs/{id}/logs` | All log lines |
| GET | `/api/runs/{id}/logs/stream` | SSE live stream |
| GET/POST | `/api/variables` | List / create global vars |
| PUT/DELETE | `/api/variables/{id}` | Update / delete |
| GET/POST | `/api/alerts/{script_id}` | List / create alert configs |
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
- Читает скрипты из DB каждые 60 сек
- Cron выражения интерпретируются в timezone из `SH_APP_SETTINGS.timezone`
- Cron должен быть с пробелами: `* * * * *`, не `*****`
- `last_run_at` сохраняется при обновлении — не сбрасывает расписание
- Shelve-файл: `celerybeat-schedule` (внутри контейнера)

## SH_APP_SETTINGS — известные ключи

| Key | Default | Description |
|-----|---------|-------------|
| `timezone` | `Asia/Almaty` | Timezone для cron и отображения времени |
| `max_concurrent_workers` | `2` | Макс параллельных воркеров |
| `default_timeout_seconds` | `3600` | Таймаут скрипта по умолчанию |
| `default_max_retries` | `0` | Кол-во повторных попыток |

## Git Branch

Development branch: `claude/fix-logs-page-KV66H`

Always push to this branch. Never push to main without explicit permission.
