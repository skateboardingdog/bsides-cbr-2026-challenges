import hmac
import os

from flask import Blueprint, jsonify, request, session

bot_auth_bp = Blueprint("bot_auth", __name__)

INTERNAL_SECRET = os.environ["INTERNAL_SECRET"]


@bot_auth_bp.get("/chal1/internal-login")
def internal_login():
    token = request.args.get("token", "")
    if not hmac.compare_digest(token, INTERNAL_SECRET):
        return jsonify({"error": "forbidden"}), 403
    session["chal1_bot"] = True
    session["chal4_bot"] = True
    return jsonify({"ok": True})
