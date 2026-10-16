// Spicy Lyrics plays a Canvas through Spotify's own manifests. Here Spotify's debugger bridge gives the Canvas file's
// address (an MP4 on Spotify's CDN), which a video element plays directly.
import { viewer } from "../state.ts";
import { canvasWithheld } from "../pair.ts";

export type CanvasInfo = { fileId: string; type: string };
export type CanvasMedia = { fileId: string; type: string; url: string; durationMs: number };

export function GetPlayingCanvasInfo(): CanvasInfo | null {
  const canvas = viewer.media.canvas;
  // Held back while the song's animated cover is looked up or shown (see pair.ts): the cover spot and the Canvas as the background instead.
  if (canvasWithheld()) return null;
  return canvas?.url ? { fileId: canvas.url, type: canvas.type || "VIDEO_LOOPING" } : null;
}

export const GetCanvasInfo = async (_uri: string): Promise<CanvasInfo | null> => GetPlayingCanvasInfo();

export async function LoadCanvasMedia(info: CanvasInfo): Promise<CanvasMedia | null> {
  return { fileId: info.fileId, type: info.type, url: info.fileId, durationMs: 0 };
}

export async function AttachCanvasMedia(video: HTMLVideoElement, media: CanvasMedia): Promise<() => void> {
  video.src = media.url;
  return () => {
    video.removeAttribute("src");
    video.load();
  };
}
