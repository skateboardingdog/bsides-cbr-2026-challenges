// One streaming player for the entire session, independent of game rendering.
export function installMusic(button) {
  const storageKey = "python-sokoban-music-muted";
  let muted = false;
  try { muted = localStorage.getItem(storageKey) === "true"; } catch { /* Optional. */ }
  let started = false, loaded = false, failed = false;
  const audio = document.createElement("audio");
  audio.id = "background-music";
  audio.hidden = true;
  audio.preload = "none";
  audio.loop = true;
  audio.volume = 0.55;
  document.querySelector("#app").append(audio);

  function update() {
    const label = failed && !muted ? "Retry music" : muted ? "Unmute music" : "Mute music";
    button.setAttribute("aria-label", label);
    button.title = `${label} (M)`;
    button.dataset.muted = String(muted);
    button.dataset.status = muted ? "muted" : failed ? "unavailable" : "enabled";
  }
  function play() {
    if (muted || document.hidden || failed) return;
    started = true;
    if (!loaded) {
      loaded = true;
      const sources = [
        ["music/level2.opus", 'audio/ogg; codecs="opus"'],
        ["music/level2.m4a", 'audio/mp4; codecs="mp4a.40.2"'],
      ];
      for (const [index, [src, type]] of sources.entries()) {
        const source = document.createElement("source");
        source.src = `${import.meta.env.BASE_URL}${src}`;
        source.type = type;
        // The browser tries AAC if Opus is unsupported or fails to load.
        if (index === sources.length - 1) source.addEventListener("error", unavailable);
        audio.append(source);
      }
    }
    // Never await music from an input handler. Loading cannot delay a move.
    audio.play().catch((error) => {
      if (error.name === "NotAllowedError") started = false;
      else if (error.name !== "AbortError") unavailable();
    });
  }
  function unavailable() { failed = true; update(); }
  audio.addEventListener("error", unavailable);

  function toggle() {
    if (failed && !muted) {
      failed = false;
      audio.load();
    } else muted = !muted;
    try { localStorage.setItem(storageKey, String(muted)); } catch { /* Optional. */ }
    if (muted) audio.pause();
    else play();
    update();
  }
  function firstInteraction(event) {
    if (!event.isTrusted || started || muted || failed || button.contains(event.target)) return;
    if (event.type === "keydown" && (event.key.toLowerCase() === "m" || event.ctrlKey || event.metaKey || event.altKey)) return;
    play();
  }
  // Pointer-up also supplies a user activation on touch devices.
  window.addEventListener("pointerup", firstInteraction, { passive: true });
  window.addEventListener("keydown", firstInteraction);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) audio.pause();
    else if (started) play();
  });
  update();
  return { toggle };
}
