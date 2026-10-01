import { parseExpression, evaluateExpression } from "./expression.js";
import { FLAG_TOKEN, analyzeFlagReads } from "./flag.js";

export const SIZE = 15;
export const BLOCK_TOKENS = Object.freeze(["x", "y", "=", ..."0123456789", "+", "-", " ", FLAG_TOKEN, "[", "]"]);
export const ENGINE_VERSION = 10;
export const DIRECTIONS = Object.freeze({
  U: [0, -1],
  D: [0, 1],
  L: [-1, 0],
  R: [1, 0],
});
export const key = (x, y) => `${x},${y}`;
const inside = (p) =>
  p &&
  Number.isInteger(p.x) &&
  Number.isInteger(p.y) &&
  p.x >= 0 &&
  p.y >= 0 &&
  p.x < SIZE &&
  p.y < SIZE;

export function validateLevel(level) {
  if (!level || !Array.isArray(level.walls) || !Array.isArray(level.blocks))
    throw new Error("Invalid level data.");
  if (!inside(level.player) || (level.goal !== null && !inside(level.goal)))
    throw new Error("Invalid player or goal.");
  const occupied = new Set();
  for (const wall of level.walls) {
    if (!inside(wall) || occupied.has(key(wall.x, wall.y)))
      throw new Error("Invalid or duplicate wall.");
    occupied.add(key(wall.x, wall.y));
  }
  for (let n = 0; n < SIZE; n++) {
    for (const [x, y] of [
      [n, 0],
      [n, SIZE - 1],
      [0, n],
      [SIZE - 1, n],
    ]) {
      if (!occupied.has(key(x, y)))
        throw new Error("Levels must have a complete outside wall.");
    }
  }
  if (level.goal && occupied.has(key(level.goal.x, level.goal.y)))
    throw new Error("Goal is inside a wall.");
  const ids = new Set();
  for (const block of level.blocks) {
    if (
      !inside(block) ||
      occupied.has(key(block.x, block.y)) ||
      typeof block.id !== "string" ||
      ids.has(block.id) ||
      typeof block.text !== "string" ||
      !BLOCK_TOKENS.includes(block.text)
    )
      throw new Error("Invalid or overlapping block.");
    occupied.add(key(block.x, block.y));
    ids.add(block.id);
  }
  if (occupied.has(key(level.player.x, level.player.y)))
    throw new Error("Player is inside an obstacle.");
  return true;
}

// Every x/y block can begin a rule. Consume its remaining uninterrupted row/column.
export function analyzeRules(blocks) {
  const grid = new Map(blocks.map((b) => [key(b.x, b.y), b]));
  const rules = [];
  const invalidRules = [];
  for (const start of [...blocks].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (start.text !== "x" && start.text !== "y") continue;
    for (const [dx, dy, orientation] of [
      [1, 0, "horizontal"],
      [0, 1, "vertical"],
    ]) {
      const run = [start];
      let next = grid.get(key(start.x + dx, start.y + dy));
      while (next) {
        run.push(next);
        next = grid.get(key(next.x + dx, next.y + dy));
      }
      const source = run.map((b) => b.text).join("");
      // Loose blocks are not errors. A run that attempts an assignment is.
      if (!source.includes("=")) continue;
      const match = /^([xy]) *(\+=|=)(.*)$/.exec(source);
      // A bare assignment is still being assembled, not an invalid expression.
      if (match && !match[3].trim()) continue;
      const rule = { axis: start.text, operator: match?.[2] ?? "=", expression: match?.[3] ?? "",
        source, orientation, blockIds: run.map((b) => b.id) };
      try {
        if (!match) throw new Error("Expected x or y followed by = or += and an expression.");
        const expression = parseExpression(rule.expression);
        rules.push({
          ...rule,
          // Normalize += into the resulting coordinate expression. The engine,
          // solver and rail renderer all share its exact arithmetic/semantics.
          ast: rule.operator === "+="
            ? { type: "binary", operator: "+", left: { type: "variable", name: rule.axis }, right: expression }
            : expression,
        });
      } catch (error) {
        invalidRules.push({ ...rule, error: error.message });
      }
    }
  }
  return { rules, invalidRules };
}

export function findRules(blocks) { return analyzeRules(blocks).rules; }

function analyzeBoard(blocks, flagMessage = null) {
  const { flagReadings, invalidFlagReads, flagCharacter } = analyzeFlagReads(blocks, flagMessage);
  const { rules, invalidRules } = analyzeRules(blocks);
  return { rules, invalidRules: [...invalidRules, ...invalidFlagReads], flagReadings, flagCharacter };
}

export function createState(level, { flagMessage = null } = {}) {
  validateLevel(level);
  return {
    levelId: level.id,
    flagMessage,
    walls: level.walls.map((w) => ({ ...w })),
    blocks: level.blocks.map((b) => ({ ...b })),
    goal: level.goal ? { ...level.goal } : null,
    player: { ...level.player },
    status:
      level.goal && level.player.x === level.goal.x && level.player.y === level.goal.y
        ? "won"
        : "playing",
    moves: 0,
    solution: "",
    ...analyzeBoard(level.blocks, flagMessage),
    deathReason: null,
  };
}

export function withFlagMessage(state, flagMessage) {
  return { ...state, flagMessage, ...analyzeBoard(state.blocks, flagMessage) };
}

// Pure transition: callers keep previous states for undo. Never mutate input state.
export function step(state, direction) {
  if (!Object.hasOwn(DIRECTIONS, direction))
    throw new Error("Action must be U, D, L, or R.");
  if (state.status !== "playing")
    return { state, moved: false, event: state.status };
  const [dx, dy] = DIRECTIONS[direction];
  const walls = new Set(state.walls.map((w) => key(w.x, w.y)));
  const grid = new Map(state.blocks.map((b) => [key(b.x, b.y), b]));
  const candidate = { x: state.player.x + dx, y: state.player.y + dy };
  let cursor = { ...candidate };
  const pushed = new Set();
  while (grid.has(key(cursor.x, cursor.y))) {
    pushed.add(grid.get(key(cursor.x, cursor.y)).id);
    cursor = { x: cursor.x + dx, y: cursor.y + dy };
  }
  if (!inside(cursor) || walls.has(key(cursor.x, cursor.y)))
    return { state, moved: false, event: "blocked" };
  const blocks = state.blocks.map((b) =>
    pushed.has(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b,
  );
  const analysis = analyzeBoard(blocks, state.flagMessage);
  const { rules } = analysis;
  const results = { x: [], y: [] };
  const evaluations = [];
  let deathReason = null;
  for (const rule of rules) {
    let value;
    try { value = evaluateExpression(rule.ast, candidate); }
    catch {
      deathReason = "That expression goes outside the exact integer range.";
      evaluations.push({ source: rule.source, axis: rule.axis, value: null, blockIds: rule.blockIds });
      continue;
    }
    results[rule.axis].push(value);
    evaluations.push({
      source: rule.source,
      axis: rule.axis,
      value,
      blockIds: rule.blockIds,
    });
  }
  const player = { ...candidate };
  for (const axis of ["x", "y"]) {
    const values = results[axis];
    if (!values.length) continue;
    if (
      values.some(
        (value) => !Number.isFinite(value) || !Number.isInteger(value),
      )
    ) {
      deathReason = "That expression doesn’t land on a whole-number square.";
    } else if (values.some((value) => value !== values[0])) {
      deathReason = `Two rules disagree about your ${axis} coordinate.`;
    } else player[axis] = values[0];
  }
  if (!deathReason && (!inside(player) || walls.has(key(player.x, player.y))))
    deathReason = "You landed in a wall. Even a little logic has its limits.";
  if (!deathReason && blocks.some((b) => b.x === player.x && b.y === player.y))
    deathReason = "You landed inside a block. Two things can’t share a square.";
  const status = deathReason
    ? "dead"
    : state.goal && player.x === state.goal.x && player.y === state.goal.y
      ? "won"
      : "playing";
  const teleported = player.x !== candidate.x || player.y !== candidate.y;
  return {
    state: {
      ...state,
      blocks,
      ...analysis,
      player,
      status,
      deathReason,
      moves: state.moves + 1,
      solution: state.solution + direction,
    },
    moved: true,
    movement: candidate,
    evaluations,
    event:
      status === "playing"
        ? teleported
          ? "teleport"
          : pushed.size
            ? "push"
            : "move"
        : status,
  };
}

// Use trusted level data on the server; never trust a client's board or claimed state.
export function verifySolution(level, solution, { maxMoves = 10000 } = {}) {
  if (
    typeof solution !== "string" ||
    solution.length > maxMoves ||
    !/^[UDLR]*$/.test(solution)
  ) {
    return {
      valid: false,
      reason: `Use at most ${maxMoves} UDLR characters.`,
    };
  }
  let state = createState(level);
  for (let index = 0; index < solution.length; index++) {
    if (state.status !== "playing")
      return {
        valid: false,
        reason: "Input continues after the game ended.",
        index,
        state,
      };
    state = step(state, solution[index]).state;
    if (state.status === "dead")
      return { valid: false, reason: state.deathReason, index, state };
  }
  return {
    valid: state.status === "won",
    reason: state.status === "won" ? null : state.goal ? "The goal was not reached." : "This level has no goal.",
    state,
    engineVersion: ENGINE_VERSION,
  };
}
