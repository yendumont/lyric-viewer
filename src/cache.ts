import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Outcome } from "./lookup.ts";

// Lyrics found by the online sources are kept on this PC for a few days, so a song played again is not searched
// again. Not kept: Spicy Lyrics' answers (its terms: not stored), lyrics from the song's own file (read fresh), and
// errors. A source that had nothing is remembered for a shorter time, since lyrics get added.

const FILE = fileURLToPath(new URL("../data/lyrics-cache.json", import.meta.url));
const FOUND_MS = 3 * 24 * 3600_000;
const NONE_MS = 6 * 3600_000;
const MAX_SONGS = 300;

type Stored = { at: number; outcome: Outcome };
type Song = { at: number; sources: Record<string, Stored> };

let songs: Record<string, Song> = {};
try {
  if (existsSync(FILE)) songs = JSON.parse(readFileSync(FILE, "utf8"));
} catch {
  songs = {};
}

let timer: ReturnType<typeof setTimeout> | null = null;
function save(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      const keys = Object.keys(songs);
      if (keys.length > MAX_SONGS) {
        keys.sort((a, b) => songs[a].at - songs[b].at).slice(0, keys.length - MAX_SONGS).forEach((k) => delete songs[k]);
      }
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(`${FILE}.tmp`, JSON.stringify(songs));
      renameSync(`${FILE}.tmp`, FILE);
    } catch {
      // the cache is only a convenience
    }
  }, 2000);
}

const cacheable = (id: string) => id !== "spicy" && id !== "embedded";

export function getCached(songKey: string, id: string): Outcome | null {
  if (!cacheable(id)) return null;
  const entry = songs[songKey]?.sources[id];
  if (!entry) return null;
  const ttl = entry.outcome.state === "found" ? FOUND_MS : NONE_MS;
  if (Date.now() - entry.at > ttl) return null;
  return entry.outcome;
}

export function putCached(songKey: string, id: string, outcome: Outcome): void {
  if (!cacheable(id) || (outcome.state !== "found" && outcome.state !== "none")) return;
  const song = (songs[songKey] ??= { at: Date.now(), sources: {} });
  song.at = Date.now();
  song.sources[id] = { at: Date.now(), outcome };
  save();
}

export function clearCached(songKey: string): void {
  delete songs[songKey];
  save();
}
