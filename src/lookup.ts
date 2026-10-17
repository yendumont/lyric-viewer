import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { WORKER_BASE } from "./shim.ts";
import { safeUrl, type Credit } from "./credit.ts";
import { fetchFromSpicy } from "./spicy.ts";
import { fetchFromAmllTtmlDb } from "./utils/Lyrics/providers/AmllTtmlDb.ts";
import { fetchFromBiniLyrics } from "./utils/Lyrics/providers/BiniLyrics.ts";
import { fetchFromDeezer } from "./utils/Lyrics/providers/Deezer.ts";
import { fetchFromGenius } from "./utils/Lyrics/providers/Genius.ts";
import { fetchFromKugou } from "./utils/Lyrics/providers/Kugou.ts";
import { fetchFromKuwo } from "./utils/Lyrics/providers/Kuwo.ts";
import { fetchFromLrcLib } from "./utils/Lyrics/providers/LrcLib.ts";
import { fetchFromLrcMux } from "./utils/Lyrics/providers/LrcMux.ts";
import { fetchFromLrcRed } from "./utils/Lyrics/providers/LrcRed.ts";
import { fetchFromMusixmatch } from "./utils/Lyrics/providers/Musixmatch.ts";
import { fetchFromNetEase } from "./utils/Lyrics/providers/NetEase.ts";
import { fetchFromQQMusic } from "./utils/Lyrics/providers/QQMusic.ts";
import { fetchFromUnison } from "./utils/Lyrics/providers/Unison.ts";
import { fetchFromYouTubeMusic } from "./utils/Lyrics/providers/YouTubeMusic.ts";
import { PROVIDER_META, type ExternalProviderId } from "./utils/Lyrics/providers/registry.ts";
import type { TrackInfo } from "./utils/Lyrics/providers/types.ts";

export type Config = {
  /** The port the page is served on (default 3838). The page is only ever served on this PC (127.0.0.1): there is no setting to open it to other devices. */
  port?: number;
  /** Your own Musixmatch user token (Musixmatch finds nothing without one). */
  musixmatchToken?: string;
  /** Your Spicy Lyrics developer secret key (sl_sk_...). The SPICY_LYRICS_SECRET_KEY environment variable works too. */
  spicyApiKey?: string;
  /** Genius: real artists whose songs are listed under a different name. */
  geniusFavoriteArtists?: string[];
  geniusLooseSearch?: boolean;
  geniusEagerMatch?: boolean;
  /** lrc.red and BiniLyrics word sync: "hand" (hand-timed only), "all" or "off". */
  wordSync?: "hand" | "all" | "off";
  /** Your own Spotify app (developer.spotify.com, free): lets the viewer find the playing song on Spotify for Spicy Lyrics. */
  spotifyClientId?: string;
  spotifyClientSecret?: string;
  /** Sources in the order they are preferred (ids as in the source menu). */
  order?: string[];
  /** Folders searched for the playing song's file, to read lyrics stored in it (default: your Music folder). */
  musicFolders?: string[];
  /** Source ids that are not used at all (switched off). */
  disabled?: string[];
  /** Show the best-synced lyrics found (word over line over plain), not just the first source that has any. Default true. */
  preferBestSync?: boolean;
  /** Whose Genius explanations to show: "artist", "editors" or "everyone" (default). */
  lineMeaningsFrom?: string;
  /** VLC's web interface (see vlc.ts): its password, and its port if not 8080. */
  vlcPassword?: string;
  vlcPort?: number;
  /** Full path of the browser used for the window (Brave, Edge or Chrome are looked for otherwise). */
  browser?: string;
};

const CONFIG_FILE = fileURLToPath(new URL("../config.json", import.meta.url));
export const config: Config = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, "utf8").replace(/^\uFEFF/, "")) : {};
const wordSync = () => config.wordSync ?? "hand";

const fetchers: Record<ExternalProviderId, (track: TrackInfo) => Promise<any | null>> = {
  lrclib: fetchFromLrcLib,
  lrcmux: fetchFromLrcMux,
  lrcred: (track) => fetchFromLrcRed(track, wordSync()),
  netease: fetchFromNetEase,
  qqmusic: fetchFromQQMusic,
  kugou: fetchFromKugou,
  deezer: fetchFromDeezer,
  amll: fetchFromAmllTtmlDb,
  kuwo: fetchFromKuwo,
  binilyrics: (track) => fetchFromBiniLyrics(track, wordSync()),
  ytmusic: (track) => fetchFromYouTubeMusic(track, WORKER_BASE),
  musixmatch: (track) => fetchFromMusixmatch(track, config.musixmatchToken ?? ""),
  unison: fetchFromUnison,
  genius: (track) =>
    fetchFromGenius(
      track,
      WORKER_BASE,
      config.geniusLooseSearch ?? true,
      config.geniusFavoriteArtists ?? [],
      config.geniusEagerMatch ?? true
    ),
};

export type Outcome = {
  id: ExternalProviderId | "spicy";
  label: string;
  state: "found" | "none" | "error" | "skipped";
  /** "word", "line" or "none" (plain text) when found. */
  sync?: "word" | "line" | "none";
  lines?: number;
  detail?: string;
  /** Who the lyrics are credited to (Spicy Lyrics and Unison), shown with them and saved in the file. */
  credit?: Credit;
  lyrics?: any;
};

const SYNC: Record<string, Outcome["sync"]> = { Syllable: "word", Line: "line", Static: "none" };
const countLines = (lyrics: any): number => (lyrics.Lines ?? lyrics.Content ?? []).length;

export const ALL_IDS = ["embedded", "spicy", ...(Object.keys(PROVIDER_META) as ExternalProviderId[])] as const;

/** Ask one provider about the song and say what it had. Never throws. */
export async function lookupOne(id: (typeof ALL_IDS)[number], track: TrackInfo): Promise<Outcome> {
  // Lyrics inside a local file are found by the engine (see local.ts); this source has nothing to ask on its own.
  if (id === "embedded") return { id, label: "Embedded lyrics", state: "skipped", detail: "Only for songs that are files on this PC" };
  const label = id === "spicy" ? "Spicy Lyrics" : PROVIDER_META[id].label;
  const spicyKey = (config.spicyApiKey || process.env.SPICY_LYRICS_SECRET_KEY || "").trim();
  if (id === "spicy" && !spicyKey) {
    return { id, label, state: "skipped", detail: "Needs your Spicy Lyrics key (Settings > Keys). Get one at developers.spicylyrics.org/dashboard" };
  }
  if (id === "spicy" && !track.spotifyId) {
    return {
      id,
      label,
      state: "skipped",
      detail: "This song was not found on Spotify, so Spicy Lyrics cannot be asked for it",
    };
  }
  if (id === "musixmatch" && !config.musixmatchToken) {
    return { id, label, state: "skipped", detail: "Needs your own token in config.json" };
  }
  try {
    if (id === "spicy") {
      // A song can have several Spotify ids (one per release); the first one Spicy Lyrics has lyrics for wins.
      let answer = null;
      for (const spotifyId of (track.spotifyIds?.length ? track.spotifyIds : [track.spotifyId]).slice(0, 4)) {
        answer = await fetchFromSpicy({ ...track, spotifyId }, spicyKey);
        if (answer) break;
      }
      if (!answer) return { id, label, state: "none" };
      const { lyrics, credit } = answer;
      return { id, label, state: "found", sync: SYNC[lyrics.Type], lines: countLines(lyrics), credit, lyrics };
    }
    const lyrics = await fetchers[id](track);
    if (!lyrics?.Type) return { id, label, state: "none" };
    const found: Outcome = { id, label, state: "found", sync: SYNC[lyrics.Type], lines: countLines(lyrics), lyrics };
    if (id === "unison") {
      const who = lyrics.UnisonSubmitter;
      found.credit = {
        text: "Lyrics from Unison",
        people: who?.name ? [{ role: "made by", name: String(who.name), url: safeUrl(who.url) }] : [],
      };
    }
    return found;
  } catch (error) {
    return { id, label, state: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}

/** Ask every provider about the song, all at once, and say what each one had. */
export function lookupAll(track: TrackInfo): Promise<Outcome[]> {
  return Promise.all(ALL_IDS.map((id) => lookupOne(id, track)));
}
