import { fileURLToPath } from "node:url";
import "./shim.ts";
import worker from "./worker/worker.js";
import { WORKER_BASE } from "./shim.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { config } from "./lookup.ts";
import { current, describe, ensureSearch, lyricsOf, onChange, pin, recheck, searchByKey, setOffset, type Media } from "./engine.ts";
import { ALL_IDS } from "./lookup.ts";
import { spotifyCanvas, spotifyDo, spotifyQuality, type SpotifyCanvas } from "./spotifyLocal.ts";
import { animatedCover, motionFile, rangeFile } from "./motion.ts";
import { readSettings, writeSettings } from "./settings.ts";
import { scanMusic, startMusicIndex } from "./local.ts";
import { vlcArt, vlcCommand, vlcCurrentPath, vlcMedia } from "./vlc.ts";

// Lyrics Viewer (#Hype): shows synced lyrics for whatever Windows says is playing, in Spicy Lyrics' style.
// Personal use only (see README.txt). Everything runs on this PC; the page is only served to it.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC = join(ROOT, "public");
const PORT = Number((config as any).port) || 3838;
const HOST = "127.0.0.1";
const address = `http://${HOST}:${PORT}`;
const workerFetch = (worker as any).fetch.bind(worker);

// ---- what is playing -------------------------------------------------------------------------

let media: Media = { none: true };
/** What Windows reports, what VLC reports, and Spotify's streaming quality (when its debugger port is open). */
let smtcMedia: Media = { none: true };
let vlcNow: Media | null = null;
let spotifyQualityText: string | null = null;
let spotifyCanvasNow: SpotifyCanvas | null = null;
/** The video file VLC is playing (only this one is ever served, and only when it is a video file). */
let vlcVideo: { id: string; path: string } | null = null;
let vlcVideoFor = "";
const VIDEO_TYPES: Record<string, string> = { ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska", ".mov": "video/mp4" };
let pausedSince: number | null = null;
const IDLE_AFTER_MS = 60_000;
const smtc = Bun.spawn(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(ROOT, "src", "smtc.ps1")], {
  stdin: "pipe",
  stdout: "pipe",
  stderr: "ignore",
});

(async () => {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of smtc.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    let at: number;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line) continue;
      try {
        smtcMedia = JSON.parse(line);
        recompute();
      } catch {
        // A partial or odd line: the next one fixes it.
      }
    }
  }
})();

/** Pick what to show: whichever player is playing (Windows' first), else the one paused most recently; idle after a minute. */
function recompute(): void {
  const smtcPlaying = !smtcMedia.none && smtcMedia.status === "Playing";
  const vlcPlaying = vlcNow?.status === "Playing";
  let picked: Media = smtcMedia;
  if (vlcNow && (vlcPlaying || smtcMedia.none) && !smtcPlaying) picked = vlcNow;
  if (picked === vlcNow && picked.video) picked = { ...picked, video: vlcVideo ? { src: `/videofile?v=${vlcVideo.id}` } : undefined };
  if (!picked.none && /spotify/i.test(picked.app ?? "") && spotifyQualityText) picked = { ...picked, quality: spotifyQualityText };
  // The Canvas read from Spotify belongs to the song only while the names agree (it is read a moment after a change).
  if (!picked.none && /spotify/i.test(picked.app ?? "") && spotifyCanvasNow) {
    const s = spotifyCanvasNow;
    picked = { ...picked, spotify: { heart: s.heart, shuffle: s.shuffle, repeat: s.repeat, volume: s.volume } };
    if (s.url && s.name.toLowerCase() === (picked.title ?? "").toLowerCase()) picked = { ...picked, canvas: { url: s.url, type: s.type ?? "VIDEO_LOOPING" } };
  }

  // A song paused for longer than a minute (or a tab left open on one) is not "what is playing": show the idle screen.
  if (!picked.none && picked.status !== "Playing") {
    pausedSince ??= Date.now();
    if (Date.now() - pausedSince > IDLE_AFTER_MS) picked = { none: true };
  } else {
    pausedSince = null;
  }
  media = picked;
  ensureSearch(media);
  broadcast();
}

setInterval(async () => {
  const before = JSON.stringify(vlcNow);
  vlcNow = await vlcMedia();
  // A video file: find which one (once per song), so the page can show it.
  if (vlcNow?.video) {
    const id = `${vlcNow.title}|${vlcNow.artist}|${vlcNow.durationMs}`;
    if (vlcVideoFor !== id) {
      vlcVideoFor = id;
      vlcVideo = null;
      const path = await vlcCurrentPath();
      const type = path ? VIDEO_TYPES[extname(path).toLowerCase()] : undefined;
      if (path && type && existsSync(path)) vlcVideo = { id: Math.abs([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36), path };
      recompute();
    }
  } else if (vlcVideoFor) {
    vlcVideoFor = "";
    vlcVideo = null;
  }
  // VLC's position moves every second; only a change of song or state needs an immediate update.
  if (vlcNow || before !== "null") recompute();
}, 100);

setInterval(async () => {
  if (/spotify/i.test(smtcMedia.app ?? "")) spotifyQualityText = await spotifyQuality();
  else spotifyQualityText = null;
}, 5000);

// The Canvas follows the song quickly (it is asked about on every change of song) but is not asked about while another player plays.
async function pollSpotify(): Promise<void> {
  if (!/spotify/i.test(smtcMedia.app ?? "") || smtcMedia.none) {
    if (spotifyCanvasNow) {
      spotifyCanvasNow = null;
      recompute();
    }
    return;
  }
  const next = await spotifyCanvas();
  const before = JSON.stringify(spotifyCanvasNow);
  spotifyCanvasNow = next;
  if (JSON.stringify(next) !== before) recompute();
}
setInterval(() => void pollSpotify(), 1500);

const send = (command: string) => {
  if (media.app === "VLC") return void vlcCommand(command);
  smtc.stdin.write(`${command}\n`);
  smtc.stdin.flush();
};

// ---- live updates to the page ----------------------------------------------------------------

const clients = new Set<ReadableStreamDefaultController<string>>();

function state() {
  const search = media.none ? null : current;
  return {
    media,
    search: search ? describe(search) : null,
    prefs: { preferBestSync: (config as any).preferBestSync !== false },
    now: Date.now(),
  };
}

function broadcast() {
  if (clients.size === 0) return;
  const payload = `data: ${JSON.stringify(state())}\n\n`;
  for (const client of clients) {
    try {
      client.enqueue(payload);
    } catch {
      clients.delete(client);
    }
  }
}
onChange(broadcast);

// ---- covers ---------------------------------------------------------------------------------

const covers = new Map<string, { type: string; bytes: Uint8Array }>();

async function coverFor(key: string, videoSong = false): Promise<Response> {
  const headers = (type: string) => ({ "Content-Type": type, "Cache-Control": "no-store" });

  /** The player's own picture: VLC's artwork, or the thumbnail Windows has. Marked so the page can tidy bars off it. */
  const playerCover = async (): Promise<Response | null> => {
    if (media.app === "VLC" && current?.key === key) {
      const art = await vlcArt();
      if (art) return new Response(art.bytes, { headers: { ...headers(art.type), "X-Cover-Source": "player" } });
    }
    const local = media.cover && existsSync(media.cover) && current?.key === key ? media.cover : null;
    if (!local) return null;
    const bytes = new Uint8Array(readFileSync(local));
    return new Response(bytes, { headers: { ...headers(bytes[0] === 0x89 ? "image/png" : "image/jpeg"), "X-Cover-Source": "player" } });
  };
  const fromUrl = (kind: "spotify" | "apple") => async (): Promise<Response | null> => {
    const remote = await remoteCover(key, kind);
    return remote ? new Response(remote.bytes, { headers: headers(remote.type) }) : null;
  };

  // When Spotify is the player its catalogue cover is the truth: its own picture for the song, then the player's
  // thumbnail, then Apple's. Anything else (SoundCloud, YouTube, files) shows the cover its own player has, since a
  // search by title can land on another song's cover; search covers are the fallback.
  const fromSpotify = /spotify/i.test(media.app ?? "");
  // A video file has no cover of its own (its artwork is a frame of the video): only the catalogues' covers count.
  const order = videoSong
    ? [fromUrl("apple"), fromUrl("spotify")]
    : fromSpotify
      ? [fromUrl("spotify"), playerCover, fromUrl("apple")]
      : [playerCover, fromUrl("apple"), fromUrl("spotify")];
  for (const step of order) {
    const hit = await step();
    if (hit) return hit;
  }
  return new Response("", { status: 404 });
}

async function remoteCover(key: string, kind: "spotify" | "apple"): Promise<{ type: string; bytes: Uint8Array } | null> {
  const search = searchByKey(key);
  const url = kind === "spotify" ? search?.spotifyCover : search?.cover;
  if (!url?.startsWith("https://")) return null;
  const have = covers.get(url);
  if (have) return have;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      const result = { type: res.headers.get("content-type") ?? "image/jpeg", bytes };
      covers.set(url, result);
      if (covers.size > 60) covers.delete(covers.keys().next().value as string);
      return result;
    }
  } catch {
    // no cover from this source
  }
  return null;
}
// ---- fonts ---------------------------------------------------------------------------------
// Spicy Lyrics' lyric fonts live on its font server, which only lets Spotify's own page load them.
// They are fetched here instead, once, and kept in data/fonts.
const FONT_HOST = "https://fonts.spikerko.org/";
const FONT_FAMILIES = new Set(["spicy-lyrics", "Vazirmatn", "NotoSansGeorgian"]);

async function fontFile(path: string): Promise<Response> {
  const [family, ...rest] = path.split("/");
  const name = rest.join("/");
  if (!FONT_FAMILIES.has(family) || !/^[\w.-]+$/.test(name)) return new Response("", { status: 404 });

  const cached = join(ROOT, "data", "fonts", family, name);
  const type = name.endsWith(".css") ? "text/css" : name.endsWith(".woff2") ? "font/woff2" : "font/ttf";
  if (existsSync(cached)) return new Response(Bun.file(cached), { headers: { "Content-Type": type, "Cache-Control": "max-age=86400" } });
  try {
    const res = await fetch(`${FONT_HOST}${family}/${name}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return new Response("", { status: 404 });
    const bytes = new Uint8Array(await res.arrayBuffer());
    mkdirSync(join(ROOT, "data", "fonts", family), { recursive: true });
    writeFileSync(cached, bytes);
    return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "max-age=86400" } });
  } catch {
    return new Response("", { status: 502 });
  }
}

// ---- http -----------------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    // Only this PC's own page may talk to the server (it could otherwise be driven by any website open in a browser).
    // The Host must be this PC's own address too: a website that points its own name at 127.0.0.1 ("DNS rebinding") would otherwise be
    // allowed to read what is playing, as such a request carries no Origin. And a request that changes anything has to come from the page.
    const ownHosts = [`${HOST}:${PORT}`, `localhost:${PORT}`];
    if (!ownHosts.includes(req.headers.get("host") ?? "")) return new Response("", { status: 403 });
    const origin = req.headers.get("origin");
    if (origin && origin !== `http://${HOST}:${PORT}` && origin !== `http://localhost:${PORT}`) return new Response("", { status: 403 });
    if (!origin && req.method !== "GET" && req.method !== "HEAD") return new Response("", { status: 403 });

    if (url.pathname === "/events") {
      let controller!: ReadableStreamDefaultController<string>;
      const stream = new ReadableStream<string>({
        start(c) {
          controller = c;
          clients.add(c);
          c.enqueue(`data: ${JSON.stringify(state())}\n\n`);
        },
        cancel() {
          clients.delete(controller);
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" } });
    }

    if (url.pathname === "/api/lyrics") {
      const search = searchByKey(url.searchParams.get("key") ?? "");
      const id = url.searchParams.get("id") as (typeof ALL_IDS)[number] | null;
      const lyrics = search && id && ALL_IDS.includes(id) ? lyricsOf(search, id) : null;
      return lyrics ? json(lyrics) : json({ error: "none" }, 404);
    }

    if (url.pathname === "/api/config") {
      if (req.method === "POST") {
        const body: any = await req.json().catch(() => ({}));
        try {
          writeSettings(body);
          if ("musicFolders" in body) void scanMusic();
        } catch (error) {
          console.error("could not save the settings:", error);
          return json({ error: "could not save the settings" }, 500);
        }
        broadcast();
      }
      return json(readSettings());
    }

    if (url.pathname === "/api/recheck" && req.method === "POST") {
      recheck(media);
      broadcast();
      return json({ ok: true });
    }

    if (url.pathname === "/api/offset" && req.method === "POST") {
      const body: any = await req.json().catch(() => ({}));
      if (typeof body.key === "string" && ALL_IDS.includes(body.id) && typeof body.ms === "number") setOffset(body.key, body.id, body.ms);
      return json({ ok: true });
    }

    if (url.pathname === "/api/prefs" && req.method === "POST") {
      const body: any = await req.json().catch(() => ({}));
      if (typeof body.preferBestSync === "boolean") writeSettings({ preferBestSync: body.preferBestSync });
      broadcast();
      return json({ ok: true });
    }

    if (url.pathname === "/api/cmd" && req.method === "POST") {
      const body: any = await req.json().catch(() => ({}));
      const cmd = String(body.cmd ?? "");
      if (/^(play|pause|toggle|next|prev|seek \d{1,9})$/.test(cmd)) send(cmd);
      // Heart, shuffle, repeat and volume are Spotify's own (through its debugger port).
      const own = /^(heart|shuffle|repeat|volume) ?([0-9.]*)$/.exec(cmd);
      if (own) void spotifyDo(own[1], Number(own[2] || 0)).then(() => setTimeout(() => void pollSpotify(), 150));
      return json({ ok: true });
    }

    if (url.pathname === "/api/pick" && req.method === "POST") {
      const body: any = await req.json().catch(() => ({}));
      const id = body.id === null ? null : ALL_IDS.includes(body.id) ? body.id : undefined;
      if (typeof body.key === "string" && id !== undefined) {
        pin(body.key, id);
        broadcast();
      }
      return json({ ok: true });
    }

    // Genius and YouTube Music lyrics, and Genius line meanings, go through the in-process copy of the Worker.
    if (url.pathname.startsWith("/worker/")) {
      const target = `${WORKER_BASE}/${url.pathname.slice("/worker/".length)}${url.search}`;
      return (workerFetch as (request: Request) => Promise<Response>)(new Request(target));
    }

    // What the page needs to start: the keys for translation and where the worker is. They stay on this PC.
    if (url.pathname === "/api/init") {
      const c = config as any;
      return json({
        // The Gemini key stays on this server: the page only learns whether one is set (see /api/gemini).
        geminiKeySet: String(c.geminiApiKey ?? "").trim() !== "",
        geminiModel: c.geminiModel ?? "",
        translateTo: c.translateTo ?? "",
        geniusFavoriteArtists: (c.geniusFavoriteArtists ?? []).join(", "),
        lineMeaningsFrom: c.lineMeaningsFrom ?? "everyone",
        geniusLooseSearch: c.geniusLooseSearch ?? true,
        geniusEagerMatch: c.geniusEagerMatch ?? true,
        geniusProxyUrl: `${address}/worker`,
      });
    }

    // Gemini translation requests from the page: the key is added here, so it never reaches the page. Only Gemini's generate
    // endpoints are forwarded, and only to Google.
    if (url.pathname.startsWith("/api/gemini/") && req.method === "POST") {
      const rest = decodeURIComponent(url.pathname.slice("/api/gemini/".length));
      if (!/^[A-Za-z0-9._-]+:(?:generateContent|streamGenerateContent)$/.test(rest)) return new Response("not allowed", { status: 400 });
      const key = String((config as any).geminiApiKey ?? "").trim();
      if (!key) return json({ error: { message: "No Gemini API key is set (Settings > Keys and tokens)." } }, 400);
      const body = await req.arrayBuffer();
      if (body.byteLength > 2_000_000) return new Response("too large", { status: 413 });
      try {
        const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${rest}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body,
          signal: AbortSignal.timeout(60_000),
        });
        return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" } });
      } catch (error) {
        console.error("Gemini request failed:", error);
        return json({ error: { message: "Could not reach Gemini. Check your internet connection." } }, 502);
      }
    }
    if (url.pathname === "/cover") return coverFor(url.searchParams.get("key") ?? "", url.searchParams.get("video") === "1");
    if (url.pathname === "/api/motion") {
      const key = await animatedCover(url.searchParams.get("artist") ?? "", url.searchParams.get("album") ?? "", url.searchParams.get("track") ?? "");
      return Response.json({ url: key ? `/motion/${key}.mp4` : null });
    }
    if (url.pathname === "/videofile") {
      if (!vlcVideo || url.searchParams.get("v") !== vlcVideo.id) return new Response("not found", { status: 404 });
      return rangeFile(vlcVideo.path, req.headers.get("range"), VIDEO_TYPES[extname(vlcVideo.path).toLowerCase()] ?? "video/mp4");
    }
    if (url.pathname.startsWith("/motion/")) return motionFile(url.pathname.slice(8).replace(/\.mp4$/, ""), req.headers.get("range"));
    if (url.pathname.startsWith("/fonts/")) return fontFile(url.pathname.slice("/fonts/".length));

    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const path = join(PUBLIC, file);
    if (!path.startsWith(PUBLIC) || !existsSync(path)) return new Response("Not found", { status: 404 });
    return new Response(Bun.file(path), { headers: { "Content-Type": MIME[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-store" } });
  },
});

setInterval(broadcast, 1000);
startMusicIndex();

// ---- the window ------------------------------------------------------------------------------

const BROWSERS = [
  (config as any).browser as string | undefined,
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].filter((p): p is string => !!p && existsSync(p));

console.log(`Lyrics Viewer (#Hype) is on ${address}`);

function shutdown() {
  try {
    smtc.kill();
  } catch {
    // already gone
  }
  server.stop(true);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (BROWSERS[0] && !process.argv.includes("--no-window")) {
  // Its own profile, so this is a separate window that is not joined to the browser already running.
  const window = Bun.spawn(
    [
      BROWSERS[0],
      `--app=${address}`,
      `--user-data-dir=${join(ROOT, "data", "window")}`,
      "--window-size=1280,820",
      "--no-first-run",
      "--no-default-browser-check",
      ...(process.argv.includes("--debug") ? ["--remote-debugging-port=9333"] : []),
    ],
    { stdout: "ignore", stderr: "ignore" }
  );
  // Closing the window ends the app.
  void window.exited.then(shutdown);
} else {
  if (!process.argv.includes("--no-window")) console.log("No Chromium browser was found to open the window; open the address above in any browser.");
}
