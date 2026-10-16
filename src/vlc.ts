import { config } from "./lookup.ts";
import type { Media } from "./engine.ts";

// VLC (3.x) does not tell Windows what it is playing, so it is read from its own web interface. In VLC:
// Tools > Preferences > Show settings: All > Interface > Main interfaces: tick "Web", then Main
// interfaces > Lua > Lua HTTP: set a password. Put that password in config.json ("vlcPassword").
// Nothing is changed in VLC by reading from it; the commands only play, pause, skip and seek.

const port = () => Number((config as any).vlcPort) || 8080;
const password = () => String((config as any).vlcPassword ?? "");
const auth = () => ({ Authorization: `Basic ${btoa(`:${password()}`)}` });
const base = () => `http://127.0.0.1:${port()}`;

export const vlcConfigured = () => password() !== "";

const CODECS: Record<string, string> = {
  "mpga": "MP3", "mp3": "MP3", "mp4a": "AAC", "flac": "FLAC", "alac": "ALAC", "opus": "Opus", "vorb": "Vorbis", "wma2": "WMA", "wmal": "WMA Lossless",
};

/** "FLAC · 44.1 kHz · 16-bit", "MP3 · 320 kbps"… from what VLC says about the audio stream. */
function qualityOf(info: any): string | undefined {
  const streams = Object.entries(info?.category ?? {}).filter(([name]) => /^Stream/i.test(name)).map(([, value]) => value as any);
  const audio = streams.find((s) => /audio/i.test(String(s.Type ?? "")));
  if (!audio) return undefined;
  const codecText = String(audio.Codec ?? "");
  const code = /\(([^)]+)\)/.exec(codecText)?.[1]?.toLowerCase();
  const name = (code && CODECS[code]) || codecText.replace(/\s*\(.*\)$/, "").trim();
  const parts = [name];
  const rate = String(audio["Sample_rate"] ?? audio["Sample rate"] ?? "");
  const hz = Number(/\d+/.exec(rate)?.[0]);
  if (hz) parts.push(`${hz % 1000 === 0 ? hz / 1000 : (hz / 1000).toFixed(1)} kHz`);
  const bits = Number(/\d+/.exec(String(audio["Bits_per_sample"] ?? audio["Bits per sample"] ?? ""))?.[0]);
  if (bits) parts.push(`${bits}-bit`);
  const kbps = Number(/\d+/.exec(String(audio["Bitrate"] ?? ""))?.[0]);
  if (kbps && !/FLAC|ALAC|Lossless/i.test(name)) parts.push(`${kbps} kbps`);
  return parts.filter(Boolean).join(" · ");
}

/** "Artist - Title.mp3" -> its two parts, for files with no tags. */
function fromFilename(file: string): { artist: string; title: string } {
  const name = file.replace(/\.[A-Za-z0-9]{2,5}$/, "");
  const at = name.indexOf(" - ");
  return at > 0 ? { artist: name.slice(0, at).trim(), title: name.slice(at + 3).trim() } : { artist: "", title: name.trim() };
}

let lastStatus: any = null;

// VLC reports the time in whole seconds, so the moment it ticks over is the one exact point. The position is that
// second plus however long ago it ticked over (found by asking often); after a seek, a half second is assumed until
// the next tick.
let anchor: { id: string; second: number; at: number; exact: boolean } | null = null;

function preciseMs(status: any, id: string, now: number): number {
  const second = Number(status.time ?? 0);
  const playing = status.state === "playing";
  if (!anchor || anchor.id !== id || second < anchor.second || second > anchor.second + 2) {
    anchor = { id, second, at: now - 500, exact: false };
  } else if (second === anchor.second + 1 && playing) {
    // It ticked over somewhere in the last poll: assume the middle of it.
    anchor = { id, second, at: now - POLL_MS / 2, exact: true };
  } else if (second !== anchor.second) {
    anchor = { id, second, at: now - 500, exact: false };
  }
  if (!playing) return second * 1000 + (anchor.exact ? 0 : 0);
  return second * 1000 + Math.min(999, Math.max(0, now - anchor.at));
}

export const POLL_MS = 100;

/** What VLC is playing, or null when it is not running, not reachable or stopped. */
export async function vlcMedia(): Promise<Media | null> {
  if (!vlcConfigured()) return null;
  try {
    const res = await fetch(`${base()}/requests/status.json`, { headers: auth(), signal: AbortSignal.timeout(800) });
    if (!res.ok) return null;
    const status: any = await res.json();
    lastStatus = status;
    if (status.state === "stopped") return null;

    const meta = status.information?.category?.meta ?? {};
    const guess = fromFilename(String(meta.filename ?? ""));
    const title = String(meta.title ?? "").trim() || guess.title;
    if (!title) return null;
    const playing = status.state === "playing";
    const songId = `${title}|${meta.artist ?? ""}`;
    return {
      app: "VLC",
      title,
      artist: String(meta.artist ?? "").trim() || guess.artist,
      album: String(meta.album ?? "").trim(),
      status: playing ? "Playing" : "Paused",
      positionMs: Math.round(preciseMs(status, songId, Date.now())),
      durationMs: Math.round(Number(status.length ?? 0) * 1000),
      canSeek: true,
      quality: qualityOf(status.information),
      video: Object.entries(status.information?.category ?? {}).some(([name, s]: [string, any]) => /^Stream/i.test(name) && /video/i.test(String(s?.Type ?? ""))),
      at: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function vlcCommand(cmd: string): Promise<void> {
  const map: Record<string, string> = { toggle: "pl_pause", prev: "pl_previous", next: "pl_next" };
  let query = map[cmd];
  if (cmd === "play") query = lastStatus?.state === "playing" ? "" : "pl_play";
  if (cmd === "pause") query = lastStatus?.state === "playing" ? "pl_pause" : "";
  const seek = /^seek (\d+)$/.exec(cmd);
  const url = seek ? `${base()}/requests/status.json?command=seek&val=${Math.round(Number(seek[1]) / 1000)}s` : query ? `${base()}/requests/status.json?command=${query}` : "";
  if (!url) return;
  try {
    await fetch(url, { headers: auth(), signal: AbortSignal.timeout(1500) });
  } catch {
    // VLC went away
  }
}

/** The path of the file VLC is playing, from its playlist (null for streams or when it cannot be read). */
export async function vlcCurrentPath(): Promise<string | null> {
  try {
    const res = await fetch(`${base()}/requests/playlist.json`, { headers: auth(), signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const find = (node: any): any => {
      if (node?.current === "current" && node.uri) return node;
      for (const child of node?.children ?? []) {
        const hit = find(child);
        if (hit) return hit;
      }
      return null;
    };
    const leaf = find(await res.json());
    const uri = String(leaf?.uri ?? "");
    if (!uri.startsWith("file:///")) return null;
    return decodeURIComponent(uri.slice("file:///".length)).replaceAll("/", "\\");
  } catch {
    return null;
  }
}

/** The artwork VLC found for the file, if any. */
export async function vlcArt(): Promise<{ type: string; bytes: Uint8Array } | null> {
  try {
    const res = await fetch(`${base()}/art`, { headers: auth(), signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 200) return null;
    return { type: res.headers.get("content-type") ?? "image/jpeg", bytes };
  } catch {
    return null;
  }
}
