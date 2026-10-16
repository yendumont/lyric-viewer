// A song that has both a Spotify Canvas and an Apple animated cover: the animated cover plays in the cover spot as usual
// (the normal layout), and the Canvas plays as the full-screen background behind the lyrics, darkened and blurred like
// the live video background (so the "Background blur" slider in Settings sets how blurred it is). So the Canvas Stage is
// held back for such songs, and shown as before for songs whose lookup finds no animated cover.
import Global from "./spicy/components/Global/Global.ts";
import { isExperimentEnabled } from "./spicy/utils/experiments.ts";
import { getAnimatedCover } from "./shims/AnimatedCover.ts";
import { viewer } from "./state.ts";

type Status = "pending" | "has" | "none";
let key = "";
let status: Status = "none";
let since = 0;
let video: HTMLVideoElement | null = null;
let page: HTMLElement;

const WAIT_FOR_TRACK_MS = 8000;

/** True while the Canvas Stage should stay away: the animated cover is being looked up, or the song has one. */
export const canvasWithheld = (): boolean =>
  !!viewer.media.canvas && isExperimentEnabled("canvasImmersive") && isExperimentEnabled("animatedCover") && status !== "none";

export function initPair(root: HTMLElement): void {
  page = root;
}

function refreshStage(): void {
  setTimeout(() => Global.Event.evoke("nowbar:open", {}), 0);
}

function dropVideo(): void {
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.remove();
  video = null;
}

function setStatus(next: Status): void {
  if (status === next) return;
  const wasWithheld = status !== "none";
  status = next;
  if (next !== "has") dropVideo();
  if (wasWithheld !== (next !== "none")) refreshStage();
}

/** Every frame. */
export function paintPair(): void {
  if (!page) return;
  const canvas = viewer.media.canvas?.url ?? "";
  const track = viewer.search?.track;
  // The "Spotify Canvas" switch (canvasImmersive) turns the Canvas off everywhere, this background included.
  const wanted = !!canvas && isExperimentEnabled("canvasImmersive") && isExperimentEnabled("animatedCover") && !viewer.media.video;
  const nextKey = wanted ? `${canvas}|${track?.artist ?? ""}|${track?.album ?? ""}` : "";

  if (nextKey !== key) {
    const sameCanvas = key.split("|")[0] === canvas;
    key = nextKey;
    if (!wanted) {
      setStatus("none");
    } else {
      if (!sameCanvas) since = performance.now();
      // Until the album is known (or the lookup answers) the Canvas Stage stays away, so it does not flash up and go again.
      setStatus("pending");
      if (track?.album) {
        const mine = nextKey;
        void getAnimatedCover(track.artist, track.album, track.name).then((url) => {
          if (key === mine) setStatus(url ? "has" : "none");
        });
      }
    }
  } else if (wanted && status === "pending" && !track?.album && performance.now() - since > WAIT_FOR_TRACK_MS) {
    setStatus("none");
  }

  page.classList.toggle("CanvasPairBg", status === "has");
  if (status !== "has") return;

  const box = page.querySelector<HTMLElement>(".ContentBox");
  if (!box) return;
  if (!video || video.dataset.src !== canvas) {
    dropVideo();
    video = document.createElement("video");
    video.dataset.src = canvas;
    // Spicy's live-background styling (dark, blurred by --LiveBackgroundBlur, fades in once ready).
    video.className = "LiveBackgroundVideo CanvasPair";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.disablePictureInPicture = true;
    const mine = video;
    video.addEventListener("canplay", () => mine.classList.add("Ready"), { once: true });
    video.src = canvas;
    box.appendChild(video);
  }
  const playing = viewer.clock.playing && !document.hidden;
  if (playing && video.paused) void video.play().catch(() => undefined);
  else if (!playing && !video.paused) video.pause();
}
