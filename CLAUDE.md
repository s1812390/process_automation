# Process Automation — Scheduler / Job Manager

Quick reference for Claude Code sessions on this project.

---

## Project Overview

A Python script scheduler with a React UI. Users create Python scripts, schedule them via cron, run them manually or via webhook, monitor logs in real time, and receive alerts on failure.

**Stack:** FastAPI + Celery + Oracle DB + React + Vite
**Docker services:** `backend`, `celery-worker`, `celery-beat`, `redis`, `frontend` (nginx, port **8090**)
**Docker logs:** capped at 20 MB × 5 files per service (configured in docker-compose.yml)
**Active branch:** `claude/enhance-script-automation-gEuTU`

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
│   │   │   ├── script.py        # SH_SCRIPTS (+ python_env_id FK)
│   │   │   ├── run.py           # SH_SCRIPT_RUNS
│   │   │   ├── log.py           # SH_RUN_LOGS
│   │   │   ├── settings.py      # SH_APP_SETTINGS
│   │   │   ├── alert.py         # SH_ALERT_CONFIGS
│   │   │   ├── variable.py      # SH_GLOBAL_VARS
│   │   │   └── environment.py   # SH_PYTHON_ENVS + SH_ENV_PACKAGES
│   │   ├── schemas/
│   │   │   ├── script.py        # Pydantic schemas (+ python_env_id)
│   │   │   ├── run.py
│   │   │   ├── settings.py
│   │   │   ├── alert.py
│   │   │   ├── variable.py
│   │   │   └── environment.py   # PythonEnvResponse, EnvPackageResponse, SyncResult
│   │   ├── routers/
│   │   │   ├── scripts.py
│   │   │   ├── runs.py
│   │   │   ├── settings.py
│   │   │   ├── alerts.py
│   │   │   ├── variables.py
│   │   │   ├── webhooks.py
│   │   │   ├── system.py
│   │   │   └── environments.py  # Python env CRUD + install/uninstall/sync
│   │   └── services/
│   │       └── alerts.py
│   ├── alembic/
│   │   └── versions/
│   │       ├── 001_initial_schema.py
│   │       ├── 002_features.py
│   │       ├── 003_tags.py
│   │       ├── 004_run_resources.py
│   │       ├── 005_python_envs.py    # Created SH_PYTHON_ENVS/SH_ENV_PACKAGES (trigger+seq — superseded)
│   │       └── 006_fix_pyenv_identity.py  # Drops 005 artifacts, recreates with sa.Identity(always=True)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   └── src/
│       ├── App.tsx              # Routes: + /environments
│       ├── api/
│       │   ├── client.ts
│       │   ├── scripts.ts       # + python_env_id field
│       │   ├── runs.ts
│       │   ├── variables.ts
│       │   ├── settings.ts
│       │   ├── system.ts
│       │   └── environments.ts  # Full CRUD for Python envs
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   ├── Runs.tsx
│       │   ├── Scripts.tsx      # Create modal: env dropdown
│       │   ├── ScriptDetail.tsx # Tab "environment" (was "requirements"): env dropdown + requirements fallback
│       │   ├── RunDetail.tsx
│       │   ├── Variables.tsx
│       │   ├── Settings.tsx
│       │   └── Environments.tsx # Python env management page
│       └── components/
│           └── layout/Sidebar.tsx  # + "Python Envs" nav item
├── docker-compose.yml           # MTU=1400 network; PIP_INDEX_URL=mirrors.tencent.com
├── docker-compose.prod.yml      # Same; deploy via CI
├── .gitlab-ci.yml               # deploy: docker-compose down && up (recreates network)
└── CLAUDE.md
```

---

## Database Tables (Oracle, all prefixed SH_)

| Table | Purpose |
|-------|---------|
| `SH_SCRIPTS` | Script definitions (+ `python_env_id` FK → SH_PYTHON_ENVS) |
| `SH_SCRIPT_RUNS` | Each execution instance |
| `SH_RUN_LOGS` | stdout/stderr lines per run |
| `SH_APP_SETTINGS` | Key-value global settings |
| `SH_ALERT_CONFIGS` | Email/Telegram alert rules per script |
| `SH_GLOBAL_VARS` | Global env variables injected into every run |
| `SH_PYTHON_ENVS` | Python venv definitions (id, name, description, python_version, path) |
| `SH_ENV_PACKAGES` | Packages per venv (env_id FK, package_name, version, size_kb, status) |

**Oracle gotchas:**
- Empty string `''` = NULL — don't insert `''` into NOT NULL columns
- DDL auto-commits — alembic migration is idempotent (checks `user_tables` before CREATE)
- `oracledb` must be `>=2.0` — SQLAlchemy 2.x requires it
- Migrations: never edit existing files. Create new `00N_*.py`, set `down_revision` to previous
- PK auto-increment: use `sa.Identity(always=True)` in migrations, plain `Column(Integer, primary_key=True)` in models
- **Timezone**: `database.py` and `tasks.py` both run `ALTER SESSION SET TIME_ZONE = '+00:00'` on connect

---

## Python Environments Feature

### Architecture
- Venvs stored at `/data/pyenvs/{env_id}/` (Docker volume `python_envs` mounted in both `backend` and `celery-worker`)
- **env id=0** = synthetic read-only "System Python" — always first in list, all write endpoints return 403
- `is_system: bool` field on `PythonEnvResponse`
- Install runs as FastAPI `BackgroundTask` in backend container (`_do_install` async function)
- Package status: `installing` → `installed` / `failed`

### Script integration
- `SH_SCRIPTS.python_env_id` (nullable FK) — set in ScriptDetail → Environment tab
- If env selected: `tasks.py` uses `{env_path}/bin/python` instead of system python; skips requirements.txt install
- If no env: falls back to system python + requirements.txt (old behavior)

### Key implementation details (routers/environments.py)
- **Never access ORM relationship attributes** in async context → MissingGreenlet crash
- Always query packages explicitly: `select(EnvPackage).where(EnvPackage.env_id == env_id)`
- Use `_env_response(env, pkgs)` helper — takes explicitly-loaded packages as parameter
- `create_environment` returns `PythonEnvResponse(...)` directly without loading relationships

### pip install
```python
async def _pip_install(pip_bin, pkg_spec):
    return await _run_cmd(
        [pip_bin, "install", "--timeout", "120", "--index-url", PIP_INDEX_URL, pkg_spec],
        timeout=600,
    )
```
`PIP_INDEX_URL` from env var (docker-compose sets `mirrors.tencent.com` for dev, `pypi.org` for prod).

---

## Key Flows

### Script Execution (tasks.py)
1. Load script + run from DB
2. Set run.status = "running"
3. Resolve python interpreter: if `script.python_env_id` → use `{env_path}/bin/python`, else `"python"`
4. If system python AND script has requirements: `pip install -r requirements`
5. Write script to temp `.py` file
6. Load `SH_GLOBAL_VARS` → inject as env vars
7. Inject `TZ=<timezone>` from `SH_APP_SETTINGS`
8. Parse `run.parameters` JSON → inject as `PARAM_<NAME>` env vars + write `SCHED_PARAMS_FILE`
9. Spawn subprocess, stream stdout/stderr to `SH_RUN_LOGS`
10. Update run status (success/failed/timeout)
11. Retry or send alert if failed

### Webhook trigger
`POST /api/webhooks/{token}` → finds script by `webhook_token`, creates ScriptRun with `triggered_by="webhook"`, body JSON becomes `run.parameters`.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET/PUT | `/api/settings` | Global app settings |
| GET/POST | `/api/scripts` | List / create scripts |
| GET/PUT/DELETE | `/api/scripts/{id}` | Get / update / delete |
| PATCH | `/api/scripts/{id}/toggle` | Toggle is_active |
| PATCH | `/api/scripts/{id}/regenerate-webhook` | New webhook token |
| POST | `/api/scripts/{id}/run` | Manual run |
| GET | `/api/runs` | List runs (paginated) |
| GET | `/api/runs/active` | Running/pending runs |
| GET/DELETE | `/api/runs/{id}` | Get run / cancel |
| GET | `/api/runs/{id}/logs` | All log lines |
| GET | `/api/runs/{id}/logs/stream` | SSE live stream |
| GET/POST | `/api/variables` | List / create global vars |
| PUT/DELETE | `/api/variables/{id}` | Update / delete |
| GET/POST | `/api/alerts/{script_id}` | List / create alert configs |
| POST | `/api/alerts/{id}/test` | Send test alert |
| DELETE | `/api/alerts/{id}` | Delete alert |
| POST | `/api/webhooks/{token}` | Webhook trigger |
| GET | `/api/system/stats` | Host/container stats |
| GET | `/api/system/container-logs/{name}` | Container log lines |
| **GET/POST** | **`/api/environments`** | **List / create Python envs** |
| **GET/DELETE** | **`/api/environments/{id}`** | **Get / delete env** |
| **GET/POST** | **`/api/environments/{id}/packages`** | **List / install package** |
| **DELETE** | **`/api/environments/{id}/packages/{pkg_id}`** | **Uninstall package** |
| **POST** | **`/api/environments/{id}/sync`** | **Sync DB with actual pip list** |
| GET | `/api/docs` | Swagger UI |

---

## Migrations — How to Add a Column

Next migration should be `007_*.py` with `down_revision = "006"`.

```python
revision = "007"
down_revision = "006"

def upgrade():
    conn = op.get_bind()
    if not _col_exists(conn, "SH_SCRIPTS", "my_new_col"):
        op.add_column("SH_SCRIPTS", sa.Column("my_new_col", sa.String(200)))
```

---

## Dev Commands

```bash
# Start everything (recreates network with MTU 1400)
docker compose down && docker compose up -d --build

# View backend logs
docker compose logs -f backend

# Rebuild only backend
docker compose up -d --build backend celery-worker celery-beat

# Rebuild only frontend
docker compose up -d --build frontend
```

---

## Beat Scheduler — важные детали

- Читает скрипты из DB каждые 60 сек (+ Redis force-reload сигнал)
- Cron должен быть с пробелами: `* * * * *`, не `*****`
- `last_run_at` для новых записей = `datetime.now(UTC)` — НЕ год 2000
- Shelve-файл: `celerybeat-schedule` (volume `celery_beat_schedule:/data`)
- При деплое: CI удаляет volume → чистый старт

## SH_APP_SETTINGS — известные ключи

| Key | Default | Description |
|-----|---------|-------------|
| `timezone` | `Asia/Almaty` | Timezone для cron |
| `max_concurrent_workers` | `2` | Макс параллельных воркеров |
| `default_timeout_seconds` | `3600` | Таймаут скрипта |
| `default_max_retries` | `0` | Повторных попыток |
| `global_alert_on_failure` | `false` | Алерт при failed |
| `global_alert_on_timeout` | `false` | Алерт при timeout |
| `global_alert_channel` | — | `email` или `telegram` |
| `global_alert_destination` | — | Email или Telegram chat ID |

## CI/CD (.gitlab-ci.yml) — текущий деплой

```bash
docker-compose pull &&
docker-compose down --remove-orphans &&   # stops all + removes old network
docker volume rm ${CI_PROJECT_NAME}_celery_beat_schedule || true &&
docker-compose up -d                      # creates new network with MTU 1400
```

**ПРОБЛЕМА**: `docker-compose down && docker-compose up -d` иногда падает с:
`Error response from daemon: network <old-id> not found`
Это race condition в docker-compose при пересоздании сети. **НЕ РЕШЕНО** — нужно разобраться в новой сессии.

## Сетевая проблема pip install — статус

**Симптом**: pip install зависает / тайм-аут внутри Docker контейнеров.

**Диагностика**:
- TCP connect к pypi.org/mirrors.tencent.com работает (< 10 сек)
- TLS handshake / HTTP response зависает бесконечно
- curl от хоста работает если дать достаточно времени
- Нет прокси (`env | grep -i proxy` пусто)
- IPv6 не работает с хоста, но это не причина — IPv4 тоже зависает

**Диагноз**: MTU black hole — ICMP "fragmentation needed" блокируется корпоративным firewall. TCP SYN/SYN-ACK (мелкие пакеты) проходят, но большие пакеты TLS/HTTP молча дропаются.

**Попытки исправления**:
1. ✗ Смена зеркала (pypi.org → mirrors.tencent.com → обратно)
2. ✗ DNS 8.8.8.8 в docker-compose
3. ✗ gai.conf IPv4 preference (IPv6 не виноват)
4. ✗ Docker --network=host (хост тоже имеет ту же проблему с pip)
5. ⚠ MTU 1400 в docker-compose network config — **добавлено, но деплой сломался раньше чем проверили**

**Текущее состояние кода** (environments.py):
```python
async def _pip_install(pip_bin, pkg_spec):
    return await _run_cmd(
        [pip_bin, "install", "--timeout", "120", "--index-url", PIP_INDEX_URL, pkg_spec],
        timeout=600,
    )
```
Docker bridge MTU=1400 настроен в docker-compose но ещё не был успешно задеплоен.

**Следующий шаг**: починить CI деплой (race condition), задеплоить MTU fix, проверить работает ли pip.
Если нет — попробовать `ip route add <pypi-ip> via <gateway> mtu 1400` или `iptables -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1360` на хосте (требует root/sudo).

## tasks.py — важные детали

- **SIGTERM handler**: `os.killpg(os.getpgid(proc.pid), SIGTERM)` убивает process group
- **Distributed lock**: `script_run_lock:{script_id}:{minute_bucket}` (TTL=300s)
- **fork safety**: `engine.dispose()` на `worker_process_init`
- **Temp files**: `tmp_script`, `tmp_req`, `tmp_params` — удаляются в `finally`

## runs.py — важные детали

- **cancel_run**: `celery_app.control.revoke(terminate=True, signal="SIGTERM")` — без `os.kill`
- **SSE stream**: timeout 8 часов
- **date_from/date_to**: нормализуются в UTC naive через `_utc_naive()`

## UI Features

- **Python Environments page** (`/environments`): левая панель — список envs; правая — пакеты, install form, sync. System Python (id=0) — read-only (нет кнопок delete/install/sync, нет удаления пакетов)
- **ScriptDetail → Environment tab**: dropdown выбора env; если не выбрано — показывает редактор requirements.txt
- **Scripts → Create modal**: dropdown выбора env при создании
- **Scripts page**: поиск, Schedule column с next run
- **Runs page**: фильтры + RAM/CPU columns
- **Dashboard**: System Health (CPU/RAM, контейнеры, диск, логи)

## Production .env (на сервере)

```env
ORACLE_HOST=...
ORACLE_PORT=1521
ORACLE_SERVICE_NAME=FREEPDB1
ORACLE_USER=...
ORACLE_PASSWORD=...
REDIS_URL=redis://redis:6379/0
SECRET_KEY=...
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
TELEGRAM_BOT_TOKEN=
```
