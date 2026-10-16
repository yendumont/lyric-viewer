// The player controls fade in over the cover while the mouse is moving and out again when it rests.
// Same behaviour and values as Spicy Lyrics' Fullscreen view (components/Utils/Fullscreen.ts), which
// is tied to Spotify's page, so the part that matters is repeated here.
import { Spring } from "./spicy/modules/Spring.ts";

export function initControlsFade(page: HTMLElement): void {
  const opacity = new Spring(0, 2, 2, 0);
  const brightness = new Spring(0, 2, 2, 0);
  // The Canvas Stage's dock rows rise with the controls and settle down only once they have faded (as in Spicy's Fullscreen).
  const dockLift = new Spring(0, 2.5, 1, 0);
  const mediaBox = () => page.querySelector<HTMLElement>(".ContentBox .NowBar .Header .MediaBox");

  let pageHover = false;
  let mediaBoxHover = false;
  let lastMove = 0;
  let running = false;
  let last = performance.now();
  let idleTimer = 0;

  /** Where the controls are headed: set when the mouse does something, not every frame. */
  const retarget = () => {
    const resting = lastMove > 0 && performance.now() - lastMove >= 750;
    if (resting && !mediaBoxHover) {
      opacity.SetGoal(0);
      brightness.SetGoal(1);
    } else if (mediaBoxHover) {
      opacity.SetGoal(0.985);
      brightness.SetGoal(0.55);
    } else if (pageHover) {
      opacity.SetGoal(0.65);
      brightness.SetGoal(0.78);
    } else {
      opacity.SetGoal(0);
      brightness.SetGoal(1);
    }
    wake();
  };

  const step = () => {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    const box = mediaBox();
    const shown = opacity.Step(delta);
    const dim = brightness.Step(delta);
    box?.style.setProperty("--ControlsOpacity", shown.toString());
    box?.style.setProperty("--ArtworkBrightness", dim.toString());
    if (opacity.GetGoal() > 0) dockLift.SetGoal(1);
    else if (shown <= 0.005) dockLift.SetGoal(0);
    const lift = dockLift.Step(delta);
    box?.parentElement?.style.setProperty("--DockLift", lift.toString());
    page.querySelector<HTMLElement>(".ContentBox > .CanvasStage")?.style.setProperty("--StageBrightness", dim.toString());
    if (opacity.CanSleep() && brightness.CanSleep() && dockLift.CanSleep()) {
      running = false;
      return;
    }
    requestAnimationFrame(step);
  };

  function wake() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(step);
  }

  const afterRest = () => {
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (!mediaBoxHover) retarget();
    }, 800);
  };

  page.addEventListener("mousemove", () => {
    pageHover = true;
    lastMove = performance.now();
    retarget();
    afterRest();
  });
  page.addEventListener("mouseleave", () => {
    pageHover = false;
    mediaBoxHover = false;
    retarget();
  });

  const box = mediaBox();
  box?.addEventListener("mouseenter", () => {
    mediaBoxHover = true;
    pageHover = true;
    clearTimeout(idleTimer);
    retarget();
  });
  box?.addEventListener("mouseleave", () => {
    mediaBoxHover = false;
    retarget();
    afterRest();
  });
}
