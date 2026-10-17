import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ALL_IDS, config, lookupOne, type Outcome } from "./lookup.ts";
import { clearResolved, resolveTrack, type Resolved } from "./resolve.ts";
import { spotifyNowPlaying } from "./spotifyLocal.ts";
import { embeddedLyricsFromFile, ensureIndexed, findFiles, findViaWindowsSearch } from "./local.ts";
import { vlcCurrentPath } from "./vlc.ts";
import { clearCached, getCached, putCached } from "./cache.ts";

/** Which song a cached result belongs to: its artist and title (a different cut or player gives the same). */
const cacheKey = (m: Media) => `${flatName(m.artist ?? "")}|${flatName(m.title ?? "")}`;

export const LABELS: Record<string, string> = { ...PROVIDER_LABELS, embedded: "Embedded lyrics" };

const flatName = (text: string) => text.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
import { DEFAULT_ORDER, PROVIDER_LABELS } from "./utils/Lyrics/providers/registry.ts";
import type { LyricsProviderId } from "./utils/Lyrics/providers/registry.ts";
import type { TrackInfo } from "./utils/Lyrics/providers/types.ts";

/** What Windows reports is playing (see smtc.ps1). */
export type Media = {
  none?: boolean;
  app?: string;
  title?: string;
  artist?: string;
  album?: string;
  status?: string;
  positionMs?: number;
  durationMs?: number;
  cover?: string;
  canSeek?: boolean;
  /** What is known about the audio being played, e.g. "High (160 kbps)" or "FLAC · 44.1 kHz · 16-bit". */
  quality?: string;
  /** The song's Spotify Canvas, when Spotify is the player and its debugger port is open. */
  canvas?: { url: string; type: string };
  /** VLC is playing a video file (the server can hand it to the page, see /videofile). */
  video?: boolean | { src: string };
  /** Spotify's own heart / shuffle / repeat (0 off, 1 all, 2 one) / volume (0 to 1), when its debugger port is open. */
  spotify?: { heart: boolean; shuffle: boolean; repeat: number; volume: number };
  at?: number;
};

type Id = (typeof ALL_IDS)[number];
const RANK: Record<string, number> = { word: 3, line: 2, none: 1 };

const PICKS_FILE = fileURLToPath(new URL("../data/picks.json", import.meta.url));
const picks: Record<string, Id> = existsSync(PICKS_FILE) ? JSON.parse(readFileSync(PICKS_FILE, "utf8")) : {};

export type Search = {
  key: string;
  /** The song as the lyrics sources are asked about it; absent until it is found. */
  track?: TrackInfo;
  cover?: string;
  spotifyCover?: string;
  outcomes: Map<Id, Outcome>;
  pending: Set<Id>;
  resolving: boolean;
};

const searches = new Map<string, Search>();
export let current: Search | null = null;

const order = (): Id[] => {
  const wanted = (config as any).order as Id[] | undefined;
  const base = (wanted?.length ? wanted : (DEFAULT_ORDER as Id[])).filter((id) => ALL_IDS.includes(id));
  // The song's own file comes first unless it has been placed somewhere else.
  const rest = ALL_IDS.filter((id) => !base.includes(id));
  return [...rest.filter((id) => id === "embedded"), ...base, ...rest.filter((id) => id !== "embedded")];
};
const preferBestSync = () => (config as any).preferBestSync !== false;

export const mediaKey = (m: Media) => `${m.artist}|${m.title}|${m.album}|${Math.round((m.durationMs ?? 0) / 1000)}`;

/** The source to show: the song's pinned one, else the best of what has been found so far. */
export function choose(search: Search): Id | null {
  const pinned = picks[pinKey(search)];
  const pinnedOutcome = pinned ? search.outcomes.get(pinned) : undefined;
  if (pinnedOutcome?.state === "found") return pinned;

  const found = order().filter((id) => search.outcomes.get(id)?.state === "found");
  if (found.length === 0) return null;

  if (preferBestSync()) {
    // Highest sync wins; the priority list breaks ties.
    return found.reduce((best, id) => (RANK[search.outcomes.get(id)!.sync ?? "none"] > RANK[search.outcomes.get(best)!.sync ?? "none"] ? id : best));
  }
  // Priority only: the first listed source that has it, once every source above it has answered.
  for (const id of order()) {
    if (search.outcomes.get(id)?.state === "found") return id;
    if (search.pending.has(id)) return null;
  }
  return found[0];
}

const pinKey = (s: Search) => (s.track ? `${s.track.artist}|${s.track.name}`.toLowerCase() : s.key.toLowerCase());

export function pin(key: string, id: Id | null): void {
  const search = searches.get(key);
  if (!search) return;
  if (id) picks[pinKey(search)] = id;
  else delete picks[pinKey(search)];
  mkdirSync(dirname(PICKS_FILE), { recursive: true });
  writeFileSync(PICKS_FILE, JSON.stringify(picks));
}

export const pinned = (s: Search): Id | null => picks[pinKey(s)] ?? null;

// Timing corrections (ms) per song and source: only song names, source ids and numbers.
const OFFSETS_FILE = fileURLToPath(new URL("../data/offsets.json", import.meta.url));
const offsets: Record<string, number> = existsSync(OFFSETS_FILE) ? JSON.parse(readFileSync(OFFSETS_FILE, "utf8")) : {};
const offsetKey = (s: Search, id: Id) => `${pinKey(s)}|${id}`;

export function setOffset(key: string, id: Id, ms: number): void {
  const search = searches.get(key);
  if (!search || !Number.isFinite(ms)) return;
  const rounded = Math.max(-5000, Math.min(5000, Math.round(ms)));
  if (rounded === 0) delete offsets[offsetKey(search, id)];
  else offsets[offsetKey(search, id)] = rounded;
  mkdirSync(dirname(OFFSETS_FILE), { recursive: true });
  writeFileSync(OFFSETS_FILE, JSON.stringify(offsets));
}
export const searchByKey = (key: string) => searches.get(key);

type Listener = () => void;
const listeners = new Set<Listener>();
export const onChange = (fn: Listener) => void listeners.add(fn);
const changed = () => listeners.forEach((fn) => fn());

/** Ask every source about the playing song again, from scratch (the song is found on Spotify again too). */
export function recheck(m: Media): void {
  if (m.none || !m.title) return;
  clearCached(cacheKey(m));
  searches.delete(mediaKey(m));
  clearResolved();
  current = null;
  ensureSearch(m);
  changed();
}

/** Start (or return) the search for what is playing. Songs are searched once per play; results stay in memory only. */
export function ensureSearch(m: Media): Search | null {
  if (m.none || !m.title) return null;
  const key = mediaKey(m);
  let search = searches.get(key);
  if (!search) {
    search = { key, outcomes: new Map(), pending: new Set(ALL_IDS), resolving: true };
    searches.set(key, search);
    // Keep memory small: the last 30 songs.
    if (searches.size > 30) searches.delete(searches.keys().next().value as string);
    void run(search, m);
  }
  current = search;
  return search;
}

async function run(search: Search, m: Media): Promise<void> {
  let resolved: Resolved;
  try {
    // When Spotify is the player and its debugger port is open, it names the song exactly.
    let hint: string | undefined;
    if (/spotify/i.test(m.app ?? "")) {
      const now = await spotifyNowPlaying();
      if (now && flatName(now.name) === flatName(m.title ?? "")) hint = now.id;
    }
    resolved = await resolveTrack({ title: m.title ?? "", artist: m.artist ?? "", album: m.album ?? "", durationMs: m.durationMs ?? 0 }, hint);
  } catch {
    resolved = {
      track: { name: m.title ?? "", artist: m.artist ?? "", album: m.album ?? "", durationMs: m.durationMs ?? 0 },
      spotify: "missing",
    };
  }
  search.track = resolved.track;
  search.cover = resolved.cover;
  search.spotifyCover = resolved.spotifyCover;
  search.resolving = false;
  changed();

  const songKey = cacheKey(m);
  const switchedOff = new Set(((config as any).disabled as string[] | undefined) ?? []);
  await Promise.all(
    ALL_IDS.map(async (id) => {
      const outcome: Outcome = id === "embedded" && !switchedOff.has(id)
        ? await embeddedOutcome(m, resolved.track)
        : switchedOff.has(id)
        ? { id, label: LABELS[id], state: "skipped", detail: "Switched off in config.json" }
        : getCached(songKey, id) ?? (await lookupOne(id, resolved.track));
      putCached(songKey, id, outcome);
      search.outcomes.set(id, outcome);
      search.pending.delete(id);
      changed();
    })
  );
}

/** What the page is told about a search: everything but the lyrics themselves. */
export function describe(search: Search) {
  const chosen = choose(search);
  return {
    key: search.key,
    resolving: search.resolving,
    searching: search.pending.size > 0,
    chosen,
    pinned: pinned(search),
    track: search.track,
    sources: order().map((id) => {
      const o = search.outcomes.get(id);
      return {
        id,
        label: LABELS[id],
        state: o ? o.state : "searching",
        sync: o?.sync,
        lines: o?.lines,
        detail: o?.detail,
      };
    }),
    credit: chosen ? search.outcomes.get(chosen)?.credit : undefined,
    offsetMs: chosen ? (offsets[offsetKey(search, chosen)] ?? 0) : 0,
  };
}

export const lyricsOf = (search: Search, id: Id) => search.outcomes.get(id)?.lyrics ?? null;

/** Lyrics inside the playing song''s own file: the file VLC has open, or the one in your music folders that matches. */
async function embeddedOutcome(m: Media, track: TrackInfo): Promise<Outcome> {
  const base = { id: "embedded" as Id, label: LABELS.embedded };
  try {
    // The file VLC has open, else the files that match in the music folders, else any on the PC that Windows has indexed.
    // Several can match (copies); the first that actually has lyrics in it is used.
    const candidates: string[] = [];
    if (m.app === "VLC") {
      const open = await vlcCurrentPath();
      if (open) candidates.push(open);
    }
    if (candidates.length === 0) {
      await ensureIndexed();
      candidates.push(...findFiles(m.title ?? track.name, m.artist ?? track.artist, m.album ?? track.album));
      candidates.push(...(await findViaWindowsSearch(m.title ?? track.name, m.artist ?? track.artist)).filter((p) => !candidates.includes(p)));
    }
    if (candidates.length === 0) return { ...base, state: "none", detail: "No matching file found on this PC" };
    let lyrics: any = null;
    for (const path of candidates.slice(0, 6)) {
      lyrics = await embeddedLyricsFromFile(path, m.durationMs ?? track.durationMs);
      if (lyrics) break;
    }
    if (!lyrics) return { ...base, state: "none", detail: "The file has no lyrics in it" };    const sync = lyrics.Type === "Syllable" ? "word" : lyrics.Type === "Line" ? "line" : "none";
    return { ...base, state: "found", sync, lines: (lyrics.Lines ?? lyrics.Content ?? []).length, lyrics };
  } catch (error) {
    return { ...base, state: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}