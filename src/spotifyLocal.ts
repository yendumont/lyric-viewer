// When Spotify itself is the player, it can say exactly which song it is playing: its page answers on
// the Chrome debugger port if Spotify was started with --remote-debugging-port=8088 (Spicetify can do
// that: see README). Nothing is changed in Spotify by reading from it, and when the port is not open
// this simply finds nothing.
const PORT = 8088;

export type SpotifyNow = { id: string; name: string };

export async function spotifyNowPlaying(): Promise<SpotifyNow | null> {
  try {
    const targets: any[] = await (await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(700) })).json();
    const page = targets.find((t) => t.type === "page" && /xpui/i.test(t.url ?? ""));
    if (!page?.webSocketDebuggerUrl) return null;

    return await new Promise<SpotifyNow | null>((resolve) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      const done = (value: SpotifyNow | null) => {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          // already closed
        }
        resolve(value);
      };
      const timer = setTimeout(() => done(null), 2000);
      ws.onerror = () => done(null);
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            id: 1,
            method: "Runtime.evaluate",
            params: {
              expression: "JSON.stringify((() => { const i = Spicetify?.Player?.data?.item; return i ? { uri: i.uri, name: i.name } : null; })())",
              returnByValue: true,
            },
          })
        );
      ws.onmessage = (event) => {
        try {
          const value = JSON.parse(String(event.data))?.result?.result?.value;
          const item = value ? JSON.parse(value) : null;
          const match = /^spotify:track:([A-Za-z0-9]{22})$/.exec(item?.uri ?? "");
          done(match ? { id: match[1], name: String(item.name ?? "") } : null);
        } catch {
          done(null);
        }
      };
    });
  } catch {
    return null;
  }
}

// The streaming quality Spotify is playing at, from its player state. Spotify's own scale (its client code):
// 1 Low (24 kbps), 2 Normal (96), 3 High (160), 4 Very high (320), 5 Lossless.
const LEVELS: Record<number, string> = { 1: "Low (24 kbps)", 2: "Normal (96 kbps)", 3: "High (160 kbps)", 4: "Very high (320 kbps)", 5: "Lossless" };

export async function spotifyQuality(): Promise<string | null> {
  try {
    const targets: any[] = await (await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(700) })).json();
    const page = targets.find((t) => t.type === "page" && /xpui/i.test(t.url ?? ""));
    if (!page?.webSocketDebuggerUrl) return null;
    return await new Promise<string | null>((resolve) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      const done = (value: string | null) => {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          // already closed
        }
        resolve(value);
      };
      const timer = setTimeout(() => done(null), 2000);
      ws.onerror = () => done(null);
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            id: 1,
            method: "Runtime.evaluate",
            params: { expression: "JSON.stringify(Spicetify?.Platform?.PlayerAPI?._state?.playbackQuality ?? null)", returnByValue: true },
          })
        );
      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(String(event.data))?.result?.result?.value;
          const q = raw ? JSON.parse(raw) : null;
          if (!q) return done(null);
          done(LEVELS[Number(q.bitrateLevel)] ?? null);
        } catch {
          done(null);
        }
      };
    });
  } catch {
    return null;
  }
}
export type SpotifyCanvas = {
  name: string;
  url?: string;
  type?: string;
  heart: boolean;
  shuffle: boolean;
  /** 0 off, 1 all, 2 one. */
  repeat: number;
  /** 0 to 1. */
  volume: number;
};

/** The playing song's Canvas (a short looping video), from the player state; null when the song has none. */
export async function spotifyCanvas(): Promise<SpotifyCanvas | null> {
  try {
    const targets: any[] = await (await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(700) })).json();
    const page = targets.find((t) => t.type === "page" && /xpui/i.test(t.url ?? ""));
    if (!page?.webSocketDebuggerUrl) return null;
    return await new Promise<SpotifyCanvas | null>((resolve) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      const done = (value: SpotifyCanvas | null) => {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          // already closed
        }
        resolve(value);
      };
      const timer = setTimeout(() => done(null), 2000);
      ws.onerror = () => done(null);
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            id: 1,
            method: "Runtime.evaluate",
            params: {
              expression: "JSON.stringify((() => { const i = Spicetify?.Player?.data?.item; const m = i?.metadata; const P = Spicetify.Player; return m ? { name: i.name, url: m['canvas.url'], type: m['canvas.type'], heart: !!P.getHeart(), shuffle: !!P.getShuffle(), repeat: P.getRepeat(), volume: P.getVolume() } : null; })())",
              returnByValue: true,
            },
          })
        );
      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(String(event.data))?.result?.result?.value;
          const c = raw ? JSON.parse(raw) : null;
          done(
            c
              ? {
                  name: String(c.name ?? ""),
                  url: /^https:\/\//.test(c.url ?? "") ? c.url : undefined,
                  type: c.url ? String(c.type ?? "VIDEO_LOOPING") : undefined,
                  heart: !!c.heart,
                  shuffle: !!c.shuffle,
                  repeat: Number(c.repeat) || 0,
                  volume: Number(c.volume) || 0,
                }
              : null
          );
        } catch {
          done(null);
        }
      };
    });
  } catch {
    return null;
  }
}

/** Spotify's own transport buttons that Windows' media controls do not have. Only these fixed actions are ever run. */
const ACTIONS: Record<string, (arg: number) => string> = {
  heart: () => "Spicetify.Player.toggleHeart()",
  shuffle: () => "Spicetify.Player.toggleShuffle()",
  repeat: () => "Spicetify.Player.toggleRepeat()",
  volume: (v) => `Spicetify.Player.setVolume(${Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))})`,
};

export async function spotifyDo(action: string, arg = 0): Promise<boolean> {
  const make = ACTIONS[action];
  if (!make) return false;
  try {
    const targets: any[] = await (await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(700) })).json();
    const page = targets.find((t) => t.type === "page" && /xpui/i.test(t.url ?? ""));
    if (!page?.webSocketDebuggerUrl) return false;
    return await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      const timer = setTimeout(() => finish(false), 2000);
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          // already closed
        }
        resolve(ok);
      };
      ws.onerror = () => finish(false);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: make(arg), returnByValue: true } }));
      ws.onmessage = () => finish(true);
    });
  } catch {
    return false;
  }
}

/**
 * Spotify's own search, run by the open Spotify client with its own login through the debugger port (the search box's query, via
 * Spicetify's GraphQL helper). It needs no developer app and no key, and is not the Web API (which the client's token gets rate
 * limited on). The address is a Web API search address, the answer is shaped like the Web API's (`tracks.items`), so the caller does not
 * care which one answered. Album names and lengths are not in this search's answer. Null when Spotify is not reachable.
 */
export async function spotifyClientSearch(url: string): Promise<any | null> {
  if (!url.startsWith("https://api.spotify.com/v1/search?")) return null;
  // "track:Song artist:Name" (a Web API filter) is just "Song Name" in Spotify's search box.
  const wanted = (new URL(url).searchParams.get("q") ?? "").replace(/\b(?:track|artist|album):/gi, " ").replace(/\s+/g, " ").trim();
  if (!wanted) return null;
  try {
    const targets: any[] = await (await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(700) })).json();
    const page = targets.find((t) => t.type === "page" && /xpui/i.test(t.url ?? ""));
    if (!page?.webSocketDebuggerUrl) return null;
    const answer = await new Promise<any | null>((resolve) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      const done = (value: any | null) => {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          // already closed
        }
        resolve(value);
      };
      const timer = setTimeout(() => done(null), 8000);
      ws.onerror = () => done(null);
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            id: 1,
            method: "Runtime.evaluate",
            params: {
              expression: `(async () => { try { const g = Spicetify.GraphQL; return JSON.stringify(await g.Request(g.Definitions.searchModalResults, { searchTerm: ${JSON.stringify(wanted)}, offset: 0, limit: 8, numberOfTopResults: 8, includeAudiobooks: false, includeArtistHasConcertsField: false, includePreReleases: false, includeAuthors: false })); } catch (e) { return null; } })()`,
              awaitPromise: true,
              returnByValue: true,
            },
          })
        );
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.id !== 1) return;
          const raw = message.result?.result?.value;
          done(raw ? JSON.parse(raw) : null);
        } catch {
          done(null);
        }
      };
    });
    const found: any[] = answer?.data?.searchV2?.topResultsV2?.itemsV2 ?? answer?.data?.searchV2?.tracksV2?.items ?? [];
    const items = found
      .map((entry) => entry?.item?.data ?? entry?.item ?? entry)
      .filter((data) => data?.__typename === "Track" && typeof data.uri === "string")
      .map((data) => {
        const covers: { url: string; width?: number }[] = data.albumOfTrack?.coverArt?.sources ?? [];
        const best = [...covers].sort((x, y) => (y.width ?? 0) - (x.width ?? 0))[0];
        return {
          id: String(data.uri).split(":")[2],
          name: String(data.name ?? ""),
          artists: (data.artists?.items ?? []).map((a: any) => ({ name: String(a?.profile?.name ?? "") })),
          album: { name: String(data.albumOfTrack?.name ?? ""), images: best ? [{ url: best.url }] : [] },
          duration_ms: Number(data.duration?.totalMilliseconds ?? 0),
        };
      });
    return answer ? { tracks: { items } } : null;
  } catch {
    return null;
  }
}