import { verifySolution } from "./engine.js";

export const PROGRESS_KEY = "lua-sokoban-progress";
export function restoreProgress(saved, levels) {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  if (saved._campaignNumbering !== 0) saved = Object.fromEntries(Object.entries(saved).flatMap(([id, record]) => {
    const match = /^level-(\d+)$/.exec(id);
    if (!match) return [[id, record]];
    const n = Number(match[1]);
    return n >= 1 && n <= 10 ? [[`level-${n - 1}`, record]] : [];
  }));
  const progress = {};
  for (const level of levels) {
    if (!level.goal || typeof saved[level.id]?.solution !== "string") continue;
    const result = verifySolution(level, saved[level.id].solution);
    if (result.valid) progress[level.id] = { solution: result.state.solution, moves: result.state.moves };
  }
  return progress;
}
export const levelUnlocked = (index, levels, progress) => index === 0 || Boolean(progress[levels[index - 1]?.id]);
export const campaignProofs = (levels, progress) => Object.fromEntries(levels.filter(level => level.goal).map(level => [level.id, progress[level.id]?.solution]));
