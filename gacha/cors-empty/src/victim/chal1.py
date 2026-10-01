import os

from flask import Blueprint, jsonify, make_response, request, session

chal1_bp = Blueprint("chal1", __name__, url_prefix="/chal1")

FLAG1 = os.environ.get("FLAG1", "skbdg{test_flag}")


@chal1_bp.post("/secret")
def secret():
    if not session.get("chal1_bot", False):
        return make_response(jsonify({"error": "unauthenticated"}), 403)

    resp = make_response(jsonify({"flag": FLAG1}))

    for key, value in request.form.items():
        if 0 < len(key) <= 100 and len(value) <= 256:
            resp.headers[key] = value

    return resp


@chal1_bp.get("/healthcheck")
def healthcheck():
    resp = make_response(jsonify({"healthy": "OK"}))
    return resp
