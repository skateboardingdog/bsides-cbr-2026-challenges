import os

from flask import Blueprint, jsonify, request, session

from db import create_account, verify_account

chal4_bp = Blueprint("chal4", __name__, url_prefix="/chal4")

FLAG4 = os.environ.get("FLAG4", "skbdg{test_flag}")


@chal4_bp.route("/create-user", methods=["GET", "POST"])
def create_user():
    if not session.get("chal4_bot", False):
        return jsonify({"error": "unauthenticated"}), 403

    username = request.args.get("username", "").strip()
    password = request.args.get("password", "")
    if not username or not password:
        return jsonify({"error": "bad request"}), 400

    create_account("users_chal4", username, password)
    return jsonify({"status": "ok"})


@chal4_bp.post("/login")
def login():
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    if username and verify_account("users_chal4", username, password):
        resp = jsonify({"flag": FLAG4})
    else:
        resp = jsonify({"error": "invalid credentials"})
        resp.status_code = 401

    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp
