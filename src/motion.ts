import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sameName } from "./names.ts";

// Apple Music's animated album covers. The album is found with iTunes' search, the album page names the cover's
// HLS stream, and that stream is one fragmented MP4 file (the playlist only slices it by byte range), so the file is
// downloaded once whole and served from disk: the page plays it as an ordinary looping video, no HLS player needed.

const DIR = new URL("../data/motion/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const NONE_FILE = join(DIR, "none.json");
const NONE_MS = 7 * 24 * 3600_000;
const MAX_FILES = 40;

const plain = (v: string) =>
  v
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const keyOf = (artist: string, album: string) => {
  let h = 5381;
  for (const ch of `${plain(artist)}|${plain(album)}`) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
};

let none: Record<string, number> = {};
try {
  if (existsSync(NONE_FILE)) none = JSON.parse(readFileSync(NONE_FILE, "utf8"));
} catch {
  none = {};
}
const remember = (key: string) => {
  none[key] = Date.now();
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(NONE_FILE, JSON.stringify(none));
  } catch {
    // only a convenience
  }
};

const pending = new Map<string, Promise<string | null>>();

type Album = { collectionId?: number; collectionName?: string; artistName?: string };

async function itunes(term: string, entity: "album" | "song"): Promise<Album[]> {
  const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=25&country=us`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`itunes ${res.status}`);
  return ((await res.json()) as { results?: Album[] }).results ?? [];
}

/** The albums that are this album by this artist, best guess first (an album search alone often misses it, so the song is searched too). */
async function findAlbums(artist: string, album: string, track: string): Promise<number[]> {
  // A search that failed (iTunes busy, offline) is an error, not "no such album": nothing is remembered about it.
  const [byAlbum, bySong] = await Promise.all([
    itunes(`${artist} ${album}`, "album"),
    track ? itunes(`${artist} ${track}`, "song").catch(() => [] as Album[]) : Promise.resolve([] as Album[]),
  ]);
  const wantArtist = plain(artist);
  const wantAlbum = plain(album);
  const same = (r: Album) => {
    const a = plain(r.artistName ?? "");
    const c = plain(r.collectionName ?? "");
    return !!r.collectionId && !!a && !!c && sameName(a, wantArtist) && (c === wantAlbum || sameName(c, wantAlbum));
  };
  const found = new Map<number, { name: string; fromSong: boolean }>();
  for (const [list, fromSong] of [[bySong, true], [byAlbum, false]] as const) {
    for (const r of list.filter(same)) {
      const id = r.collectionId as number;
      found.set(id, { name: plain(r.collectionName ?? ""), fromSong: fromSong || !!found.get(id)?.fromSong });
    }
  }
  return [...found.entries()]
    .sort(([, x], [, y]) => Number(y.name === wantAlbum) - Number(x.name === wantAlbum) || Number(y.fromSong) - Number(x.fromSong))
    .slice(0, 5)
    .map(([id]) => id);
}

async function squareStream(id: number): Promise<string | null> {
  const res = await fetch(`https://music.apple.com/us/album/x/${id}`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const at = html.indexOf("motionDetailSquare");
  if (at === -1) return null;
  const found = html.slice(at, at + 4000).match(/video\\?":\\?"(https:[^"\\]+?\.m3u8)/);
  return found ? found[1].replace(/\\\//g, "/") : null;
}

/** The largest H.264 variant up to 800 px (this Chromium plays it; the sharper ones are only more to download). */
async function pickVariant(master: string): Promise<string | null> {
  const text = await (await fetch(master, { signal: AbortSignal.timeout(10_000) })).text();
  const lines = text.split("\n").map((l) => l.trim());
  let best: { size: number; url: string } | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
    const size = Number(/RESOLUTION=(\d+)x/.exec(lines[i])?.[1] ?? 0);
    const avc = /CODECS="avc1/.test(lines[i]);
    const uri = lines[i + 1];
    if (!avc || !uri || uri.startsWith("#") || size > 800) continue;
    if (!best || size > best.size) best = { size, url: new URL(uri, master).toString() };
  }
  return best?.url ?? null;
}

/** The whole media file a variant playlist slices up: its init section's file (every slice is in it). */
async function fileOf(variant: string): Promise<Uint8Array | null> {
  const text = await (await fetch(variant, { signal: AbortSignal.timeout(10_000) })).text();
  const uri = /#EXT-X-MAP:URI="([^"]+)"/.exec(text)?.[1];
  if (!uri) return null;
  const res = await fetch(new URL(uri, variant).toString(), { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

function prune(): void {
  try {
    const files = new Bun.Glob("*.mp4").scanSync(DIR);
    const all = [...files].map((f) => ({ f, at: statSync(join(DIR, f)).mtimeMs })).sort((a, b) => a.at - b.at);
    for (const old of all.slice(0, Math.max(0, all.length - MAX_FILES))) Bun.spawnSync(["cmd", "/c", "del", join(DIR, old.f)]);
  } catch {
    // fine
  }
}

/** The key of the album's animated cover file (served by `motionFile`), or null when it has none. */
export function animatedCover(artist: string, album: string, track: string): Promise<string | null> {
  if (!artist || !album) return Promise.resolve(null);
  const key = keyOf(artist, album);
  if (existsSync(join(DIR, `${key}.mp4`))) return Promise.resolve(key);
  if (none[key] && Date.now() - none[key] < NONE_MS) return Promise.resolve(null);
  let job = pending.get(key);
  if (!job) {
    job = (async () => {
      const ids = await findAlbums(artist, album, track);
      if (!ids.length) {
        remember(key);
        return null;
      }
      let failed = false;
      for (const id of ids) {
        try {
          const master = await squareStream(id);
          if (!master) continue;
          const variant = await pickVariant(master);
          const bytes = variant ? await fileOf(variant) : null;
          if (!bytes) continue;
          mkdirSync(DIR, { recursive: true });
          writeFileSync(join(DIR, `${key}.tmp`), bytes);
          renameSync(join(DIR, `${key}.tmp`), join(DIR, `${key}.mp4`));
          prune();
          return key;
        } catch {
          failed = true;
        }
      }
      // Only a clean "none" is remembered; a network failure is tried again next time.
      if (!failed) remember(key);
      return null;
    })()
      .catch(() => null)
      .finally(() => pending.delete(key));
    pending.set(key, job);
  }
  return job;
}

/** The cover file as a response, with the byte ranges a video element asks for. */
export function motionFile(key: string, range: string | null): Response {
  return rangeFile(join(DIR, `${key.replace(/[^a-z0-9]/gi, "")}.mp4`), range, "video/mp4");
}

/** Any file as a response, with the byte ranges a video element asks for. */
export function rangeFile(path: string, range: string | null, type: string): Response {
  if (!existsSync(path)) return new Response("not found", { status: 404 });
  const file = Bun.file(path);
  const size = file.size;
  const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
  if (!m) return new Response(file, { headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" } });
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" },
  });
}
