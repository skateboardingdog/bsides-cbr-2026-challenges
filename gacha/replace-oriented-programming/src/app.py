import os
import random

from flask import Flask, jsonify, render_template_string, request
from werkzeug.exceptions import RequestEntityTooLarge


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024

FLAG = os.environ.get("FLAG", "skbdg{sort_of_programming}")
MAX_LINES = 10
MAX_PART_LEN = 100
MAX_RESULT_LEN = 10000
MAX_STEPS = 10000
MAX_LOOP_COUNT = 99
TEST_SEED = 0xAB2026
TEST_COUNT = 250


class BadSubmission(ValueError):
    pass


def expected_answer(s):
    return "".join(sorted(s))


def make_test_cases():
    rng = random.Random(TEST_SEED)
    cases = []
    seen = set()

    def add_case(s):
        if s not in seen:
            seen.add(s)
            cases.append(s)

    while len(cases) < TEST_COUNT:
        length = rng.randrange(1, 11)
        add_case("".join(rng.choice("abc") for _ in range(length)))
    return tuple(cases)


TEST_CASES = make_test_cases()


def validate_piece(value, label, line_no):
    if not isinstance(value, str):
        raise BadSubmission(f"line {line_no}: {label} must be a string")
    if len(value) > MAX_PART_LEN:
        raise BadSubmission(
            f"line {line_no}: {label} is longer than {MAX_PART_LEN} characters"
        )
    if any(ord(ch) < 32 or ord(ch) > 126 for ch in value):
        raise BadSubmission(f"line {line_no}: {label} must be printable ASCII")
    return value


def parse_program(payload):
    if not isinstance(payload, dict):
        raise BadSubmission("expected a JSON object")

    if isinstance(payload.get("program"), list):
        raw_program = payload["program"]
    elif isinstance(payload.get("rules"), list):
        raw_program = [
            {"type": "replace", "old": rule.get("old"), "new": rule.get("new")}
            if isinstance(rule, dict)
            else {"type": "replace", "old": rule[0], "new": rule[1]}
            for rule in payload["rules"]
            if isinstance(rule, dict) or (isinstance(rule, list) and len(rule) == 2)
        ]
    else:
        raise BadSubmission("expected JSON shaped like {\"program\": [...]}")

    line_count = 0

    def parse_nodes(raw_nodes):
        nonlocal line_count
        if not isinstance(raw_nodes, list):
            raise BadSubmission("program blocks must be lists")

        nodes = []
        for raw_node in raw_nodes:
            line_count += 1
            line_no = line_count
            if line_count > MAX_LINES:
                raise BadSubmission(f"submit at most {MAX_LINES} lines")
            if not isinstance(raw_node, dict):
                raise BadSubmission(f"line {line_no}: expected a statement object")

            node_type = raw_node.get("type")
            if node_type == "replace":
                nodes.append(
                    {
                        "type": "replace",
                        "old": validate_piece(raw_node.get("old"), "old", line_no),
                        "new": validate_piece(raw_node.get("new"), "new", line_no),
                    }
                )
            elif node_type == "loop":
                count = raw_node.get("count")
                if type(count) is not int:
                    raise BadSubmission(f"line {line_no}: loop count must be an integer")
                if count < 0 or count > MAX_LOOP_COUNT:
                    raise BadSubmission(
                        f"line {line_no}: loop count must be between 0 and {MAX_LOOP_COUNT}"
                    )
                nodes.append(
                    {
                        "type": "loop",
                        "count": count,
                        "body": parse_nodes(raw_node.get("body")),
                    }
                )
            else:
                raise BadSubmission(f"line {line_no}: unknown statement type")

        return nodes

    return parse_nodes(raw_program)


def run_replace_program(s, program):
    steps = 0

    def step():
        nonlocal steps
        steps += 1
        if steps > MAX_STEPS:
            raise BadSubmission(f"program exceeded {MAX_STEPS} execution steps")

    def execute(nodes):
        nonlocal s
        for node in nodes:
            if node["type"] == "replace":
                step()
                s = s.replace(str(node["old"]), str(node["new"]))
                if len(s.encode("utf-8")) > MAX_RESULT_LEN:
                    raise BadSubmission(
                        f"result exceeded {MAX_RESULT_LEN} bytes after replace"
                    )
            else:
                for _ in range(int(node["count"])):
                    step()
                    execute(node["body"])

    execute(program)
    return s


@app.get("/")
def index():
    return render_template_string(
        INDEX_HTML,
        max_lines=MAX_LINES,
        max_loop_count=MAX_LOOP_COUNT,
        max_part_len=MAX_PART_LEN,
        test_count=len(TEST_CASES),
    )


@app.errorhandler(RequestEntityTooLarge)
def request_too_large(_exc):
    return jsonify({"ok": False, "error": "request body is too large"}), 413


@app.post("/test")
def test_solution():
    try:
        program = parse_program(request.get_json(silent=True))

        for case_index, case in enumerate(TEST_CASES, 1):
            actual = run_replace_program(case, program)
            expected = expected_answer(case)
            if actual != expected:
                return jsonify(
                    {
                        "ok": False,
                        "message": "first failing test case",
                        "failure": {
                            "case": case,
                            "expected": expected,
                            "actual": actual,
                            "index": case_index,
                        },
                    }
                )

        return jsonify(
            {
                "ok": True,
                "message": f"passed {len(TEST_CASES)} tests",
                "flag": FLAG,
            }
        )
    except BadSubmission as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


INDEX_HTML = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>replace-oriented-programming</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #000;
      background: #fff;
      font: 16px/1.45 Arial, sans-serif;
    }
    main {
      width: min(960px, calc(100vw - 32px));
      margin: 40px auto;
    }
    h1 {
      margin: 0 0 16px;
      font-size: clamp(26px, 5vw, 48px);
      line-height: 1;
      letter-spacing: 0;
    }
    p { max-width: 760px; margin: 0 0 12px; }
    .samples {
      margin: 0 0 12px;
      font: 15px/1.45 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    }
    .code {
      margin: 24px 0 16px;
      padding: 14px 16px;
      border: 2px solid #000;
      overflow-x: auto;
      font: 15px/1.35 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      white-space: nowrap;
    }
    .code-line {
      display: flex;
      align-items: center;
      min-height: 1.55em;
    }
    .code-text {
      white-space: pre;
      flex: 0 0 auto;
    }
    .actions {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      margin-left: 14px;
      opacity: 0.55;
    }
    .code-line:hover .actions,
    .code-line:focus-within .actions {
      opacity: 1;
    }
    input.string {
      width: 11ch;
      min-width: 11ch;
      height: 1.35em;
      border: 0;
      border-radius: 0;
      padding: 0 3px;
      color: #000;
      background: #e8e8e8;
      font: inherit;
      line-height: inherit;
    }
    input.count {
      width: 3ch;
      height: 1.35em;
      border: 0;
      border-radius: 0;
      padding: 0 2px;
      color: #000;
      background: #e8e8e8;
      font: inherit;
      line-height: inherit;
      text-align: center;
    }
    input:focus, button:focus {
      outline: 2px solid #000;
      outline-offset: 2px;
    }
    button {
      border: 2px solid #000;
      border-radius: 0;
      padding: 7px 12px;
      color: #000;
      background: #fff;
      font: 700 14px/1 Arial, sans-serif;
      cursor: pointer;
    }
    button:hover { color: #fff; background: #000; }
    button:disabled {
      color: #777;
      border-color: #777;
      background: #fff;
      cursor: not-allowed;
    }
    .tool {
      min-width: 1.55em;
      height: 1.35em;
      border: 0;
      padding: 0 3px;
      background: transparent;
      font: 900 14px/1 Arial, sans-serif;
      flex: 0 0 auto;
    }
    .tool.add {
      color: #007a1f;
    }
    .tool.add:hover {
      color: #fff;
      background: #007a1f;
    }
    .tool.move {
      color: #333;
    }
    .tool.move:hover {
      color: #fff;
      background: #333;
    }
    .tool.delete {
      color: #c00000;
      font-size: 20px;
    }
    .tool.delete:hover {
      color: #fff;
      background: #c00000;
    }
    .tool:disabled {
      color: #777;
      background: transparent;
      cursor: not-allowed;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin: 0 0 16px;
    }
    #status {
      min-height: 72px;
      padding: 14px;
      border: 2px solid #000;
      font: 15px/1.45 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .muted { color: #333; }
  </style>
</head>
<body>
  <main>
    <h1>replace-oriented-programming</h1>
    <p>
      Write a replacement oriented Python program to sort a string.<br>
      Each input matches <code>[abc]{1,10}</code>. Programs may contain at most
      <strong>{{ max_lines }}</strong> lines, including loop statements and their bodies.
    </p>
    <p>Sample test cases:</p>
    <pre class="samples">sort_string("cabbaa")     -> "aaabbc"
sort_string("c")          -> "c"
sort_string("acbacbacba") -> "aaaabbbccc"</pre>

    <div class="code" aria-label="replace program editor">
      <div class="code-line"><span class="code-text">def sort_string(s):</span></div>
      <div id="rules"></div>
      <div class="code-line"><span class="code-text">    return s</span></div>
    </div>

    <div class="controls">
      <button id="test" type="button">test</button>
    </div>

    <div id="status" aria-live="polite">waiting for rules</div>
  </main>

  <script>
    const maxLines = {{ max_lines }};
    const maxLoopCount = {{ max_loop_count }};
    const rulesEl = document.getElementById("rules");
    const testBtn = document.getElementById("test");
    const statusEl = document.getElementById("status");
    const blockedChars = new Set(["'", "\\\\"]);
    const program = [{type: "replace", old: "...", new: "..."}];

    function cleanInputValue(value) {
      return Array.from(value).filter(ch => !blockedChars.has(ch)).join("");
    }

    function cleanCountValue(value) {
      const digits = value.replace(/\\D/g, "").slice(0, 2);
      if (digits === "") return "";
      return String(Math.min(maxLoopCount, Number(digits)));
    }

    function lineCount(nodes) {
      return nodes.reduce((total, node) => {
        return total + 1 + (node.type === "loop" ? lineCount(node.body) : 0);
      }, 0);
    }

    function canAddLine() {
      return lineCount(program) < maxLines;
    }

    function newNode(type) {
      if (type === "loop") return {type: "loop", count: "1", body: []};
      return {type: "replace", old: "", new: ""};
    }

    function makeText(value) {
      const span = document.createElement("span");
      span.textContent = value;
      return span;
    }

    function makeStringInput(value, label, onChange) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "string";
      input.maxLength = {{ max_part_len }};
      input.placeholder = "...";
      input.setAttribute("aria-label", label);
      input.spellcheck = false;
      input.value = cleanInputValue(value || "");
      input.addEventListener("beforeinput", event => {
        if (event.data && Array.from(event.data).some(ch => blockedChars.has(ch))) {
          event.preventDefault();
        }
      });
      input.addEventListener("input", () => {
        const clean = cleanInputValue(input.value);
        if (input.value !== clean) input.value = clean;
        onChange(input.value);
      });
      return input;
    }

    function makeCountInput(node) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "count";
      input.inputMode = "numeric";
      input.maxLength = 2;
      input.placeholder = "0";
      input.setAttribute("aria-label", "loop count");
      input.value = cleanCountValue(String(node.count ?? "1"));
      node.count = input.value;
      input.addEventListener("beforeinput", event => {
        if (event.data && /\\D/.test(event.data)) event.preventDefault();
      });
      input.addEventListener("input", () => {
        const clean = cleanCountValue(input.value);
        if (input.value !== clean) input.value = clean;
        node.count = input.value;
      });
      return input;
    }

    function makeTool(label, className, title, onClick, disabled) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tool " + className;
      button.textContent = label;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.disabled = Boolean(disabled);
      button.addEventListener("click", onClick);
      return button;
    }

    function insertNode(siblings, index, type) {
      if (!canAddLine()) return;
      siblings.splice(index + 1, 0, newNode(type));
      render();
    }

    function appendNode(siblings, type) {
      if (!canAddLine()) return;
      siblings.push(newNode(type));
      render();
    }

    function deleteNode(siblings, index) {
      siblings.splice(index, 1);
      render();
    }

    function moveNode(siblings, index, offset) {
      const target = index + offset;
      if (target < 0 || target >= siblings.length) return;
      [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
      render();
    }

    function indentNode(siblings, index) {
      if (index === 0 || siblings[index - 1].type !== "loop") return;
      const [node] = siblings.splice(index, 1);
      siblings[index - 1].body.push(node);
      render();
    }

    function outdentNode(siblings, index, parent) {
      if (!parent) return;
      const [node] = siblings.splice(index, 1);
      parent.siblings.splice(parent.index + 1, 0, node);
      render();
    }

    function makeActions(siblings, index, parent) {
      const actions = document.createElement("span");
      actions.className = "actions";
      const addDisabled = !canAddLine();
      actions.append(
        makeTool("+s", "add", "add replace below", () => insertNode(siblings, index, "replace"), addDisabled),
        makeTool("+for", "add", "add loop below", () => insertNode(siblings, index, "loop"), addDisabled),
        makeTool("↑", "move", "move up", () => moveNode(siblings, index, -1), index === 0),
        makeTool("↓", "move", "move down", () => moveNode(siblings, index, 1), index === siblings.length - 1),
        makeTool("→", "move", "indent into previous loop", () => indentNode(siblings, index), index === 0 || siblings[index - 1].type !== "loop"),
        makeTool("←", "move", "outdent from loop", () => outdentNode(siblings, index, parent), !parent),
        makeTool("−", "delete", "delete line", () => deleteNode(siblings, index), false),
      );
      return actions;
    }

    function makeEmptyBlockLine(siblings, indent) {
      const line = document.createElement("div");
      line.className = "code-line";
      const code = document.createElement("span");
      code.className = "code-text";
      code.textContent = "    ".repeat(indent) + "pass";
      const actions = document.createElement("span");
      actions.className = "actions";
      const addDisabled = !canAddLine();
      actions.append(
        makeTool("+s", "add", "add replace here", () => appendNode(siblings, "replace"), addDisabled),
        makeTool("+for", "add", "add loop here", () => appendNode(siblings, "loop"), addDisabled),
      );
      line.append(code, actions);
      return line;
    }

    function makeReplaceLine(node, siblings, index, parent, indent) {
      const line = document.createElement("div");
      line.className = "code-line";
      const code = document.createElement("span");
      code.className = "code-text";
      code.append(
        makeText("    ".repeat(indent) + "s = s.replace('"),
        makeStringInput(node.old, "old string", value => { node.old = value; }),
        makeText("', '"),
        makeStringInput(node.new, "new string", value => { node.new = value; }),
        makeText("')")
      );
      line.append(code, makeActions(siblings, index, parent));
      return line;
    }

    function makeLoopLine(node, siblings, index, parent, indent) {
      const line = document.createElement("div");
      line.className = "code-line";
      const code = document.createElement("span");
      code.className = "code-text";
      code.append(
        makeText("    ".repeat(indent) + "for _ in range("),
        makeCountInput(node),
        makeText("):")
      );
      line.append(code, makeActions(siblings, index, parent));
      return line;
    }

    function renderNodes(nodes, indent, parent) {
      if (!nodes.length) {
        rulesEl.append(makeEmptyBlockLine(nodes, indent));
        return;
      }

      nodes.forEach((node, index) => {
        if (node.type === "loop") {
          rulesEl.append(makeLoopLine(node, nodes, index, parent, indent));
          renderNodes(node.body, indent + 1, {siblings: nodes, index});
        } else {
          rulesEl.append(makeReplaceLine(node, nodes, index, parent, indent));
        }
      });
    }

    function render() {
      rulesEl.textContent = "";
      renderNodes(program, 1, null);
    }

    function collectRules() {
      return collectNodes(program);
    }

    function collectNodes(nodes) {
      return nodes.map(node => {
        if (node.type === "loop") {
          return {
            type: "loop",
            count: Number(node.count || "0"),
            body: collectNodes(node.body),
          };
        }
        return {type: "replace", old: node.old, new: node.new};
      });
    }

    testBtn.addEventListener("click", async () => {
      statusEl.textContent = "running tests";
      testBtn.disabled = true;
      try {
        const response = await fetch("/test", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({program: collectRules()}),
        });
        const data = await response.json();
        if (!response.ok) {
          statusEl.textContent = data.error || "bad submission";
        } else if (data.ok) {
          statusEl.textContent = data.message + "\\n" + data.flag;
        } else {
          const f = data.failure;
          statusEl.textContent =
            data.message + "\\n" +
            "input:    " + JSON.stringify(f.case) + "\\n" +
            "expected: " + JSON.stringify(f.expected) + "\\n" +
            "actual:   " + JSON.stringify(f.actual);
        }
      } catch (err) {
        statusEl.textContent = "request failed";
      } finally {
        testBtn.disabled = false;
      }
    });

    render();
  </script>
</body>
</html>
"""


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
