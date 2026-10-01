export function flagDrawing(frame = 0) {
  return `<g class="flag-sprite" stroke-linecap="round" stroke-linejoin="round" aria-label="Red flag">
    <path d="${frame ? 'M11 7L28 13L11.5 20Z' : 'M11 6.5L28.5 13.5L11 20.5Z'}" fill="#cf6559" stroke="#97483f" stroke-width="1.25"/>
    <path d="${frame ? 'M10.5 6L11.5 29' : 'M10.8 5.8L10.3 29'}" fill="none" stroke="#605a4d" stroke-width="1.7"/>
  </g>`;
}

export const flagIcon = () => `<svg class="flag-icon" viewBox="0 0 36 36" width="24" height="24" aria-hidden="true">${flagDrawing()}</svg>`;
