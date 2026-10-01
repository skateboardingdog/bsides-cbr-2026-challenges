export const playShell = `
  <main class="game" aria-label="python sokoban">
    <div class="stage"><div class="puzzle"><div id="board" tabindex="0" role="group" aria-label="Game board. Arrow keys or WASD to move. Z to undo. Y to redo an undo or reset. R to reset."></div>
    </div></div>
    <div id="control-guide" class="controls" role="group" aria-label="Keyboard controls" hidden>
      <div class="movement" aria-label="Arrow keys to move">
        <kbd class="key-up">↑</kbd><kbd class="key-left">←</kbd><kbd>↓</kbd><kbd>→</kbd>
      </div>
      <div class="actions">
        <div class="key-hint"><kbd>Z</kbd><span>undo</span></div>
        <div class="key-hint"><kbd>Y</kbd><span>redo</span></div>
        <div class="key-hint"><kbd>R</kbd><span>reset</span></div>
      </div>
    </div>
    <button data-action="info" id="info-button" aria-label="Show controls" aria-controls="control-guide" aria-expanded="false" title="Controls">ⓘ</button>
    <nav class="levels" aria-label="Levels"></nav>
    <div class="utilities" aria-label="Extra controls">
      <button data-action="music" id="music-button" aria-label="Mute music" title="Mute music (M)"><svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.2 8 9 13 4.8 12.8 19 8 15 4.2 15Z"/><path class="music-waves" d="M16 8c2 2 2.1 5.8 0 8m3-11c3.4 3.8 3.1 10.4-.2 14"/><path class="music-slash" d="M3 21 21 3"/></svg></button>
      <button data-action="fullscreen" id="fullscreen-button" title="Fullscreen (F)" aria-label="Enter fullscreen">⛶</button>
    </div>
    <div id="flag-access" class="flag-access" role="status" hidden><span></span><button aria-label="Retry opening the flag" hidden>↻</button></div>
    <div id="announcement" class="sr-only" aria-live="polite" aria-atomic="true"></div>
  </main>
`;
