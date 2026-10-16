// The player pieces Spicy Lyrics' Now Bar has besides play/prev/next: heart, shuffle, repeat and the volume slider.
// They are Spotify's own, so they exist only while Spotify is the player and its debugger port is open (the server
// reports them as media.spotify). Placement is done by Spicy's own CSS, which looks for these class names.
// In the Canvas Stage layout the timeline also moves from the cover overlay to the dock under the title.
import { Icons } from "./spicy/components/Styling/Icons.ts";
import { viewer } from "./state.ts";

const post = (cmd: string) =>
  void fetch("/api/cmd", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cmd }) });

const q = <T extends HTMLElement>(root: ParentNode, selector: string) => root.querySelector<T>(selector);

let page: HTMLElement;
let heart: HTMLElement;
let volume: HTMLElement;
let shuffle: HTMLElement;
let loop: HTMLElement;
let dragging = false;
let lastLoop = -1;

export function initDock(root: HTMLElement): void {
  page = root;
  const content = q(page, ".NowBar .MediaContent")!;

  heart = document.createElement("div");
  heart.className = "Heart";
  heart.innerHTML = Icons.Heart;
  heart.style.display = "none";
  heart.addEventListener("click", () => post("heart"));
  content.append(heart);

  volume = document.createElement("div");
  volume.className = "VolumeControl";
  volume.innerHTML = `<div class="VolumeFill"></div><div class="Handle"></div><div class="VolumeIcon">${Icons.Volume}</div>`;
  volume.style.display = "none";
  content.append(volume);
  const setFrom = (event: PointerEvent) => {
    const rect = volume.getBoundingClientRect();
    // Laid flat in the Canvas dock, upright otherwise (the capsule's shape says which).
    const level = rect.width >= rect.height ? (event.clientX - rect.left) / rect.width : 1 - (event.clientY - rect.top) / rect.height;
    const clamped = Math.min(1, Math.max(0, level));
    volume.style.setProperty("--VolumeLevel", String(clamped));
    post(`volume ${clamped.toFixed(3)}`);
  };
  volume.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest(".VolumeIcon")) return;
    dragging = true;
    volume.classList.add("Dragging");
    volume.setPointerCapture(event.pointerId);
    setFrom(event);
  });
  volume.addEventListener("pointermove", (event) => dragging && setFrom(event));
  const stop = () => {
    dragging = false;
    volume.classList.remove("Dragging");
  };
  volume.addEventListener("pointerup", stop);
  volume.addEventListener("pointercancel", stop);

  shuffle = q(page, ".ShuffleToggle")!;
  loop = q(page, ".LoopToggle")!;
  shuffle.addEventListener("click", () => post("shuffle"));
  loop.addEventListener("click", () => post("repeat"));

  // The timeline sits in the dock, under the title, while the Canvas Stage is on.
  const place = () => {
    const timeline = q(page, ".Timeline");
    if (!timeline) return;
    const wantHeader = page.classList.contains("CanvasImmersive");
    const header = q(page, ".NowBar .Header")!;
    if (wantHeader && timeline.parentElement !== header) header.insertBefore(timeline, q(header, ".Metadata"));
    else if (!wantHeader && timeline.parentElement !== content) content.prepend(timeline);
  };
  new MutationObserver(place).observe(page, { attributes: true, attributeFilter: ["class"] });
  place();
}

/** Called every frame with the current media: cheap, and only touches the page when something differs. */
export function paintDock(): void {
  if (!heart) return;
  const s = viewer.media.spotify;
  const on = !!s && !viewer.media.none;
  const show = (el: HTMLElement, display: string) => el.style.display !== display && (el.style.display = display);
  show(heart, on ? "" : "none");
  show(volume, on ? "" : "none");
  page.classList.toggle("ShowVolumeSlider", on);
  // Shuffle and repeat are kept out of sight for other players: Windows' media controls cannot toggle them reliably.
  shuffle.style.visibility = on ? "visible" : "hidden";
  loop.style.visibility = on ? "visible" : "hidden";
  if (!s) return;
  heart.classList.toggle("Filled", s.heart);
  shuffle.classList.toggle("Enabled", s.shuffle);
  loop.classList.toggle("Enabled", s.repeat > 0);
  if (lastLoop !== s.repeat) {
    lastLoop = s.repeat;
    loop.innerHTML = s.repeat === 2 ? Icons.LoopTrack : Icons.Loop;
  }
  if (!dragging) volume.style.setProperty("--VolumeLevel", String(s.volume));
}
