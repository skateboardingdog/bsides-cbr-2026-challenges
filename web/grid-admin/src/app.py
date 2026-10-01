import hashlib
import os
import secrets
import sqlite3
from contextlib import contextmanager

import jwt
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

app = FastAPI()

JWT_SECRET = os.environ["JWT_SECRET"]
API_KEY = os.environ["API_KEY"]
DB_PATH = "/app/users.db"


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.on_event("startup")
async def startup():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username      TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id     TEXT NOT NULL,
                content       TEXT NOT NULL,
                reply         TEXT,
                status        TEXT NOT NULL DEFAULT 'pending',
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class MessageRequest(BaseModel):
    content: str


class ReplyRequest(BaseModel):
    message_id: int
    reply: str


def make_token(username: str) -> str:
    return jwt.encode(
        {"username": username},
        JWT_SECRET,
        algorithm="HS256",
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(status_code=401, detail="invalid token")


def get_user(token: str) -> dict:
    payload = decode_token(token)
    if "username" not in payload:
        raise HTTPException(status_code=401, detail="invalid token")
    return payload


def require_api_key(api_key: str):
    if not secrets.compare_digest(api_key or "", API_KEY):
        raise HTTPException(status_code=403, detail="admin only")


@app.get("/", response_class=HTMLResponse)
async def index():
    return _INDEX_HTML


@app.post("/register")
async def register(body: RegisterRequest):
    if len(body.username) < 3:
        raise HTTPException(status_code=400, detail="username too short (min 3)")
    if len(body.password) < 3:
        raise HTTPException(status_code=400, detail="password too short (min 3)")
    if not body.username.isalnum():
        raise HTTPException(status_code=400, detail="username must be alphanumeric")

    with get_db() as db:
        existing = db.execute(
            "SELECT username FROM users WHERE username = ?", (body.username,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="username taken")

        db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (body.username, hashlib.sha256(body.password.encode()).hexdigest()),
        )

    return {"status": "ok", "token": make_token(body.username)}


@app.post("/login")
async def login(body: LoginRequest):
    with get_db() as db:
        user = db.execute(
            "SELECT username, password_hash FROM users WHERE username = ?",
            (body.username,),
        ).fetchone()

        if not user:
            raise HTTPException(status_code=401, detail="bad credentials")

        pwhash = hashlib.sha256(body.password.encode()).hexdigest()
        if not secrets.compare_digest(pwhash, user["password_hash"]):
            raise HTTPException(status_code=401, detail="bad credentials")

    return {"status": "ok", "token": make_token(user["username"])}


@app.post("/api/message")
async def send_message(body: MessageRequest, authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ")
    user = get_user(token)

    if not body.content or len(body.content) > 10000:
        raise HTTPException(status_code=400, detail="message must be 1-10000 chars")

    with get_db() as db:
        cursor = db.execute(
            "INSERT INTO messages (sender_id, content) VALUES (?, ?)",
            (user["username"], body.content),
        )
        msg_id = cursor.lastrowid

    return {"status": "ok", "message_id": msg_id}


@app.get("/api/messages")
async def get_messages(authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ")
    user = get_user(token)

    with get_db() as db:
        msgs = db.execute(
            """SELECT id, content, reply, status, created_at
               FROM messages WHERE sender_id = ?
               ORDER BY id DESC LIMIT 50""",
            (user["username"],),
        ).fetchall()

    return [
        {
            "id": m["id"],
            "content": m["content"],
            "reply": m["reply"],
            "status": m["status"],
            "created_at": m["created_at"],
        }
        for m in msgs
    ]


@app.get("/api/admin/messages")
async def admin_get_messages(x_api_key: str = Header(...)):
    require_api_key(x_api_key)

    with get_db() as db:
        msgs = db.execute(
            """SELECT id, sender_id, content FROM messages
               WHERE status = 'pending' ORDER BY id ASC LIMIT 10"""
        ).fetchall()

    return [{"id": m["id"], "sender_id": m["sender_id"], "content": m["content"]} for m in msgs]


@app.post("/api/admin/reply")
async def admin_post_reply(body: ReplyRequest, x_api_key: str = Header(...)):
    require_api_key(x_api_key)

    with get_db() as db:
        db.execute(
            "UPDATE messages SET reply = ?, status = 'replied' WHERE id = ?",
            (body.reply, body.message_id),
        )

    return {"status": "ok"}


_INDEX_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>grid-admin :: messaging</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --border: #30363d;
    --text: #c9d1d9;
    --dim: #8b949e;
    --accent: #58a6ff;
    --green: #3fb950;
    --red: #f85149;
    --warning: #d2991d;
    --font: 'Courier New', Courier, monospace;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    min-height: 100vh;
    display: flex;
    justify-content: center;
    padding: 2rem 1rem;
  }

  .container { width: 100%; max-width: 780px; }

  .header {
    text-align: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--accent);
    box-shadow: 0 0 20px rgba(88, 166, 255, 0.15);
  }
  .header h1 { color: var(--accent); font-size: 1.6rem; letter-spacing: 2px; }
  .header p { color: var(--dim); font-size: 0.8rem; margin-top: 0.3rem; }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  .panel h2 {
    color: var(--accent);
    font-size: 1rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .form-group { margin-bottom: 1rem; }
  .form-group label { display: block; color: var(--dim); font-size: 0.75rem; margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 1px; }
  .form-group input, .form-group textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-family: var(--font);
    font-size: 0.85rem;
  }
  .form-group textarea { resize: vertical; min-height: 80px; }
  .form-group input:focus, .form-group textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 8px rgba(88, 166, 255, 0.2);
  }

  .btn {
    padding: 0.5rem 1.25rem;
    border: 1px solid var(--accent);
    border-radius: 4px;
    background: transparent;
    color: var(--accent);
    font-family: var(--font);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn:hover { background: var(--accent); color: var(--bg); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-row { display: flex; gap: 0.5rem; margin-top: 1rem; }

  .msg {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.75rem 1rem;
    margin-bottom: 0.5rem;
  }
  .msg .meta { color: var(--dim); font-size: 0.7rem; margin-bottom: 0.4rem; display: flex; justify-content: space-between; }
  .msg .content { color: var(--text); font-size: 0.85rem; word-break: break-all; white-space: pre-wrap; }
  .msg .reply {
    margin-top: 0.6rem;
    padding: 0.5rem 0.75rem;
    background: var(--surface);
    border-left: 2px solid var(--green);
    color: var(--green);
    font-size: 0.8rem;
    word-break: break-all;
    white-space: pre-wrap;
  }
  .msg.pending { border-left: 2px solid var(--warning); }
  .msg.replied { border-left: 2px solid var(--green); }

  .status-bar {
    color: var(--dim);
    font-size: 0.7rem;
    text-align: center;
    margin-top: 0.5rem;
  }
  .error { color: var(--red); font-size: 0.75rem; margin-top: 0.3rem; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>&#9608;&#9600;&#9604; GRID-ADMIN &#9604;&#9600;&#9608;</h1>
    <p>admin messaging terminal // v3.0 // ttyA</p>
  </div>

  <div id="auth-panel" class="panel">
    <h2>&#9654; authenticate</h2>
    <div class="form-group">
      <label>username</label>
      <input type="text" id="auth-username" placeholder="sk8dog42">
    </div>
    <div class="form-group">
      <label>password</label>
      <input type="password" id="auth-password" placeholder="********">
    </div>
    <div class="btn-row">
      <button class="btn" onclick="doRegister()">register</button>
      <button class="btn" onclick="doLogin()">login</button>
    </div>
    <div id="auth-error" class="error"></div>
  </div>

  <!-- App panel (shown when logged in) -->
  <div id="app-panel" style="display:none;">
    <div class="panel">
      <h2>&#9654; send message to admin</h2>
      <div class="form-group">
        <label>message content</label>
        <textarea id="msg-content" placeholder="type your message..."></textarea>
      </div>
      <button class="btn" onclick="sendMessage()">&#9654; send</button>
      <div id="send-error" class="error"></div>
      <div class="status-bar" id="send-status"></div>
    </div>

    <div class="panel">
      <h2>&#9654; inbox</h2>
      <div id="messages-container">
        <div class="status-bar">no messages yet</div>
      </div>
      <div class="btn-row">
        <button class="btn" onclick="refreshMessages()">refresh</button>
        <button class="btn" onclick="doLogout()">logout</button>
      </div>
    </div>
  </div>
</div>

<script>
let token = localStorage.getItem('token');
if (token) showApp();

function showApp() {
  document.getElementById('auth-panel').style.display = 'none';
  document.getElementById('app-panel').style.display = 'block';
  refreshMessages();
}

function showAuth() {
  document.getElementById('auth-panel').style.display = 'block';
  document.getElementById('app-panel').style.display = 'none';
}

async function api(method, path, body) {
  const headers = {'Content-Type': 'application/json'};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const opts = {method, headers};
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'request failed');
  return data;
}

async function doRegister() {
  const u = document.getElementById('auth-username').value.trim();
  const p = document.getElementById('auth-password').value;
  document.getElementById('auth-error').textContent = '';
  try {
    const data = await api('POST', '/register', {username: u, password: p});
    token = data.token;
    localStorage.setItem('token', token);
    showApp();
  } catch(e) { document.getElementById('auth-error').textContent = e.message; }
}

async function doLogin() {
  const u = document.getElementById('auth-username').value.trim();
  const p = document.getElementById('auth-password').value;
  document.getElementById('auth-error').textContent = '';
  try {
    const data = await api('POST', '/login', {username: u, password: p});
    token = data.token;
    localStorage.setItem('token', token);
    showApp();
  } catch(e) { document.getElementById('auth-error').textContent = e.message; }
}

function doLogout() {
  token = null;
  localStorage.removeItem('token');
  showAuth();
}

async function sendMessage() {
  const content = document.getElementById('msg-content').value.trim();
  if (!content) return;
  document.getElementById('send-error').textContent = '';
  document.getElementById('send-status').textContent = 'sending...';
  try {
    await api('POST', '/api/message', {content});
    document.getElementById('msg-content').value = '';
    document.getElementById('send-status').textContent = 'message sent';
    refreshMessages();
  } catch(e) { document.getElementById('send-error').textContent = e.message; }
  document.getElementById('send-status').textContent = '';
}

async function refreshMessages() {
  const container = document.getElementById('messages-container');
  try {
    const msgs = await api('GET', '/api/messages');
    if (!msgs.length) {
      container.innerHTML = '<div class="status-bar">no messages yet</div>';
      return;
    }
    container.innerHTML = msgs.map(m => `
      <div class="msg ${m.status}">
        <div class="meta"><span>#${m.id}</span><span>${m.created_at} &middot; ${m.status}</span></div>
        <div class="content">${escapeHtml(m.content)}</div>
        ${m.reply ? `<div class="reply">&#8618; ${escapeHtml(m.reply)}</div>` : ''}
      </div>
    `).join('');
  } catch(e) { container.innerHTML = '<div class="error">failed to load messages</div>'; }
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
</script>
</body>
</html>"""
