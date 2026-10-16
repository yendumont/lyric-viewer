// Spicy Lyrics' own lyrics fetching (its API, caches, queue) is replaced by the viewer's server,
// which asks every source. Only what the renderer calls on its way is kept.
import { PageContainer } from "./PageView.ts";
import { LocalLyricsManager } from "../spicy/utils/Lyrics/manager/index.ts";
import { $currentLyricsData, $currentLyricsType } from "../spicy/utils/stores.ts";
import { viewer } from "../state.ts";

export type FetchLyricsResult = [object | string, number, string?] | null;

export const LYRICS_QUEUE_MESSAGE = "Your request is in the queue. Hang tight, your lyrics are on the way!";

export type LyricsFetchFailure = { uri: string; source: string; detail?: string; at: number };

export const LyricsStore = null as any;
export const SetLyricsUpgradeHandler = (_handler: (result: FetchLyricsResult) => void): void => {};
export const GetLastLyricsFailure = (_uri: string | undefined): LyricsFetchFailure | null => null;
export const ShowQueueLoader = (_message: string = LYRICS_QUEUE_MESSAGE): void => {};

export function HideLoaderContainer(): void {
  const loader = PageContainer?.querySelector<HTMLElement>(".LyricsContainer .loaderContainer");
  loader?.classList.remove("active", "queued");
}

export function ClearLyricsPageContainer(): void {
  const content = PageContainer?.querySelector<HTMLElement>(".LyricsContainer .LyricsContent");
  if (content) content.innerHTML = "";
}

/**
 * The lyrics manager calls this after it changes a song's saved lyrics: a saved entry wins, otherwise what the
 * viewer's sources found (page.ts provides `viewer.reload`).
 */
export default async function fetchLyrics(uri: string): Promise<FetchLyricsResult> {
  const saved = await LocalLyricsManager.get(uri);
  if (saved) {
    const data = { ...saved, uri };
    $currentLyricsData.set(JSON.stringify(data));
    $currentLyricsType.set(data.Type);
    viewer.markSaved(uri);
    return [data, 200, uri];
  }
  return viewer.reload(uri);
}

