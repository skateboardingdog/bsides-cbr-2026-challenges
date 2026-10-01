import os
import sqlite3
import threading
import time

from flask import g
from werkzeug.security import check_password_hash, generate_password_hash

DB_PATH = "/data/victim.db"

ACCOUNT_TABLES = ["users_chal2", "users_chal3", "users_chal4"]

SCHEMA = "\n".join(
    f"""CREATE TABLE IF NOT EXISTS {table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );"""
    for table in ACCOUNT_TABLES
)

MAX_AGE_SECONDS = 1800
MAX_ROWS = 500
PURGE_INTERVAL_SECONDS = 120


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def create_account(table, username, password):
    conn = get_db()
    try:
        conn.execute(
            f"INSERT INTO {table} (username, password_hash, created_at) "
            "VALUES (?, ?, strftime('%s', 'now'))",
            (username, generate_password_hash(password)),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()


def verify_account(table, username, password):
    row = get_db().execute(
        f"SELECT password_hash FROM {table} WHERE username = ?", (username,)
    ).fetchone()
    return bool(row and check_password_hash(row["password_hash"], password))


def _purge_once():
    conn = sqlite3.connect(DB_PATH)
    cutoff = int(time.time()) - MAX_AGE_SECONDS
    for table in ACCOUNT_TABLES:
        conn.execute(f"DELETE FROM {table} WHERE created_at < ?", (cutoff,))
        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        if count > MAX_ROWS:
            excess = count - MAX_ROWS
            conn.execute(
                f"""DELETE FROM {table} WHERE id IN (
                    SELECT id FROM {table} ORDER BY created_at ASC LIMIT ?
                )""",
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
