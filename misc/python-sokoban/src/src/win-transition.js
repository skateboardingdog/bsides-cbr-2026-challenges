import { boneDrawing } from "./bone.js";

export function createWinTransition(board) {
  let current = null;
  function cancel() {
    if (!current) return;
    for (const animation of current.animations) animation.cancel();
    current.element.remove();
    current = null;
  }
  function position(goal) {
    const rect = board.getBoundingClientRect();
    const size = rect.width * 36 / 576;
    return { x: rect.left + (27 + goal.x * 36 + 18) * rect.width / 576,
      y: rect.top + (27 + goal.y * 36 + 18) * rect.height / 576, size };
  }
  async function play(goal, reveal) {
    cancel();
    const origin = position(goal);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const element = document.createElement("div");
    element.className = `win-transition${reduced ? " reduced" : ""}`;
    element.setAttribute("aria-hidden", "true");
    element.dataset.phase = "expanding";
    element.innerHTML = `<svg class="win-bone" viewBox="0 0 36 36">${boneDrawing()}</svg><div class="win-sparkles">${Array.from({ length: 22 }, (_, i) => {
      const angle = i * 2.39996;
      const radius = 14 + (i % 5) * 8;
      return `<svg class="win-sparkle" viewBox="0 0 24 24" style="left:${50 + Math.cos(angle) * radius}%;top:${50 + Math.sin(angle) * radius}%;width:${13 + i % 4 * 7}px"><path d="M12 1Q13 10 23 12Q14 13 12 23Q10 14 1 12Q10 10 12 1Z"/></svg>`;
    }).join("")}</div>`;
    document.querySelector(".game").append(element);
    const run = { element, animations: [] };
    current = run;
    const bone = element.querySelector(".win-bone");
    bone.style.width = bone.style.height = `${origin.size}px`;
    const at = ({ x, y, size }) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${size / origin.size})`;
    // The narrow shaft must cover even the viewport corners before swapping boards.
    const full = at({ x: innerWidth / 2, y: innerHeight / 2, size: Math.hypot(innerWidth, innerHeight) * 6 });
    const centered = at({ x: innerWidth / 2, y: innerHeight / 2, size: Math.min(innerWidth, innerHeight) * .7 });
    const animate = (target, frames, options) => {
      const animation = target.animate(frames, { fill: "both", ...options });
      run.animations.push(animation);
      return animation;
    };
    try {
      for (const [i, sparkle] of [...element.querySelectorAll(".win-sparkle")].entries()) {
        animate(sparkle, [{ opacity: 0, transform: "scale(.2) rotate(-15deg)" },
          { opacity: .9, transform: "scale(1) rotate(8deg)", offset: .4 },
          { opacity: 0, transform: "scale(.5) rotate(24deg)" }],
        { duration: reduced ? 200 : 850, delay: reduced ? 0 : 180 + i % 6 * 65 });
      }
      await (reduced
        ? animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 })
        : animate(bone, [{ transform: at(origin) }, { transform: centered, offset: .4 }, { transform: full, offset: .8 }, { transform: full }],
          { duration: 850, easing: "cubic-bezier(.65,0,.3,1)" })).finished;
      if (current !== run) return;
      const destination = reveal();
      element.dataset.phase = destination ? "contracting" : "revealing";
      // A goal-free board has nowhere for the bone to land. Fade the covering
      // bone away in place instead of shrinking it onto the previous goal.
      await (reduced || !destination
        ? animate(element, [{ opacity: 1 }, { opacity: 0 }], { duration: reduced ? 160 : 450 })
        // Read the board bounds again after revealing the next level.
        : animate(bone, [{ transform: full }, { transform: centered, offset: .6 }, { transform: at(position(destination)) }],
          { duration: 650, easing: "cubic-bezier(.65,0,.25,1)" })).finished;
    } catch (error) {
      if (error.name !== "AbortError") throw error;
    } finally {
      if (current === run) cancel();
    }
  }
  window.addEventListener("resize", cancel);
  return { play, cancel, get active() { return current !== null; } };
}
