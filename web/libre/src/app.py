#!/usr/bin/env python3

import subprocess, tempfile, shutil
from pathlib import Path
from flask import Flask, request, abort

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/upload", methods=["POST"])
def upload():
    f = request.files.get("file")
    if not f:
        abort(400)

    tmp = tempfile.mkdtemp()
    src = Path(tmp) / "document"
    f.save(src)

    try:
        subprocess.run(
            ["soffice", "--headless", "--convert-to", "ppt", "--outdir", tmp, str(src)],
            timeout=30,
            capture_output=True,
            check=True,
        )
        ppt = (Path(tmp) / "document.ppt").read_bytes()
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        abort(500)

    shutil.rmtree(tmp, ignore_errors=True)
    return ppt, 200, {"Content-Type": "application/octet-stream"}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=1337)
