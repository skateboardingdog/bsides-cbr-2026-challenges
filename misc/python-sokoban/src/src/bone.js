// Shared by the goal, controls, and the win wipe. Coordinates fit one 36px cell.
export const bonePath = "M10 13C7 8 1 9 3 15C-1 19 4 27 10 22L26 22C32 28 38 22 33 18C38 12 31 7 26 13Z";
export function boneDrawing() {
  return `<path d="${bonePath}" fill="#dce6cf" stroke="#68845c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}
export function boneIcon() {
  return `<svg class="bone-icon" viewBox="0 0 36 36" aria-hidden="true">${boneDrawing()}</svg>`;
}
