// Stands in for the parts of Spotify's page (Spicetify) that Spicy Lyrics' renderer reaches for.
// Imported first, before any of Spicy Lyrics' own modules.
import { rawPositionMs, uriOf, viewer } from "../state.ts";

const g = globalThis as any;

g.Spicetify = {
  LocalStorage: {
    get: (key: string) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key: string, value: string) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // storage unavailable
      }
    },
    remove: (key: string) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // storage unavailable
      }
    },
  },
  Player: {
    get data() {
      const search = viewer.search;
      const media = viewer.media;
      return {
        item: {
          uri: uriOf(),
          type: "track",
          mediaType: "audio",
          name: search?.track?.name ?? media.title,
          duration: { milliseconds: media.durationMs ?? 0 },
          metadata: { album_title: search?.track?.album ?? media.album ?? "" },
          artists: (search?.track?.artists ?? [search?.track?.artist ?? media.artist ?? ""]).map((name) => ({ type: "artist", name, uri: "" })),
          images: [],
        },
      };
    },
    isPlaying: () => viewer.clock.playing,
    getProgress: () => rawPositionMs(),
    getDuration: () => viewer.media.durationMs ?? 0,
    getHeart: () => false,
    origin: { seekTo: (ms: number) => viewer.seek(ms), _state: null },
    playUri: () => {},
    pause: () => viewer.command("pause"),
    play: () => viewer.command("play"),
    togglePlay: () => viewer.command("toggle"),
    next: () => viewer.command("next"),
    back: () => viewer.command("prev"),
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  Platform: {
    History: { location: { pathname: "/SpicyLyrics" }, listen: () => () => {} },
  },
  Locale: { getLocale: () => "en" },
};

g._spicy_lyrics_metadata = { LoadedVersion: "viewer" };

// Keeps recent errors where the debugger can read them (tools/cdp.ts eval "window.__errors").
const errors: string[] = [];
g.__errors = errors;
const original = console.error.bind(console);
console.error = (...args: unknown[]) => {
  errors.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join(" ").slice(0, 600));
  if (errors.length > 40) errors.shift();
  original(...args);
};
window.addEventListener("error", (e) => errors.push(`error: ${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) => errors.push(`rejection: ${String((e.reason && e.reason.stack) || e.reason).slice(0, 600)}`));
