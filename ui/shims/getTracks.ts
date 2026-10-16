// The lyrics manager lists its saved songs through Spotify's catalogue. Here the songs seen recently are remembered
// by the page (name, artists, cover), so the saved entries show what they are; anything older shows its address.
import type { ProcessedTrack } from "../spicy/components/ReactComponents/LyricsManager/utils/getTracks.ts";

export type { ProcessedTrack };
const KEY = "ldbSeen";

type Seen = Record<string, { name: string; artists: string[]; durationMs: number; cover?: string }>;
const read = (): Seen => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
};

/** Called by the page for every song it shows. Keeps the last 200. */
export function rememberSong(uri: string, name: string, artists: string[], durationMs: number, cover?: string): void {
  try {
    const seen = read();
    delete seen[uri];
    seen[uri] = { name, artists, durationMs, cover };
    const keys = Object.keys(seen);
    for (const old of keys.slice(0, Math.max(0, keys.length - 200))) delete seen[old];
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // storage unavailable
  }
}

export const GetTracks = async (uris: string[]): Promise<ProcessedTrack[]> => {
  const seen = read();
  return uris
    .filter((uri) => seen[uri])
    .map((uri) => ({
      uri,
      name: seen[uri].name,
      durationMs: seen[uri].durationMs,
      artists: seen[uri].artists.map((name) => ({ name, uri: "" })),
      coverArt: seen[uri].cover ? [{ size: "standard", uri: seen[uri].cover as string }] : [],
    }));
};

export const ProcessData = (): never => {
  throw new Error("not used here");
};
