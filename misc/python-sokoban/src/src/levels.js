import level0 from "../mylevels/level0.json" with { type: "json" };
import level1 from "../mylevels/level1.json" with { type: "json" };
import level2 from "../mylevels/level2.json" with { type: "json" };
import level3 from "../mylevels/level3.json" with { type: "json" };
import level4 from "../mylevels/level4.json" with { type: "json" };
import level5 from "../mylevels/level5.json" with { type: "json" };
import level6 from "../mylevels/level6.json" with { type: "json" };
import level7 from "../mylevels/level7.json" with { type: "json" };
import level8 from "../mylevels/level8.json" with { type: "json" };
import level9 from "../mylevels/level9.json" with { type: "json" };
import level10 from "../mylevels/level10.json" with { type: "json" };
import { SIZE, key } from "./engine.js";

export function makeLevel({
  id,
  player,
  goal,
  blocks = [],
  walls = [],
}) {
  const allWalls = new Map();
  for (let n = 0; n < SIZE; n++) {
    for (const [x, y] of [
      [n, 0],
      [n, 14],
      [0, n],
      [14, n],
    ])
      allWalls.set(key(x, y), { x, y });
  }
  for (const [x, y] of walls) allWalls.set(key(x, y), { x, y });
  return {
    id,
    player: { x: player[0], y: player[1] },
    goal: goal === null ? null : { x: goal[0], y: goal[1] },
    walls: [...allWalls.values()],
    blocks: blocks.map(([x, y, text], index) => ({
      id: `${id}-b${index}`,
      x,
      y,
      text,
    })),
  };
}
// Exported editor files may share IDs. Promote these boards into the campaign
// with distinct stable IDs, and hide their old browser-saved duplicates.
const authoredLevels = [level0, level1, level2, level3, level4, level5, level6, level7, level8, level9, level10];
export const campaignSourceIds = new Set(authoredLevels.map((level) => level.id));
export const levels = authoredLevels.map((level, index) => ({
  ...level,
  id: `level-${index}`,
}));
