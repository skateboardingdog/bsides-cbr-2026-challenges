import json
import os

from flask import Blueprint, jsonify, request

from db import create_account, verify_account

chal2_bp = Blueprint("chal2", __name__, url_prefix="/chal2")

FLAG2 = os.environ.get("FLAG2", "skbdg{test_flag}")


@chal2_bp.post("/create-user")
def create_user():
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

    create_account("users_chal2", username, password)
    return jsonify({"status": "ok"})


@chal2_bp.post("/login")
def login():
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    if username and verify_account("users_chal2", username, password):
        resp = jsonify({"flag": FLAG2})
    else:
        resp = jsonify({"error": "invalid credentials"})
        resp.status_code = 401

    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp
