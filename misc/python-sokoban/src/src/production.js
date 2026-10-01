import "@fontsource/dm-mono/latin-400.css";
import "@fontsource/kalam/latin-400.css";
import "./style.css";
import { createState, step, withFlagMessage, ENGINE_VERSION } from "./engine.js";
import { levels } from "./levels.js";
import { renderBoard } from "./renderer.js";
import { installMusic } from "./music.js";
import { createWinTransition } from "./win-transition.js";
import { flagIcon } from "./flag-sprite.js";
import { playShell } from "./play-shell.js";
import { PROGRESS_KEY, restoreProgress, levelUnlocked, campaignProofs } from "./campaign-progress.js";
import { decryptFlag } from "./flag-transport.js";

const $ = selector => document.querySelector(selector);
let progress = {};
try { progress = restoreProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY)), levels); } catch { /* Storage is optional. */ }
const persist = () => { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...progress, _campaignNumbering: 0 })); } catch { /* Session progress still works. */ } };
persist();
const requested = levels.findIndex(level => level.id === location.hash.slice(1));
const firstUnsolved = Math.max(0, levels.findIndex(level => !progress[level.id]));
let index = requested >= 0 && levelUnlocked(requested, levels, progress) ? requested : firstUnsolved;
let state = createState(levels[index]), history = [], redoHistory = [], showControls = index < 2;
let flagMessage = null, flagRequest = null, flagStatus = null, touchStart = null;
$("#app").innerHTML = playShell;
const board = $("#board"), transition = createWinTransition(board), music = installMusic($("#music-button"));
const announce = text => { $("#announcement").textContent = text; };
const lockIcon = '<svg class="level-lock" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 9V6Q6 2 10 2Q14 2 14 6V9M4 9L16 8.6L16 17L4.4 17.4ZM10 12V14"/></svg>';

function render(movement = null) {
  board.innerHTML = renderBoard(state, movement);
  board.dataset.status = state.status; board.dataset.moves = state.moves;
  board.dataset.x = state.player.x; board.dataset.y = state.player.y;
  board.classList.toggle("rules-applying", Boolean(movement && (state.rules.length || state.flagReadings.length)));
  $(".game").classList.toggle("is-dead", state.status === "dead");
  $("#control-guide").hidden = !showControls;
  $("#info-button").setAttribute("aria-expanded", String(showControls));
  $("#info-button").setAttribute("aria-label", showControls ? "Hide controls" : "Show controls");
  $(".levels").innerHTML = levels.map((level, i) => {
    const unlocked = levelUnlocked(i, levels, progress);
    const icon = !unlocked ? lockIcon : i === 10 ? `<span class="level-flag" aria-hidden="true">${flagIcon()}</span>` : '<span class="level-dot" aria-hidden="true"></span>';
    return `<button data-level="${i}" aria-label="Level ${i}" aria-description="${!unlocked ? 'Locked' : progress[level.id] ? 'Solved' : i === 10 ? 'Flag playground' : 'Unsolved'}" aria-current="${i === index ? 'step' : 'false'}" ${unlocked ? '' : 'disabled'} class="${progress[level.id] ? 'completed' : ''}">${icon}</button>`;
  }).join("");
  const access = $("#flag-access");
  access.hidden = index !== 10 || flagMessage !== null || !flagStatus;
  access.querySelector("span").textContent = flagStatus === "loading" ? "Opening…" : "Couldn’t open the flag.";
  access.querySelector("button").hidden = flagStatus !== "error";
}

async function openFlag() {
  if (flagMessage !== null || flagRequest) return;
  flagStatus = "loading"; render();
  flagRequest = (async () => {
    try {
      const response = await fetch("/api/flag", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engineVersion: ENGINE_VERSION, solutions: campaignProofs(levels, progress) }),
        cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error("Verification failed.");
      flagMessage = await decryptFlag(await response.json());
      flagStatus = null;
      if (index === 10) state = withFlagMessage(state, flagMessage);
    } catch { flagStatus = "error"; }
    finally { flagRequest = null; if (index === 10) render(); }
  })();
  await flagRequest;
}
function loadLevel(next, preserveTransition = false) {
  if (!Number.isInteger(next) || next < 0 || next >= levels.length || !levelUnlocked(next, levels, progress)) {
    window.history.replaceState(null, "", `#${levels[index].id}`); return;
  }
  if (!preserveTransition) transition.cancel();
  index = next; history = []; redoHistory = []; touchStart = null; showControls = index < 2;
  state = createState(levels[index], { flagMessage: index === 10 ? flagMessage : null });
  window.history.replaceState(null, "", `#${levels[index].id}`);
  render(); board.focus({ preventScroll: true }); announce(`Level ${index}.`);
  if (index === 10) void openFlag();
}
function move(action) {
  if (transition.active) return;
  const result = step(state, action);
  if (!result.moved) return;
  history.push(state); redoHistory = []; state = result.state;
  renderMove(result.movement);
}
function renderMove(movement = null) {
  if (state.status === "won" && (!progress[state.levelId] || state.moves < progress[state.levelId].moves)) {
    progress[state.levelId] = { moves: state.moves, solution: state.solution }; persist();
  }
  render(movement);
  announce(state.status === "dead" ? `${state.deathReason} Z to undo. R to reset.` : state.status === "won" ? "Level complete." : `x ${state.player.x}, y ${state.player.y}.`);
  if (state.status === "won") void transition.play(state.goal, () => {
    if (index < levels.length - 1) loadLevel(index + 1, true);
    return state.goal;
  });
}
function undo() {
  transition.cancel();
  if (!history.length) return;
  redoHistory.push({ state, history: [...history] });
  state = history.pop();
  if (index === 10) state = withFlagMessage(state, flagMessage);
  render();
}
function redo() {
  if (!redoHistory.length) return;
  transition.cancel();
  ({ state, history } = redoHistory.pop());
  if (index === 10) state = withFlagMessage(state, flagMessage);
  renderMove();
}
function reset() {
  transition.cancel();
  if (!state.moves) return;
  // Keep earlier redos too, so Y can restore a reset and then any undone moves.
  const savedRedoHistory = [...redoHistory, { state, history }];
  loadLevel(index);
  redoHistory = savedRedoHistory;
}
async function fullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { announce("Fullscreen is unavailable in this browser."); }
}
if (!document.fullscreenEnabled) $("#fullscreen-button").hidden = true;
document.addEventListener("fullscreenchange", () => $("#fullscreen-button").setAttribute("aria-label", document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen"));
$("#app").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  if (button.closest("#flag-access")) { void openFlag(); return; }
  if (button.dataset.level !== undefined) { loadLevel(Number(button.dataset.level)); return; }
  if (button.dataset.action === "music") music.toggle();
  if (button.dataset.action === "fullscreen") void fullscreen();
  if (button.dataset.action === "info") { showControls = !showControls; render(); }
});
const controls = { ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R", w: "U", a: "L", s: "D", d: "R" };
window.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const lower = event.key.toLowerCase(), action = controls[event.key] || controls[lower];
  if (action) { event.preventDefault(); move(action); }
  else if (lower === "z") { event.preventDefault(); undo(); }
  else if (lower === "y") { event.preventDefault(); redo(); }
  else if (lower === "r") { event.preventDefault(); reset(); }
  else if (lower === "m") { event.preventDefault(); if (!event.repeat) music.toggle(); }
  else if (lower === "f") { event.preventDefault(); void fullscreen(); }
});
board.addEventListener("pointerdown", event => {
  if (event.pointerType !== "touch") return;
  touchStart = { x: event.clientX, y: event.clientY }; board.setPointerCapture(event.pointerId);
});
board.addEventListener("pointerup", event => {
  if (!touchStart) return;
  const dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y; touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) >= 16) move(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "R" : "L" : dy > 0 ? "D" : "U");
});
board.addEventListener("pointercancel", () => { touchStart = null; });
window.addEventListener("hashchange", () => loadLevel(levels.findIndex(level => level.id === location.hash.slice(1))));
const observer = new ResizeObserver(() => {
  const stage = $(".stage"), style = getComputedStyle(stage);
  document.documentElement.style.setProperty("--stage-size", `${Math.max(0, stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))}px`);
  const gap = board.getBoundingClientRect().left;
  document.documentElement.style.setProperty("--guide-center-x", `${gap / 2}px`);
  $("#control-guide").classList.toggle("guide-below", gap < 208);
});
observer.observe($(".stage")); observer.observe(board);
loadLevel(index);
