import json
import os
import sqlite3
import time
import uuid

import requests
from flask import Flask, jsonify, request, send_from_directory

XSSBOT_URL = os.environ.get("XSSBOT_URL")
if XSSBOT_URL:
    XSSBOT_URLS = [
        f"{u.rstrip('/')}/visit" if not u.endswith("/visit") else u
        for u in XSSBOT_URL.split(",")
        if u.strip()
    ]
else:
    XSSBOT_HOSTS = os.environ.get("XSSBOT_HOSTS", "xssbot-1,xssbot-2,xssbot-3")
    XSSBOT_URLS = [
        f"http://{host.strip()}/visit" for host in XSSBOT_HOSTS.split(",") if host.strip()
    ]
INTERNAL_SECRET = os.environ["INTERNAL_SECRET"]
PROXY_INTERNAL_URL = os.environ.get("PROXY_INTERNAL_URL", "http://proxy")
PROXY_HOST = os.environ.get("PROXY_HOST", "proxy")
FRONTEND_HOST = os.environ.get("FRONTEND_HOST", "frontend")
VICTIM_CHAL_HOST = "http://app.example.com"
DB_PATH = "/data/frontend.db"
STATIC_DIR = "/app/static"
SOURCES_DIR = "/app/sources"

VALID_CHALLENGES = (1, 2, 3, 4)
VALID_STATUSES = {"done", "error"}


SOURCE_FILES = {
    "chal1": "chal1.py",
    "chal2": "chal2.py",
    "chal3": "chal3.py",
    "chal4": "chal4.py",
}

KEEPALIVE_DELAY_SECONDS = 3.0
REPORT_DELAY_MS = 2500

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY", "dev")
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024


def _register_visit(sub_id, token):
    try:
        requests.post(
            f"{PROXY_INTERNAL_URL}/internal/register-visit",
            json={"submission_id": sub_id, "token": token},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {INTERNAL_SECRET}",
            },
            timeout=3,
        )
    except requests.RequestException:
        pass


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS submissions (
            id TEXT PRIMARY KEY,
            challenge INTEGER NOT NULL,
            code TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            logs TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER NOT NULL,
            remote_addr TEXT NOT NULL DEFAULT '',
            bot_url TEXT NOT NULL DEFAULT ''
        )"""
    )
    conn.commit()
    conn.close()


def _close_lease(sub_id):
    try:
        requests.post(
            f"{PROXY_INTERNAL_URL}/internal/close-lease",
            json={"submission_id": sub_id},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {INTERNAL_SECRET}",
            },
            timeout=3,
        )
    except requests.RequestException:
        pass


import random


def _choose_bot():
    return random.choice(XSSBOT_URLS)


def db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


@app.post("/api/submit")
def submit():
    data = request.get_json(silent=True) or {}
    challenge = data.get("challenge")
    code = data.get("code", "")

    if challenge not in VALID_CHALLENGES:
        return jsonify({"error": "invalid challenge"}), 400
    if not isinstance(code, str) or not code.strip():
        return jsonify({"error": "invalid code"}), 400

    remote_addr = request.remote_addr or ""
    sub_id = uuid.uuid4().hex
    bot_url = _choose_bot()

    conn = db()
    conn.execute(
        "INSERT INTO submissions (id, challenge, code, created_at, remote_addr, bot_url) VALUES (?, ?, ?, ?, ?, ?)",
        (sub_id, challenge, code, int(time.time()), remote_addr, bot_url),
    )
    conn.commit()
    conn.close()

    token = uuid.uuid4().hex
    _register_visit(sub_id, token)

    payload = {
        "url": f"{VICTIM_CHAL_HOST}/internal/tag-visit/{token}/{sub_id}/{challenge}",
    }
    if PROXY_HOST and FRONTEND_HOST:
        payload["proxy"] = {
            "hosts": {
                "app.example.com": PROXY_HOST,
                "usercontent.example.com": FRONTEND_HOST,
                "usercontent.example.net": FRONTEND_HOST,
            },
            "allowInternet": False,
        }

    try:
        requests.post(
            bot_url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-SSRF-Protection": "1",
                "Authorization": f"Bearer {INTERNAL_SECRET}",
            },
            timeout=5,
        )
    except requests.RequestException as e:
        print(f"Error reaching bot: {e}")
        conn = db()
        conn.execute(
            "UPDATE submissions SET status = ?, logs = ? WHERE id = ?",
            (
                "error",
                json.dumps(["[platform] could not reach the bot, please try again"]),
                sub_id,
            ),
        )
        conn.commit()
        conn.close()

    return jsonify({"id": sub_id})


@app.get("/api/result/<sub_id>")
def result(sub_id):
    conn = db()
    row = conn.execute(
        "SELECT status, logs, created_at FROM submissions WHERE id = ?", (sub_id,)
    ).fetchone()
    conn.close()
    if row is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(
        {
            "status": row["status"],
            "logs": json.loads(row["logs"]),
            "created_at_ms": row["created_at"] * 1000,
        }
    )


@app.post("/api/report/<sub_id>")
def report(sub_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    logs = data.get("logs")

    if status not in VALID_STATUSES:
        return jsonify({"error": "invalid status"}), 400
    if not isinstance(logs, list) or not all(isinstance(line, str) for line in logs):
        return jsonify({"error": "invalid logs"}), 400

    conn = db()
    cur = conn.execute(
        "UPDATE submissions SET status = ?, logs = ? WHERE id = ?",
        (status, json.dumps(logs), sub_id),
    )
    conn.commit()
    found = cur.rowcount > 0
    conn.close()
    if not found:
        return jsonify({"error": "not found"}), 404

    _close_lease(sub_id)
    return jsonify({"ok": True})


@app.get("/api/trace/<sub_id>")
def trace(sub_id):
    conn = db()
    row = conn.execute("SELECT id FROM submissions WHERE id = ?", (sub_id,)).fetchone()
    conn.close()
    if row is None:
        return jsonify({"error": "not found"}), 404

    try:
        resp = requests.get(
            f"{PROXY_INTERNAL_URL}/internal/requests/{sub_id}",
            headers={"Authorization": f"Bearer {INTERNAL_SECRET}"},
            timeout=5,
        )
        resp.raise_for_status()
        return jsonify(resp.json())
    except requests.RequestException:
        return jsonify({"requests": []})


@app.get("/api/source/<key>")
def source(key):
    filename = SOURCE_FILES.get(key)
    if filename is None:
        return jsonify({"error": "not found"}), 404
    path = os.path.join(SOURCES_DIR, filename)
    try:
        with open(path, "r") as f:
            code = f.read()
    except OSError:
        return jsonify({"error": "not found"}), 404
    return jsonify({"filename": filename, "code": code})


@app.get("/api/keepalive")
def keepalive():
    time.sleep(KEEPALIVE_DELAY_SECONDS)
    return "", 204


RENDER_PAGE = """<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>sandbox</title>
<base target="__ctf_sandbox_frame">
<script>
(function() {{
  var nativeFetch = window.fetch.bind(window);
  nativeFetch('/api/keepalive').catch(function() {{}});

  var logs = [];
  function capture(type, args) {{
    var parts = Array.prototype.map.call(args, function(a) {{
      if (typeof a === 'string') return a;
      try {{ return JSON.stringify(a); }} catch (e) {{ return String(a); }}
    }});
    logs.push(parts.join(' '));
  }}
  ['log', 'error', 'warn', 'info'].forEach(function(method) {{
    var original = console[method];
    console[method] = function() {{
      capture(method, arguments);
      original.apply(console, arguments);
    }};
  }});
  window.addEventListener('error', function(e) {{
    logs.push('[error] ' + e.message);
  }});

  var reported = false;
  function report(status) {{
    if (reported) return;
    reported = true;
    nativeFetch('/api/report/{sub_id}', {{
      method: 'POST',
      headers: {{'Content-Type': 'application/json'}},
      body: JSON.stringify({{status: status, logs: logs}}),
      keepalive: true
    }}).catch(function() {{}});
  }}
  setTimeout(function() {{ report('done'); }}, {report_delay_ms});
  window.addEventListener('pagehide', function() {{ report('done'); }});
}})();
</script>
</head>
<body>
<iframe name="__ctf_sandbox_frame" style="display:none"></iframe>
__PLAYER_HTML__
</body>
</html>"""


@app.get("/render/<sub_id>")
def render(sub_id):
    conn = db()
    row = conn.execute(
        "SELECT code FROM submissions WHERE id = ?", (sub_id,)
    ).fetchone()
    conn.close()
    if row is None:
        return "not found", 404

    page = RENDER_PAGE.format(sub_id=sub_id, report_delay_ms=REPORT_DELAY_MS)
    page = page.replace("__PLAYER_HTML__", row["code"])
    resp = app.response_class(page, mimetype="text/html")
    resp.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
    return resp


@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def spa(path):
    full_path = os.path.join(STATIC_DIR, path) if path else None
    if full_path and os.path.isfile(full_path):
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, "index.html")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80)
