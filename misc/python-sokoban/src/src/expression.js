// Python's integer-expression subset. ASTs stay JSON-serializable; arithmetic uses
// bounded BigInts internally so no intermediate result silently loses precision.
const LIMIT = BigInt(Number.MAX_SAFE_INTEGER);
// Python integer literals, including separators and optional separators directly
// after a base prefix. A nonzero decimal cannot have a leading zero.
const integer = /^(?:[1-9](?:_?[0-9])*|0(?:_?0)*|0[xX](?:_?[0-9a-fA-F])+|0[oO](?:_?[0-7])+|0[bB](?:_?[01])+)$/;
function checked(value) {
  if (value < -LIMIT || value > LIMIT) throw new RangeError("Integer overflow.");
  return value;
}

export function parseExpression(source) {
  if (typeof source !== "string" || source.length > 128) throw new Error("Expression is too long.");
  const tokens = [];
  let rest = source;
  while (rest.length) {
    const match = /^([ \t\f]+|\r?\n|\r|[0-9][a-zA-Z_0-9]*|[a-zA-Z_][a-zA-Z_0-9]*|[+-])/.exec(rest);
    if (!match) throw new Error("Unrecognized expression.");
    rest = rest.slice(match[0].length);
    const token = match[0];
    if (/^[\r\n]/.test(token) && tokens.length && rest.trim()) throw new Error("Unexpected newline.");
    if (/^[ \t\f\r\n]+$/.test(token)) continue;
    tokens.push(token);
  }
  let cursor = 0;
  function operand() {
    const token = tokens[cursor++];
    if (token === "+" || token === "-") return { type: "unary", operator: token, value: operand() };
    if (token === "x" || token === "y") return { type: "variable", name: token };
    if (token !== undefined && integer.test(token)) return { type: "number", value: BigInt(token.replaceAll("_", "")).toString() };
    throw new Error("Incomplete expression.");
  }
  let tree = operand();
  while (tokens[cursor] === "+" || tokens[cursor] === "-") {
    const operator = tokens[cursor++];
    tree = { type: "binary", operator, left: tree, right: operand() };
  }
  if (cursor !== tokens.length) throw new Error("Unexpected token.");
  return tree;
}

export function isConstantExpression(tree) {
  if (tree.type === "variable") return false;
  if (tree.type === "number") return true;
  if (tree.type === "unary") return isConstantExpression(tree.value);
  return isConstantExpression(tree.left) && isConstantExpression(tree.right);
}

export function evaluateExpression(tree, position) {
  function evaluate(node) {
    if (node.type === "number") return checked(BigInt(node.value));
    if (node.type === "variable") return checked(BigInt(position[node.name]));
    if (node.type === "unary") {
      if (node.operator !== "+" && node.operator !== "-") throw new Error("Unknown operator.");
      const value = evaluate(node.value);
      return checked(node.operator === "-" ? -value : value);
    }
    if (node.type !== "binary" || (node.operator !== "+" && node.operator !== "-")) throw new Error("Unknown operator.");
    const left = evaluate(node.left), right = evaluate(node.right);
    return checked(node.operator === "-" ? left - right : left + right);
  }
  return Number(evaluate(tree));
}
