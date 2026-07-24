/*
  Shared figure controller.
  - Figures start paused; they begin on viewport entry and pause on exit.
  - Under prefers-reduced-motion the poster frame is shown and playback never starts.
  - Figures longer than 2 s get play/pause/replay controls (keyboard reachable).
  Animations register with { start, pause, resume, replay }.
*/

export interface FigAnim {
  start(): void;
  pause(): void;
  resume(): void;
  replay(): void;
}

export const reducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const observed = new Map<Element, { anim: FigAnim; started: boolean; userPaused: boolean }>();

let io: IntersectionObserver | null = null;

function ensureObserver() {
  if (io) return io;
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const st = observed.get(e.target);
        if (!st || st.userPaused) continue;
        if (e.isIntersecting) {
          if (!st.started) {
            st.started = true;
            st.anim.start();
          } else {
            st.anim.resume();
          }
        } else if (st.started) {
          st.anim.pause();
        }
      }
    },
    { threshold: 0.35 }
  );
  return io;
}

export function registerFig(root: HTMLElement, anim: FigAnim): void {
  const controls = root.querySelector<HTMLElement>("[data-fig-controls]");

  if (reducedMotion()) {
    // Poster frame only. Controls are removed; the figure is complete without motion.
    controls?.remove();
    root.dataset.poster = "";
    return;
  }

  const st = { anim, started: false, userPaused: false };
  observed.set(root, st);
  ensureObserver().observe(root);

  if (controls) {
    const btnToggle = controls.querySelector<HTMLButtonElement>("[data-fig-toggle]");
    const btnReplay = controls.querySelector<HTMLButtonElement>("[data-fig-replay]");
    btnToggle?.addEventListener("click", () => {
      const playing = btnToggle.getAttribute("aria-pressed") !== "true";
      // aria-pressed=true means "paused by user" state on the pause toggle
      if (playing) {
        st.userPaused = true;
        anim.pause();
        btnToggle.setAttribute("aria-pressed", "true");
        btnToggle.textContent = "play";
        btnToggle.setAttribute("aria-label", "Play animation");
      } else {
        st.userPaused = false;
        if (!st.started) {
          st.started = true;
          anim.start();
        } else {
          anim.resume();
        }
        btnToggle.setAttribute("aria-pressed", "false");
        btnToggle.textContent = "pause";
        btnToggle.setAttribute("aria-label", "Pause animation");
      }
    });
    btnReplay?.addEventListener("click", () => {
      st.userPaused = false;
      st.started = true;
      btnToggle?.setAttribute("aria-pressed", "false");
      if (btnToggle) {
        btnToggle.textContent = "pause";
        btnToggle.setAttribute("aria-label", "Pause animation");
      }
      anim.replay();
    });
  }
}

/* Read a motion token (duration in ms) from CSS so JS and CSS share one source. */
export function durToken(name: string, fallback: number): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (v.endsWith("ms")) return parseFloat(v);
  if (v.endsWith("s")) return parseFloat(v) * 1000;
  return fallback;
}

