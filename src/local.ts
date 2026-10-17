import { fileURLToPath } from "node:url";
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { config } from "./lookup.ts";
import { embeddedLyricsOf } from "./utils/LocalEmbed/EmbeddedLyrics.ts";
import { readTags } from "./utils/LocalEmbed/Tags.ts";
import { sameName } from "./names.ts";

// Lyrics stored inside the music files themselves (the lyrics tag, an embedded TTML or LRC, a synced-lyrics
// frame). The playing song is matched to a file in your music folders by its title and artist (or, for VLC,
// the exact file VLC has open). The index keeps only titles, artists and paths, never lyrics; lyrics are read
// from the file when needed.

const AUDIO = new Set([".mp3", ".flac", ".m4a", ".mp4", ".aac", ".ogg", ".oga", ".opus"]);
const INDEX_FILE = fileURLToPath(new URL("../data/music-index.json", import.meta.url));

type Entry = { path: string; size: number; mtime: number; title: string; artists: string[]; album: string };
let index: Entry[] = [];
let scannedAt = 0;
let scanning: Promise<void> | null = null;

const flat = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const musicFolders = (): string[] => {
  const given = (config as any).musicFolders as string[] | undefined;
  const folders = given?.length ? given : [join(process.env.USERPROFILE ?? "", "Music")];
  return folders.filter((f) => f && existsSync(f));
};

function* walk(folder: string, depth = 0): Generator<string> {
  if (depth > 8) return;
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(folder, name);
    let info;
    try {
      info = statSync(path);
    } catch {
      continue;
    }
    if (info.isDirectory()) yield* walk(path, depth + 1);
    else if (AUDIO.has(extname(name).toLowerCase())) yield path;
  }
}

function loadSaved(): Entry[] {
  try {
    return existsSync(INDEX_FILE) ? JSON.parse(readFileSync(INDEX_FILE, "utf8")) : [];
  } catch {
    return [];
  }
}

/** Read the tags of every audio file in the music folders (files that have not changed are not read again). */
export function scanMusic(): Promise<void> {
  if (scanning) return scanning;
  scanning = (async () => {
    const known = new Map((index.length ? index : loadSaved()).map((e) => [e.path, e]));
    const files = musicFolders().flatMap((folder) => [...walk(folder)]);
    const next: Entry[] = [];
    let at = 0;
    const worker = async () => {
      while (at < files.length) {
        const path = files[at++];
        try {
          const info = statSync(path);
          const old = known.get(path);
          if (old && old.size === info.size && old.mtime === info.mtimeMs) {
            next.push(old);
            continue;
          }
          const tags = await readTags(Bun.file(path));
          next.push({ path, size: info.size, mtime: info.mtimeMs, title: tags.title ?? "", artists: tags.artists, album: tags.album ?? "" });
        } catch {
          // an unreadable file is skipped
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    index = next;
    scannedAt = Date.now();
    try {
      mkdirSync(dirname(INDEX_FILE), { recursive: true });
      writeFileSync(INDEX_FILE, JSON.stringify(index));
    } catch {
      // the index is only a cache
    }
  })().finally(() => {
    scanning = null;
  });
  return scanning;
}

const nameOf = (path: string) => flat(path.replace(/^.*[\\/]/, "").replace(/\.[A-Za-z0-9]+$/, ""));

/** The file a song is, by title and artist (the artist may be missing from the file's tags: its name then has to hold both). */
export function findFiles(title: string, artist: string, album: string): string[] {
  const wantTitle = flat(title);
  const wantArtist = flat(artist.split(/\s*[;,&]\s*/)[0] || artist);
  if (!wantTitle) return [];
  const found: { path: string; score: number }[] = [];
  for (const e of index) {
    let score = 0;
    const entryTitle = flat(e.title);
    const file = nameOf(e.path);
    if (entryTitle && entryTitle === wantTitle) score += 4;
    else if (!entryTitle && (file === wantTitle || file.endsWith(wantTitle))) score += 3;
    else continue;
    if (wantArtist) {
      if (e.artists.some((a) => sameName(flat(a), wantArtist))) score += 3;
      else if (` ${file} `.includes(` ${wantArtist} `)) score += 2;
      else if (e.artists.length > 0) continue;
    }
    if (album && flat(e.album) === flat(album)) score += 1;
    if (score >= 4) found.push({ path: e.path, score });
  }
  return found.sort((a, b) => b.score - a.score).map((f) => f.path);
}

const searchCache = new Map<string, string[]>();

/**
 * The file anywhere on the PC that Windows has indexed (by default everything under C:\Users, plus any folder or drive
 * added to Windows' search settings): asks Windows Search, the same index File Explorer's search box uses, which is
 * instant. A folder that is not indexed is found only if it is among the music folders.
 */
export async function findViaWindowsSearch(title: string, artist: string): Promise<string[]> {
  const key = `${flat(title)}|${flat(artist)}`;
  const cached = searchCache.get(key);
  if (cached) return cached;
  const script = `
    $t = ($env:LV_TITLE -replace "'", "''")
    try {
      $c = New-Object -ComObject ADODB.Connection
      $c.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
      $q = "SELECT TOP 60 System.ItemPathDisplay, System.Title, System.Music.Artist FROM SystemIndex WHERE (System.Title = '$t' OR System.FileName LIKE '%$t%') AND (System.FileExtension = '.mp3' OR System.FileExtension = '.flac' OR System.FileExtension = '.m4a' OR System.FileExtension = '.mp4' OR System.FileExtension = '.aac' OR System.FileExtension = '.ogg' OR System.FileExtension = '.oga' OR System.FileExtension = '.opus')"
      $r = $c.Execute($q)
      $rows = @()
      while (-not $r.EOF) { $rows += [pscustomobject]@{ path = [string]$r.Fields.Item(0).Value; title = [string]$r.Fields.Item(1).Value; artists = @($r.Fields.Item(2).Value) }; $r.MoveNext() }
      $c.Close()
      ConvertTo-Json -InputObject $rows -Compress
    } catch { "[]" }`;
  let rows: { path: string; title: string; artists: string[] }[] = [];
  try {
    const proc = Bun.spawn(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      env: { ...process.env, LV_TITLE: title },
      stdout: "pipe",
      stderr: "ignore",
    });
    const timer = setTimeout(() => proc.kill(), 6000);
    const text = (await new Response(proc.stdout).text()).trim();
    clearTimeout(timer);
    const parsed = text ? JSON.parse(text) : [];
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    rows = [];
  }

  const wantTitle = flat(title);
  const wantArtist = flat(artist.split(/\s*[;,&]\s*/)[0] || artist);
  const found: { path: string; score: number }[] = [];
  for (const row of rows) {
    let score = 0;
    const rowTitle = flat(row.title ?? "");
    const file = nameOf(row.path);
    if (rowTitle === wantTitle) score += 4;
    else if (file === wantTitle || file.endsWith(` ${wantTitle}`)) score += 3;
    else continue;
    const artists = (row.artists ?? []).map(String).filter(Boolean);
    if (wantArtist) {
      if (artists.some((a) => sameName(flat(a), wantArtist))) score += 3;
      else if (` ${file} `.includes(` ${wantArtist} `)) score += 2;
      else if (artists.length > 0) continue;
    }
    if (score >= 4) found.push({ path: row.path, score });
  }
  const paths = found.sort((a, b) => b.score - a.score).map((f) => f.path);
  searchCache.set(key, paths);
  return paths;
}

/** The lyrics a file carries, shown as synced as they are; null when there are none. */
export async function embeddedLyricsFromFile(path: string, durationMs: number): Promise<any | null> {
  try {
    const tags = await readTags(Bun.file(path));
    return embeddedLyricsOf(tags, durationMs / 1000);
  } catch {
    return null;
  }
}

/** Start scanning now, and again every few minutes so new files are found. */
export function startMusicIndex(): void {
  void scanMusic();
  setInterval(() => void scanMusic(), 5 * 60_000);
}

export async function ensureIndexed(): Promise<void> {
  if (index.length === 0 || Date.now() - scannedAt > 60_000) await scanMusic().catch(() => undefined);
}
