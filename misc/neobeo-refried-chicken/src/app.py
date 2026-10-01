import re
from flask import Flask, request, jsonify, send_from_directory, Response

app = Flask(__name__, static_folder="static", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 1024

FLAG = open("flag.txt").read()
MOVE_RE = re.compile(r"^[a-gx]{18}$")  # exactly 18 chars, a-g or x

@app.get("/")
def root():
    return send_from_directory(app.static_folder, "index.html")

@app.get("/src")
def src():
    with open(__file__) as f:
        return Response(f.read(), mimetype="text/plain; charset=utf-8")

@app.post("/getflag")
def getflag():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(ok=False, message="Expected JSON object"), 400

    data = payload.get("data")
    if not isinstance(data, str):
        return jsonify(ok=False, message="Expected data string in JSON object"), 400

    data = data.strip()
    if not MOVE_RE.fullmatch(data):
        return jsonify(ok=False, message="data must be 18 chars from [a-gx]"), 400

    # Split into 3 rows of 6, truncate each row at first 'x'
    rows = [data[:6], data[6:12], data[12:18]]
    tmp = [r.split("x", 1)[0] for r in rows]

    # Prevent recursive calls / illegal macro placement (your original constraints)
    if ("f" in tmp[1]) or ("g" in tmp[2]) or (("g" in tmp[1]) and ("f" in tmp[2])):
        return jsonify(ok=False, message="Recursion not allowed!"), 400

    # Expand macros f and g in row0
    if "f" in tmp[2]:
        prog = tmp[0].replace("g", tmp[2]).replace("f", tmp[1])
    else:
        prog = tmp[0].replace("f", tmp[1]).replace("g", tmp[2])

    nfcs = {
        (2, 1), (3, 1), (4, 1),
        (2, 2),
        (2, 3), (3, 3), (4, 3),
        (2, 4),         (4, 4),
        (2, 5), (3, 5), (4, 5),

        (6, 1), (7, 1), (8, 1),
                        (8, 2),
                (7, 3),
        (6, 4),
        (6, 5),
    }

    x, y, t = 4, 3, 1
    dx, dy = [1, 0, -1, 0], [0, -1, 0, 1]

    for c in prog:
        if c == "a":
            x, y = x + dx[t & 3], y + dy[t & 3]
        elif c == "b":
            x, y = x - dx[t & 3], y - dy[t & 3]
        elif c == "c":
            t += 1
        elif c == "d":
            t -= 1
        elif c == "e":
            nfcs.discard((x, y))
            if len(nfcs) == 0:
                return jsonify(ok=True, flag=FLAG), 200

        if not (0 <= x < 11 and 0 <= y < 7):
            return jsonify(ok=False, message="Out of bounds"), 200

    return jsonify(ok=False, message="There is leftover chicken"), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=1337, debug=False)
