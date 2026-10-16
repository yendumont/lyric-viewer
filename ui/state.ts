// What the page knows about the song that is playing. The shims for Spicy Lyrics' own modules
// (SpotifyPlayer, GetProgress, ...) all read from here, so its renderer sees one steady clock.

export type Source = { id: string; label: string; state: string; sync?: string; lines?: number; detail?: string };
export type Search = {
  key: string;
  resolving: boolean;
  searching: boolean;
  chosen: string | null;
  pinned: string | null;
  track?: { name: string; artist: string; artists?: string[]; album: string; spotifyId?: string; durationMs: number };
  sources: Source[];
  credit?: { text: string; people: { role: string; name: string; url?: string }[] };
  /** The saved timing correction for the song and source on screen, in ms. */
  offsetMs?: number;
};
export type Media = {
  none?: boolean;
  title?: string;
  artist?: string;
  album?: string;
  status?: string;
  positionMs?: number;
  durationMs?: number;
  cover?: string;
  quality?: string;
  canvas?: { url: string; type: string };
  video?: { src: string };
  spotify?: { heart: boolean; shuffle: boolean; repeat: number; volume: number };
  canSeek?: boolean;
  at?: number;
};
export type Prefs = { translate: boolean; preferBestSync: boolean };

export const viewer = {
  media: { none: true } as Media,
  search: null as Search | null,
  prefs: { translate: false, preferBestSync: true } as Prefs,
  /** The song clock, in milliseconds: moves on its own between updates and is pulled back only by a real jump. */
  clock: { pos: 0, at: 0, playing: false },
  /** User lyric offset in ms (positive = lyrics later). */
  offsetMs: 0,
  /** The cover as the page currently shows it (a /cover address that changes when the picture does). */
  coverUrl: "",
  /** The cover lookup for a video song found nothing (so the page goes without a cover). */
  coverMissing: false,
  seek: (_ms: number) => {},
  /** Set by page.ts: show the lyrics the sources found for the song on screen again (after a saved entry is removed). */
  reload: async (_uri: string): Promise<[object | string, number, string?] | null> => null,
  /** Set by page.ts: the saved (manager) lyrics of this song are on screen, so the sources must not replace them. */
  markSaved: (_uri: string) => {},
  command: (_cmd: string) => {},
};

export const rawPositionMs = () => viewer.clock.pos + (viewer.clock.playing ? Date.now() - viewer.clock.at : 0);
export const uriOf = () => {
  const search = viewer.search;
  if (!search) return undefined;
  return search.track?.spotifyId ? `spotify:track:${search.track.spotifyId}` : `viewer:track:${search.key}`;
};
