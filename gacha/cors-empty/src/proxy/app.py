import hmac
import json
import os
import time

import requests
from flask import Flask, Response, jsonify, redirect, request

import db

VICTIM_INTERNAL_URL = os.environ.get("VICTIM_INTERNAL_URL", "http://victim")
RENDER_BASE_URL = "http://usercontent.example.com"
RENDER_BASE_URLS = {4: "http://usercontent.example.net"}
INTERNAL_SECRET = os.environ["INTERNAL_SECRET"]

TRACE_MAX_ROWS = 50
UPSTREAM_TIMEOUT_SECONDS = 10

_TRACE_EXCLUDED_PATHS = {"/chal1/internal-login"}

_HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",
    "host",
    "content-encoding",
}

_HIDDEN_REQUEST_HEADERS = {"cookie"}
_HIDDEN_RESPONSE_HEADERS = {"set-cookie"}

app = Flask(__name__)


def _authorized():
    expected = f"Bearer {INTERNAL_SECRET}"
    return hmac.compare_digest(request.headers.get("Authorization", ""), expected)


def _header_dict(items, hidden_names):
    result = {}
    for key, value in items:
        result[key] = "<hidden>" if key.lower() in hidden_names else value
    return result


@app.post("/internal/register-visit")
def internal_register_visit():
    if not _authorized():
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    submission_id = data.get("submission_id")
    token = data.get("token")
    if not isinstance(submission_id, str) or not isinstance(token, str):
        return jsonify({"error": "invalid request"}), 400
    db.register_visit_token(token, submission_id)
    return jsonify({"ok": True})


@app.get("/internal/tag-visit/<token>/<submission_id>/<int:challenge>")
def internal_tag_visit(token, submission_id, challenge):
    if db.resolve_visit_token(token) != submission_id:
        return jsonify({"error": "forbidden"}), 403
    db.open_lease(request.remote_addr, submission_id)
    base = RENDER_BASE_URLS.get(challenge, RENDER_BASE_URL)
    return redirect(f"{base}/render/{submission_id}")


@app.post("/internal/close-lease")
def internal_close_lease():
    if not _authorized():
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    submission_id = data.get("submission_id")
    if not isinstance(submission_id, str):
        return jsonify({"error": "invalid request"}), 400
    db.close_lease(submission_id)
    return jsonify({"ok": True})


@app.get("/internal/requests/<submission_id>")
def internal_requests(submission_id):
    if not _authorized():
        return jsonify({"error": "forbidden"}), 403
    rows = db.query_requests_for_submission(submission_id, limit=TRACE_MAX_ROWS)
    for row in rows:
        row["request_headers"] = json.loads(row["request_headers"])
        row["response_headers"] = json.loads(row["response_headers"])
    return jsonify({"requests": rows})


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.route(
    "/",
    defaults={"path": ""},
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
@app.route(
    "/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]
)
def proxy_all(path):
    start_ms = int(time.time() * 1000)
    request_path = "/" + path
    body = request.get_data()

    target_url = f"{VICTIM_INTERNAL_URL}{request_path}"
    if request.query_string:
        target_url += "?" + request.query_string.decode("utf-8", errors="replace")

    fwd_headers = {
        k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP_HEADERS
    }

    try:
        upstream = requests.request(
            request.method,
            target_url,
            headers=fwd_headers,
            data=body,
            allow_redirects=False,
            timeout=UPSTREAM_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return jsonify({"error": "upstream unreachable"}), 502

    resp_headers = [
        (k, v)
        for k, v in upstream.raw.headers.items()
        if k.lower() not in _HOP_BY_HOP_HEADERS
    ]
    response = Response(
        upstream.content,
        status=upstream.status_code,
        headers=resp_headers,
    )

    if request_path.startswith("/chal") and request_path not in _TRACE_EXCLUDED_PATHS:
        try:
            db.log_request(
                {
                    "ts_ms": start_ms,
                    "submission_id": db.resolve_lease(
                        request.remote_addr, start_ms
                    ),
                    "method": request.method,
                    "path": request_path,
                    "query_string": request.query_string.decode(
                        "utf-8", errors="replace"
                    ),
                    "remote_addr": request.remote_addr or "",
                    "request_headers": json.dumps(
                        _header_dict(request.headers.items(), _HIDDEN_REQUEST_HEADERS)
                    ),
                    "status": upstream.status_code,
                    "response_headers": json.dumps(
                        _header_dict(upstream.headers.items(), _HIDDEN_RESPONSE_HEADERS)
                    ),
                }
            )
        except Exception:
            pass

    return response


db.init_db()
db.start_purge_thread()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80)
