import { SIZE, key } from "./engine.js";
import { isConstantExpression } from "./expression.js";
import { boneDrawing } from "./bone.js";
import { FLAG_TOKEN } from "./flag.js";
import { flagDrawing } from "./flag-sprite.js";

const CELL = 36;
const OFFSET = 27;
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const jitter = (x, y, frame, seed = 0) =>
  ((Math.sin(x * 127.1 + y * 311.7 + frame * 71.9 + seed * 19.3) * 43758.5453) %
    1) *
  0.72;
const point = (x, y, frame) =>
  `${(OFFSET + x * CELL + jitter(x, y, frame)).toFixed(2)},${(OFFSET + y * CELL + jitter(x, y, frame, 3)).toFixed(2)}`;

function wallDrawing(walls, frame) {
  const set = new Set(walls.map((w) => key(w.x, w.y)));
  let fill = "",
    edges = "";
  for (const { x, y } of walls) {
    const a = point(x, y, frame),
      b = point(x + 1, y, frame),
      c = point(x + 1, y + 1, frame),
      d = point(x, y + 1, frame);
    const sides = [
      [a, b, !set.has(key(x, y - 1)) ? point(x + 0.52, y, frame) : null],
      [b, c, !set.has(key(x + 1, y)) ? point(x + 1, y + 0.48, frame) : null],
      [c, d, !set.has(key(x, y + 1)) ? point(x + 0.46, y + 1, frame) : null],
      [d, a, !set.has(key(x - 1, y)) ? point(x, y + 0.54, frame) : null],
    ];
    // Fill follows the exact same crooked boundary as the outline. Interior
    // edges remain straight between shared vertices, so adjoining tiles meet.
    fill += `M${a}${sides.map(([, end, mid]) => `${mid ? `L${mid}` : ""}L${end}`).join("")}Z`;
    for (const [start, end, mid] of sides) {
      if (mid) edges += `M${start}L${mid}L${end}`;
    }
  }
  // Shared vertices make adjacent filled tiles a continuous silhouette, with no internal strokes.
  return `<path d="${fill}" fill="#353633" stroke="#353633" stroke-width=".35"/><path d="${edges}" fill="none" stroke="#292b28" stroke-width="1.3" stroke-linecap="round"/>`;
}

function blockDrawing(block, active, invalid, frame) {
  const x = OFFSET + block.x * CELL,
    y = OFFSET + block.y * CELL;
  const r = jitter(block.x, block.y, frame, 8) * 1.6;
  const variable = block.text === "x" || block.text === "y";
  const fill = active ? "#f2e8ca" : "#faf8f0";
  return `<g class="${active ? "rule-block" : "loose-block"}${invalid ? " invalid-block" : ""}" data-block-id="${escape(block.id)}" transform="translate(${x} ${y}) rotate(${r} 18 18)">
    <path d="M4 4 L31 3.3 L32.5 31.6 L3.5 32.4 Z" fill="${fill}" stroke="#4e4e44" stroke-width="1.6" stroke-linejoin="round"/>
    ${invalid ? `<title>Part of an invalid expression</title><g class="invalid-mark" transform="translate(18 18) scale(.8) translate(-18 -18)" aria-hidden="true"><path d="${frame ? "M18 4C26 3.5 32.5 10 32 18C32.5 26 26 32.5 18 32C10 32.5 3.5 26 4 18C3.5 10 10 3.5 18 4Z M8.5 28L28 8" : "M18 4C26 3 32 9 32 18C33 26 26 32 18 32C10 33 4 27 4 18C3 10 10 4 18 4Z M8 28L28 8"}"/></g>` : ""}
    ${block.text === FLAG_TOKEN ? flagDrawing(frame) : `<text x="18" y="19.5" dominant-baseline="middle" text-anchor="middle" class="block-letter ${variable ? "variable-letter" : ""}" font-size="23">${escape(block.text)}</text>`}
  </g>`;
}

function goalDrawing(goal, frame) {
  if (!goal) return "";
  const x = OFFSET + goal.x * CELL,
    y = OFFSET + goal.y * CELL;
  return `<g class="goal-sprite" transform="translate(${x} ${y}) rotate(${frame ? -1.5 : 1} 18 18)">
    <path d="M5 4 L31 5 L30 32 L4 30Z" fill="#dce6cf" stroke="#68845c" stroke-width="1.7"/>
    <path d="M8 27L27 8 M7 20L20 7 M15 29L29 15 M22 29L29 22 M7 12L12 7" fill="none" stroke="#8ca07b" stroke-width="1.1" opacity=".55"/>
    ${boneDrawing()}
  </g>`;
}

function playerDrawing(player, frame, dead) {
  const px = Math.max(0, Math.min(14, player.x)),
    py = Math.max(0, Math.min(14, player.y));
  const coat = dead ? "#bd8c78" : "#ceaa70";
  const ink = dead ? "#82594d" : "#6d593c";
  const ear = dead ? "#a87265" : "#a6804a";
  const cream = "#faf4df";
  // A small corgi silhouette: pointed ears, forehead blaze, muzzle and paws.
  // Each frame stays inside its logical square; the tail and tongue only wobble.
  return `<g class="player-sprite" transform="translate(${OFFSET + px * CELL} ${OFFSET + py * CELL}) rotate(${frame ? -1.6 : 1.2} 18 18)" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="18" cy="33" rx="12" ry="1.6" fill="${ink}" opacity=".1"/>
    <path d="${frame ? "M25 28Q34 26 32 19Q37 25 29 31Z" : "M25 28Q33 29 34 22Q36 29 28 32Z"}" fill="${coat}" stroke="${ink}" stroke-width="1.1"/>
    <path d="M11 23Q18 21 26 24L27 31Q19 34 9 31Z" fill="${coat}" stroke="${ink}" stroke-width="1.3"/>
    <path d="M15 26L22 26L23 31L19 32L14 30Z" fill="${cream}"/>
    <path d="M10 29Q12 28 14 30L14 33L9 33Z M23 29Q25 28 27 30L28 33L23 33Z" fill="${cream}" stroke="${ink}" stroke-width="1.1"/>
    <path d="M11 26Q18 29 26 26L25 29Q18 31 11 29Z" fill="${dead ? "#8892a4" : "#5879b9"}" stroke="${dead ? "#697183" : "#36568c"}" stroke-width=".7"/>
    <path d="M18 29L20 30L18 32L16.5 30Z" fill="${cream}" stroke="${ink}" stroke-width=".65"/>
    <path d="M6 14L5 ${frame ? 3 : 4}Q5 2 7 4L13 10Q18 8 23 10L29 ${frame ? 4 : 3}Q31 2 31 5L30 15Q33 20 28 25Q18 29 8 25Q3 21 6 14Z" fill="${coat}" stroke="${ink}" stroke-width="1.35"/>
    <path d="M7 6L8 14L12 11Z M28 6L24.5 11L29 14Z" fill="${ear}"/>
    <path d="M18 10Q15 10 15.5 15L14 19Q10 16 7 19Q6 23 11 25Q18 28 26 25Q31 22 28 19Q25 17 22 19L20 15Q21 11 18 10Z" fill="${cream}"/>
    ${dead
      ? `<path d="M10 15.5L14 19M14 15.5L10 19M22 15.5L26 19M26 15.5L22 19" stroke="${ink}" stroke-width="1.4"/>`
      : `<path d="M12 16v2M24 16v2" stroke="#453d2f" stroke-width="2.6"/><circle cx="11.7" cy="15.8" r=".4" fill="${cream}"/><circle cx="23.7" cy="15.8" r=".4" fill="${cream}"/>`}
    <path d="M15.5 20.5Q18 19 20.5 20.5Q20 23 18 23Q16 23 15.5 20.5Z" fill="${ink}"/>
    ${dead
      ? `<path d="M15 25Q18 23.5 21 25" fill="none" stroke="${ink}" stroke-width="1"/>`
      : `<path d="M18 22.5V24M18 24Q15 26 12 23.5M18 24Q21 26 24 23.5" stroke="${ink}" stroke-width="1" fill="none"/><path d="M17.5 24.5Q19 25.2 20.5 24.2L20.3 ${frame ? 27 : 26.5}Q18.6 28 17.5 26.5Z" fill="#d58c91" stroke="#9a6865" stroke-width=".55"/>`}
  </g>`;
}

export function renderBoard(state, movement = null, cursor = null) {
  const active = new Set([...state.rules, ...(state.flagReadings ?? [])].flatMap((rule) => rule.blockIds));
  const invalid = new Set((state.invalidRules ?? []).flatMap((rule) => rule.blockIds));
  let grid = "",
    labels = "";
  for (let i = 0; i < SIZE; i++) {
    const center = OFFSET + i * CELL + CELL / 2;
    labels += `<text x="${center}" y="15" class="coordinate ${state.player.x === i ? "current-coordinate" : ""}" text-anchor="middle">${i}</text><text x="11" y="${center + 3}" class="coordinate ${state.player.y === i ? "current-coordinate" : ""}" text-anchor="middle">${i}</text>`;
    grid += `<path d="M${OFFSET + i * CELL} ${OFFSET}v${SIZE * CELL} M${OFFSET} ${OFFSET + i * CELL}h${SIZE * CELL}"/>`;
  }
  let rails = "";
  const offsetX = movement ? (movement.x - Math.max(0, Math.min(14, state.player.x))) * CELL : 0;
  const offsetY = movement ? (movement.y - Math.max(0, Math.min(14, state.player.y))) * CELL : 0;
  const player = (frame) => `<g class="${movement ? 'player-motion' : ''}" style="--step-x:${offsetX}px;--step-y:${offsetY}px">${playerDrawing(state.player, frame, state.status === "dead")}</g>`;
  for (const axis of ["x", "y"]) {
    if (
      state.rules.some((r) => r.axis === axis && isConstantExpression(r.ast))
    ) {
      const p = OFFSET + state.player[axis] * CELL + CELL / 2;
      rails += `<path d="${axis === "x" ? `M${p} ${OFFSET + CELL}v${13 * CELL}` : `M${OFFSET + CELL} ${p}h${13 * CELL}`}" stroke="#6683b9" stroke-width="1" stroke-dasharray="3 5" opacity=".26"/>`;
    }
  }
  const editorGrid = (typeof __EDITOR_ENABLED__ === "undefined" || __EDITOR_ENABLED__) && cursor ? `<g class="editor-grid">${Array.from({ length: 13 * 13 }, (_, i) => {
    const x = i % 13 + 1, y = Math.floor(i / 13) + 1;
    return `<rect data-cell-x="${x}" data-cell-y="${y}" x="${OFFSET + x * CELL}" y="${OFFSET + y * CELL}" width="${CELL}" height="${CELL}" class="${cursor.x === x && cursor.y === y ? "brush-cursor" : ""}"/>`;
  }).join("")}</g>` : "";
  const display = (frame) => state.flagCharacter == null ? "" : `<g class="flag-display" transform="translate(${OFFSET + 6 * CELL} ${OFFSET + 6 * CELL})"><text class="flag-letter" x="54" y="57" text-anchor="middle" dominant-baseline="middle" transform="rotate(${frame ? -.7 : .6} 54 54)">${escape(state.flagCharacter)}</text></g>`;
  return `<svg viewBox="0 0 576 576" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="15 by 15 puzzle. You are at x ${state.player.x}, y ${state.player.y}. ${state.goal ? `Goal at x ${state.goal.x}, y ${state.goal.y}.` : 'No goal.'} ${state.rules.length} active coordinate rules. ${state.flagCharacter == null ? '' : `Flag character: ${escape(state.flagCharacter)}.`} ${(state.invalidRules ?? []).length} invalid expressions.">
    <g fill="none" stroke="#dfdcd3" stroke-width=".6" stroke-dasharray="1.2 3.1">${grid}</g>
    ${labels}${rails}
    ${[0, 1].map((frame) => `<g class="wobble-frame frame-${frame}">${wallDrawing(state.walls, frame)}${display(frame)}${goalDrawing(state.goal, frame)}${state.blocks.map((b) => blockDrawing(b, active.has(b.id), invalid.has(b.id), frame)).join("")}${player(frame)}</g>`).join("")}
    ${editorGrid}
  </svg>`;
}
