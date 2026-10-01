import os
import sqlite3
import threading
import time

DB_PATH = "/data/proxy.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS request_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_ms INTEGER NOT NULL,
    submission_id TEXT,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    query_string TEXT NOT NULL,
    remote_addr TEXT NOT NULL,
    request_headers TEXT NOT NULL,
    status INTEGER NOT NULL,
    response_headers TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_log_submission_id ON request_log (submission_id);

CREATE TABLE IF NOT EXISTS visit_tokens (
    token TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_leases (
    bot_ip TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL,
    started_ms INTEGER NOT NULL,
    expires_ms INTEGER NOT NULL
);
"""

REQUEST_LOG_MAX_AGE_SECONDS = 600
REQUEST_LOG_MAX_ROWS = 2000
PURGE_INTERVAL_SECONDS = 120

VISIT_TOKEN_TTL_SECONDS = 60

BOT_LEASE_TTL_SECONDS = 20


def _connect():
    return sqlite3.connect(DB_PATH, timeout=10)


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = _connect()
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def register_visit_token(token, submission_id):
    conn = _connect()
    conn.execute(
        "INSERT OR REPLACE INTO visit_tokens (token, submission_id, created_at_ms) VALUES (?, ?, ?)",
        (token, submission_id, int(time.time() * 1000)),
    )
    conn.commit()
    conn.close()


def resolve_visit_token(token):
    if not token:
        return None
    conn = _connect()
    row = conn.execute("SELECT submission_id, created_at_ms FROM visit_tokens WHERE token = ?", (token,)).fetchone()
    conn.close()
    if row is None:
        return None
    submission_id, created_at_ms = row
    if time.time() * 1000 - created_at_ms > VISIT_TOKEN_TTL_SECONDS * 1000:
        return None
    return submission_id


def open_lease(bot_ip, submission_id):
    if not bot_ip:
        return
    now_ms = int(time.time() * 1000)
    conn = _connect()
    conn.execute(
        "INSERT OR REPLACE INTO bot_leases (bot_ip, submission_id, started_ms, expires_ms) VALUES (?, ?, ?, ?)",
        (bot_ip, submission_id, now_ms, now_ms + BOT_LEASE_TTL_SECONDS * 1000),
    )
    conn.commit()
    conn.close()


def resolve_lease(bot_ip, ts_ms):
    if not bot_ip:
        return None
    conn = _connect()
    row = conn.execute(
        "SELECT submission_id FROM bot_leases WHERE bot_ip = ? AND started_ms <= ? AND ? < expires_ms",
        (bot_ip, ts_ms, ts_ms),
    ).fetchone()
    conn.close()
    return row[0] if row else None


def close_lease(submission_id):
    conn = _connect()
    conn.execute("DELETE FROM bot_leases WHERE submission_id = ?", (submission_id,))
    conn.commit()
    conn.close()


def log_request(entry):
    conn = _connect()
    conn.execute(
        """INSERT INTO request_log
           (ts_ms, submission_id, method, path, query_string, remote_addr,
            request_headers, status, response_headers)
           VALUES (:ts_ms, :submission_id, :method, :path, :query_string, :remote_addr,
                   :request_headers, :status, :response_headers)""",
        entry,
    )
    conn.commit()
    conn.close()


def query_requests_for_submission(submission_id, limit=50):
    conn = _connect()
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM request_log WHERE submission_id = ? ORDER BY ts_ms ASC LIMIT ?",
        (submission_id, limit),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def _purge_once():
    conn = _connect()
    cutoff_ms = int(time.time() * 1000) - REQUEST_LOG_MAX_AGE_SECONDS * 1000
    conn.execute("DELETE FROM request_log WHERE ts_ms < ?", (cutoff_ms,))
    token_cutoff_ms = int(time.time() * 1000) - VISIT_TOKEN_TTL_SECONDS * 1000
    conn.execute("DELETE FROM visit_tokens WHERE created_at_ms < ?", (token_cutoff_ms,))
    conn.execute("DELETE FROM bot_leases WHERE expires_ms < ?", (int(time.time() * 1000),))
    count = conn.execute("SELECT COUNT(*) FROM request_log").fetchone()[0]
    if count > REQUEST_LOG_MAX_ROWS:
        excess = count - REQUEST_LOG_MAX_ROWS
        conn.execute(
            "DELETE FROM request_log WHERE id IN "
            "(SELECT id FROM request_log ORDER BY ts_ms ASC LIMIT ?)",
            (excess,),
        )
    conn.commit()
    conn.close()


def start_purge_thread():
    def loop():
        while True:
            time.sleep(PURGE_INTERVAL_SECONDS)
            try:
                _purge_once()
            except Exception:
                pass

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
    return thread
