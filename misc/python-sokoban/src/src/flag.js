import { parseExpression, evaluateExpression, isConstantExpression } from "./expression.js";

export const FLAG_TOKEN = "🚩";

// A separate read-only expression: it never assigns player coordinates.
export function parseFlagRead(source) {
  if (typeof source !== "string" || source.length > 128) throw new Error("Invalid flag expression.");
  const match = /^🚩 *\[([^\[\]]+)\] *$/.exec(source);
  if (!match) throw new Error("Expected flag[index].");
  const ast = parseExpression(match[1]);
  if (!isConstantExpression(ast)) throw new Error("Use an integer index.");
  return { expression: match[1], ast };
}

export function analyzeFlagReads(blocks, message = null) {
  const letters = message === null ? null : [...message];
  const grid = new Map(blocks.map(b => [`${b.x},${b.y}`, b]));
  const flagReadings = [], invalidFlagReads = [];
  for (const flag of blocks.filter(b => b.text === FLAG_TOKEN).sort((a, b) => a.y - b.y || a.x - b.x)) {
    for (const [dx, dy, orientation] of [[1, 0, "horizontal"], [0, 1, "vertical"]]) {
      const run = [flag];
      for (let x = flag.x + dx, y = flag.y + dy; grid.has(`${x},${y}`); x += dx, y += dy) run.push(grid.get(`${x},${y}`));
      const source = run.map(b => b.text).join("");
      // A loose flag or an empty opening bracket is still being assembled.
      if (!source.includes("[") || /^🚩 *\[ *$/.test(source)) continue;
      const read = { source, orientation, blockIds: run.map(b => b.id) };
      try {
        const parsed = parseFlagRead(source);
        const index = evaluateExpression(parsed.ast, {});
        if (letters !== null && (index < -letters.length || index >= letters.length)) throw new Error("String index out of range.");
        const resolvedIndex = letters === null ? null : index < 0 ? letters.length + index : index;
        flagReadings.push({ ...read, ...parsed, index, resolvedIndex, character: letters?.[resolvedIndex] ?? null });
      } catch (error) {
        invalidFlagReads.push({ ...read, error: error.message });
      }
    }
  }
  const characters = new Set(flagReadings.map(read => read.character));
  return { flagReadings, invalidFlagReads, flagCharacter: characters.size === 1 ? [...characters][0] : null };
}
