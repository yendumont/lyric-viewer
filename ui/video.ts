// A video file playing in VLC shows its picture muted, kept in step with VLC's own clock (the sound stays in VLC).
// With the Live Video Background on it fills the background, blurred like Spicy's own live background; the cover spot
// then shows the song's looked-up cover (Covers for Video Songs) or, with none, goes away (NoCoverLook, see index.html).
// With the live background off it plays in the cover. The server only hands over the file VLC currently has open.
import { isExperimentEnabled } from "./spicy/utils/experiments.ts";
import { rawPositionMs, viewer } from "./state.ts";

const COVER = ".ContentBox .NowBar .Header .MediaBox .MediaImageContainer";
let page: HTMLElement;
let video: HTMLVideoElement | null = null;
let shown = "";
let lastSeek = 0;

export function initVideo(root: HTMLElement): void {
  page = root;
}

function drop(): void {
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.remove();
  video = null;
  page.querySelector(COVER)?.classList.remove("HasAnimatedCover");
}

/** Every frame: puts the video in (or takes it away) and nudges it onto the song clock. */
export function paintVideo(): void {
  if (!page) return;
  const src = viewer.media.video?.src ?? "";
  const background = !!src && isExperimentEnabled("liveBackground");
  const where = `${src}|${background ? "bg" : "cover"}`;

  if (where !== shown) {
    shown = where;
    drop();
    const target = page.querySelector<HTMLElement>(background ? ".ContentBox" : COVER);
    if (src && target) {
      video = document.createElement("video");
      video.className = background ? "LiveBackgroundVideo VlcBg" : "AnimatedCoverVideo VlcVideo";
      video.muted = true;
      video.playsInline = true;
      video.disablePictureInPicture = true;
      video.addEventListener("canplay", () => video?.classList.add("Ready"), { once: true });
      video.src = src;
      if (!background) target.classList.add("HasAnimatedCover");
      target.appendChild(video);
    }
  }

  page.classList.toggle("VlcVideoBg", background);
  const noCover = background && (!isExperimentEnabled("videoSongCover") || viewer.coverMissing);
  page.classList.toggle("NoCoverLook", noCover);
  // Without a cover there is nothing to put the player over: it takes the Canvas Stage's dock layout (title, timeline and
  // controls along the bottom corner, nothing above them). The class is Canvas's own, so it is left alone while a Canvas is showing.
  if (!viewer.media.canvas) page.classList.toggle("CanvasImmersive", noCover);

  // A seek in progress is left to finish (asking again every frame keeps it from ever landing).
  if (!video || video.readyState < 2 || video.seeking) return;
  const want = (rawPositionMs() + syncOffsetMs()) / 1000;
  const drift = video.currentTime - want;
  if (viewer.clock.playing) {
    if (video.paused) void video.play().catch(() => undefined);
    if (Math.abs(drift) > 0.8 && performance.now() - lastSeek > 1500) {
      lastSeek = performance.now();
      // Far off (a seek in VLC, a new song): jump, a little ahead since the jump itself takes a moment to land.
      video.currentTime = want + 0.12;
      video.playbackRate = 1;
    } else if (Math.abs(drift) > 0.03) {
      // Close: speed up or slow down a touch until it catches up, instead of seeking (a seek stalls the picture).
      video.playbackRate = Math.min(1.15, Math.max(0.85, 1 - drift * 0.8));
    } else {
      video.playbackRate = 1;
    }
  } else {
    if (!video.paused) video.pause();
    video.playbackRate = 1;
    if (Math.abs(drift) > 0.03) video.currentTime = want;
  }
}

/** The user's nudge for the picture against the sound (ms, Settings > Pictures > Video sync): positive shows the picture later. */
export const syncOffsetMs = (): number => {
  try {
    return -(Number(localStorage.getItem("videoSyncMs")) || 0);
  } catch {
    return 0;
  }
};
