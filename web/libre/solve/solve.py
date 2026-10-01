#!/usr/bin/env python3

import requests
import io
import os
import zipfile


def zip_directory(dir_path):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(dir_path):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, dir_path)
                zf.write(file_path, arcname)
    buf.seek(0)
    return buf


def main():
    zip_buf = zip_directory("solve.odp")
    files = {"file": ("solve.odp", zip_buf, "application/octet-stream")}
    _ = requests.post("http://0.0.0.0:1337/upload", files=files)


if __name__ == "__main__":
    main()
