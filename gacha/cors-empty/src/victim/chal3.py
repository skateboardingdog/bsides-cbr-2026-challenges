import json
import os

from flask import Blueprint, jsonify, request

from db import create_account, verify_account

chal3_bp = Blueprint("chal3", __name__, url_prefix="/chal3")

FLAG3 = os.environ.get("FLAG3", "skbdg{test_flag}")


@chal3_bp.post("/create-user")
def create_user():
    if "application/json" not in request.headers.get("Content-Type", ""):
        return jsonify({"error": "expected application/json"}), 415

    try:
        payload = json.loads(request.get_data())
    except (TypeError, ValueError):
        payload = None
    if not isinstance(payload, dict):
        return jsonify({"error": "bad request"}), 400

    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    if not username or not password:
        return jsonify({"error": "bad request"}), 400

    create_account("users_chal3", username, password)
    return jsonify({"status": "ok"})


@chal3_bp.post("/login")
def login():
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    if username and verify_account("users_chal3", username, password):
        resp = jsonify({"flag": FLAG3})
    else:
        resp = jsonify({"error": "invalid credentials"})
        resp.status_code = 401

    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp
