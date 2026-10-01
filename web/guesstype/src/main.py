#!/usr/bin/env python3

import mimetypes
import os
from pathlib import Path
from flask import Flask, abort, request, send_from_directory, jsonify

FLAG = os.getenv("FLAG", "sk8bdg{test_flag}")

app = Flask(__name__)


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/upload", methods=["POST"])
def upload_file():
    user_file = request.files["file"]
    filename = user_file.filename

    if not filename:
        return jsonify(error="file is empty or missing"), 400

    if Path(filename).suffix != ".dog":
        return jsonify(error="i don't like that extension!"), 400

    mime_type, _ = mimetypes.guess_type(filename)
    if mime_type != "skateboarding/dog":
        return jsonify(error="i don't like that filetype!"), 400

    return {
        "message": "upload success",
        "flag": FLAG,
    }, 200


if __name__ == "__main__":
    app.run()
