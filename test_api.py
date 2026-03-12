"""
Smoke tests for the Process Automation API.

Usage:
    # 1. Start the stack:
    #    docker compose up -d
    #
    # 2. Run the tests (install httpx if needed: pip install httpx):
    #    python test_api.py
    #
    # Or pass a custom base URL:
    #    BASE_URL=http://my-server:8000 python test_api.py

import os, sys, time
"""

import os
import sys
import time

try:
    import httpx
except ImportError:
    print("ERROR: httpx not installed. Run: pip install httpx")
    sys.exit(1)

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"

errors = []


def check(name: str, condition: bool, detail: str = ""):
    if condition:
        print(f"  [{PASS}] {name}")
    else:
        print(f"  [{FAIL}] {name}" + (f" — {detail}" if detail else ""))
        errors.append(name)


def section(title: str):
    print(f"\n=== {title} ===")


# ---------------------------------------------------------------------------
# 1. Health
# ---------------------------------------------------------------------------
section("Health check")
try:
    r = httpx.get(f"{BASE_URL}/health", timeout=10)
    check("GET /health → 200", r.status_code == 200)
    check("health body has status=ok", r.json().get("status") == "ok")
except Exception as e:
    check("GET /health reachable", False, str(e))

# ---------------------------------------------------------------------------
# 2. Settings
# ---------------------------------------------------------------------------
section("Settings")
try:
    r = httpx.get(f"{BASE_URL}/api/settings", timeout=10)
    check("GET /api/settings → 200", r.status_code == 200)
    settings = r.json()
    check("settings is a list", isinstance(settings, list))
    keys = [s["key"] for s in settings]
    check("default_timeout_seconds present", "default_timeout_seconds" in keys)
    check("max_concurrent_workers present", "max_concurrent_workers" in keys)
except Exception as e:
    check("GET /api/settings reachable", False, str(e))

# ---------------------------------------------------------------------------
# 3. Scripts CRUD
# ---------------------------------------------------------------------------
section("Scripts — create")
script_id = None
try:
    payload = {
        "name": "smoke-test-script",
        "description": "Created by test_api.py",
        "script_content": "print('hello from smoke test')",
        "cron_expression": None,
        "timeout_seconds": 60,
        "priority": 3,
        "max_retries": 0,
        "is_active": True,
    }
    r = httpx.post(f"{BASE_URL}/api/scripts", json=payload, timeout=10)
    check("POST /api/scripts → 201", r.status_code == 201)
    script = r.json()
    check("response has id", "id" in script)
    check("name matches", script.get("name") == "smoke-test-script")
    script_id = script.get("id")
except Exception as e:
    check("POST /api/scripts reachable", False, str(e))

section("Scripts — list")
try:
    r = httpx.get(f"{BASE_URL}/api/scripts", timeout=10)
    check("GET /api/scripts → 200", r.status_code == 200)
    scripts = r.json()
    check("scripts is a list", isinstance(scripts, list))
    if script_id:
        ids = [s["id"] for s in scripts]
        check("created script appears in list", script_id in ids)
except Exception as e:
    check("GET /api/scripts reachable", False, str(e))

section("Scripts — get by id")
if script_id:
    try:
        r = httpx.get(f"{BASE_URL}/api/scripts/{script_id}", timeout=10)
        check("GET /api/scripts/{id} → 200", r.status_code == 200)
        check("id matches", r.json().get("id") == script_id)
    except Exception as e:
        check("GET /api/scripts/{id} reachable", False, str(e))
else:
    print("  [SKIP] no script_id — create failed")

section("Scripts — update")
if script_id:
    try:
        r = httpx.put(
            f"{BASE_URL}/api/scripts/{script_id}",
            json={"description": "updated by test"},
            timeout=10,
        )
        check("PUT /api/scripts/{id} → 200", r.status_code == 200)
        check("description updated", r.json().get("description") == "updated by test")
    except Exception as e:
        check("PUT /api/scripts/{id} reachable", False, str(e))

section("Scripts — toggle active")
if script_id:
    try:
        r_before = httpx.get(f"{BASE_URL}/api/scripts/{script_id}", timeout=10)
        before = r_before.json().get("is_active")
        r = httpx.patch(f"{BASE_URL}/api/scripts/{script_id}/toggle", timeout=10)
        check("PATCH /api/scripts/{id}/toggle → 200", r.status_code == 200)
        check("is_active flipped", r.json().get("is_active") == (not before))
    except Exception as e:
        check("PATCH toggle reachable", False, str(e))

# ---------------------------------------------------------------------------
# 4. Manual run
# ---------------------------------------------------------------------------
section("Script — manual run")
run_id = None
if script_id:
    try:
        r = httpx.post(f"{BASE_URL}/api/scripts/{script_id}/run", timeout=10)
        check("POST /api/scripts/{id}/run → 201", r.status_code == 201)
        body = r.json()
        check("response has run_id", "run_id" in body)
        run_id = body.get("run_id")
    except Exception as e:
        check("POST /api/scripts/{id}/run reachable", False, str(e))
else:
    print("  [SKIP] no script_id")

# ---------------------------------------------------------------------------
# 5. Runs list
# ---------------------------------------------------------------------------
section("Runs — list for script")
if script_id:
    try:
        r = httpx.get(f"{BASE_URL}/api/runs?script_id={script_id}", timeout=10)
        check("GET /api/runs?script_id={id} → 200", r.status_code == 200)
        runs = r.json()
        check("runs is a list", isinstance(runs, list))
        if run_id:
            run_ids = [ru["id"] for ru in runs]
            check("manual run appears in list", run_id in run_ids)
    except Exception as e:
        check("GET /api/runs reachable", False, str(e))

# ---------------------------------------------------------------------------
# 6. Wait for run to finish and check logs
# ---------------------------------------------------------------------------
section("Run — wait for completion & logs")
if run_id:
    final_status = None
    for attempt in range(15):
        time.sleep(2)
        try:
            r = httpx.get(f"{BASE_URL}/api/runs/{run_id}", timeout=10)
            st = r.json().get("status")
            if st in ("success", "failed", "timeout"):
                final_status = st
                break
        except Exception:
            pass

    if final_status:
        check(f"run finished with status={final_status}", final_status == "success")
    else:
        check("run finished within 30s", False, "still pending/running")

    try:
        r = httpx.get(f"{BASE_URL}/api/runs/{run_id}/logs", timeout=10)
        check("GET /api/runs/{id}/logs → 200", r.status_code == 200)
        logs = r.json()
        check("logs is a list", isinstance(logs, list))
        if final_status == "success":
            all_text = " ".join(l.get("line_text", "") for l in logs)
            check("stdout contains 'hello from smoke test'", "hello from smoke test" in all_text)
    except Exception as e:
        check("GET /api/runs/{id}/logs reachable", False, str(e))
else:
    print("  [SKIP] no run_id")

# ---------------------------------------------------------------------------
# 7. Cleanup — delete script
# ---------------------------------------------------------------------------
section("Cleanup")
if script_id:
    try:
        r = httpx.delete(f"{BASE_URL}/api/scripts/{script_id}", timeout=10)
        check("DELETE /api/scripts/{id} → 204", r.status_code == 204)
    except Exception as e:
        check("DELETE /api/scripts/{id} reachable", False, str(e))

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print("\n" + "=" * 40)
if errors:
    print(f"FAILED: {len(errors)} test(s) failed:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
else:
    print("All tests passed.")
    sys.exit(0)
