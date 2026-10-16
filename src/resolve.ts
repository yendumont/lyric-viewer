import { config } from "./lookup.ts";
import { readTrack } from "./spotify.ts";
import { sameName } from "./names.ts";
import { spotifyClientSearch } from "./spotifyLocal.ts";
import type { TrackInfo } from "./utils/Lyrics/providers/types.ts";

/**
 * What Windows says is playing is only a title, an artist, an album and a length. Lyrics
 * sources match on those, but Spicy Lyrics wants the song's Spotify id and the page wants a
 * good cover, so both are found here: Apple's public search (no key) for the artwork, and
 * Spotify's own search, with your own Spotify app's client id and secret (config.json), for
 * the Spotify id. Without those two the Spotify id is simply not found and Spicy Lyrics is skipped.
 */

export type Playing = { title: string; artist: string; album: string; durationMs: number };
export type Resolved = { track: TrackInfo; cover?: string; spotifyCover?: string; spotify: "found" | "missing" | "unconfigured" };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const flat = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** A title as the player shows it, without a trailing "- Remastered" and the like. */
const plainTitle = (title: string) => title.replace(/\s+-\s+(?:remaster|remastered|single|radio edit|mono|stereo|live).*$/i, "").trim();

async function getJson(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<any | null> {
  try {
    const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// ---- Apple: artwork and the album name -------------------------------------------------------

type AppleSong = { trackName: string; artistName: string; collectionName?: string; trackTimeMillis?: number; artworkUrl100?: string };

function score(p: Playing, title: string, artists: string[], album: string | undefined, durationMs: number | undefined): number {
  const wantTitle = flat(plainTitle(p.title));
  const wantArtist = flat(p.artist.split(/\s*[;,&]\s*/)[0] || p.artist);
  let s = 0;
  if (flat(title) === wantTitle) s += 4;
  else if (flat(title).includes(wantTitle) || wantTitle.includes(flat(title))) s += 1;
  if (wantArtist && artists.some((a) => sameName(flat(a), wantArtist))) s += 3;
  if (p.album && album && flat(album) === flat(p.album)) s += 1;
  if (p.durationMs && durationMs && Math.abs(durationMs - p.durationMs) < 4000) s += 2;
  return s;
}

async function searchApple(p: Playing): Promise<AppleSong | null> {
  const term = encodeURIComponent(`${p.artist} ${plainTitle(p.title)}`);
  const data = await getJson(`https://itunes.apple.com/search?term=${term}&entity=song&limit=8`);
  const results: AppleSong[] = data?.results ?? [];
  const wantArtist = flat(p.artist.split(/\s*[;,&]\s*/)[0] || p.artist);
  let best: { song: AppleSong; s: number } | null = null;
  for (const song of results) {
    // A song by someone else with the same title is not this song: the artist has to match as well.
    const artist = flat(song.artistName);
    if (wantArtist && !sameName(artist, wantArtist)) continue;
    const s = score(p, song.trackName, [song.artistName], song.collectionName, song.trackTimeMillis);
    if (!best || s > best.s) best = { song, s };
  }
  return best && best.s >= 5 ? best.song : null;
}

// ---- Spotify: the song's id, with your own app's credentials --------------------------------

let token: { value: string; until: number } | null = null;

async function spotifyToken(): Promise<string | null> {
  const id = (config as any).spotifyClientId as string | undefined;
  const secret = (config as any).spotifyClientSecret as string | undefined;
  if (!id || !secret) return null;
  if (token && token.until > Date.now() + 30000) return token.value;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    token = { value: data.access_token, until: Date.now() + (data.expires_in ?? 3600) * 1000 };
    return token.value;
  } catch {
    return null;
  }
}

type SpotifyHit = { id: string; name: string; artists: string[]; album: string; durationMs: number; cover?: string };

/** `run` makes one Spotify search request: with your own app's token, or through the running Spotify client (see spotifyClientSearch). */
async function searchSpotify(p: Playing, run: (url: string) => Promise<any | null>): Promise<SpotifyHit | null> {
  const title = plainTitle(p.title);
  const artist = p.artist.split(/\s*[;,&]\s*/)[0] || p.artist;
  for (const q of [`track:${title} artist:${artist}`, `${title} ${artist}`]) {
    const data = await run(`https://api.spotify.com/v1/search?type=track&limit=8&q=${encodeURIComponent(q)}`);
    const items: any[] = data?.tracks?.items ?? [];
    let best: { hit: SpotifyHit; s: number } | null = null;
    for (const item of items) {
      const hit: SpotifyHit = {
        id: item.id,
        name: item.name,
        artists: (item.artists ?? []).map((a: any) => a.name),
        album: item.album?.name ?? "",
        durationMs: item.duration_ms ?? 0,
        cover: item.album?.images?.[0]?.url,
      };
      const wantArtist = flat(artist);
      if (wantArtist && !hit.artists.some((a) => sameName(flat(a), wantArtist))) continue;
      const s = score(p, hit.name, hit.artists, hit.album, hit.durationMs);
      if (!best || s > best.s) best = { hit, s };
    }
    if (best && best.s >= 5) return best.hit;
  }
  return null;
}

// ---- MetaBrainz: Spotify ids without any Spotify account ----------------------------------------
// ListenBrainz's public "Spotify id from metadata" lookup (no key) knows the Spotify ids of released songs by
// artist, album and title. It gives every id it has, so the caller can try them in turn.
async function listenBrainzIds(artist: string, album: string, title: string): Promise<string[]> {
  const url =
    "https://labs.api.listenbrainz.org/spotify-id-from-metadata/json" +
    `?artist_name=${encodeURIComponent(artist)}&release_name=${encodeURIComponent(album)}&track_name=${encodeURIComponent(title)}`;
  const data = await getJson(url, {}, 15000);
  const ids: unknown = Array.isArray(data) ? data[0]?.spotify_track_ids : undefined;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9]{22}$/.test(id)) : [];
}

// ---- Putting it together -------------------------------------------------------------------

const cache = new Map<string, Promise<Resolved>>();

/** Forget what was found for songs so far (the next look-up starts over). */
export function clearResolved(): void {
  cache.clear();
}

export function resolveTrack(p: Playing, spotifyHint?: string): Promise<Resolved> {
  const key = `${flat(p.artist)}|${flat(p.title)}|${flat(p.album)}|${Math.round(p.durationMs / 1000)}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = doResolve(p, spotifyHint);
    cache.set(key, hit);
  }
  return hit;
}

async function doResolve(p: Playing, spotifyHint?: string): Promise<Resolved> {
  const artists = p.artist.split(/\s*[;,&]\s*/).filter(Boolean);
  const base: TrackInfo = {
    name: plainTitle(p.title),
    artist: artists[0] || p.artist,
    artists,
    album: p.album,
    durationMs: p.durationMs,
  };

  const bearer = await spotifyToken();
  // Your own Spotify app's search when one is set up; otherwise the running Spotify client searches (no app or key needed, Spotify just has to be open).
  const run = bearer
    ? (url: string) => getJson(url, { headers: { Authorization: `Bearer ${bearer}` } })
    : (url: string) => spotifyClientSearch(url);
  const [apple, spotify] = await Promise.all([searchApple(p), searchSpotify(p, run)]);

  let cover = apple?.artworkUrl100?.replace(/\d+x\d+bb/, "600x600bb");
  if (apple && !base.album) base.album = apple.collectionName ?? "";
  if (!base.durationMs && apple?.trackTimeMillis) base.durationMs = apple.trackTimeMillis;

  if (spotify) {
    // Spotify's own spelling matches its catalogue (and so Spicy Lyrics) best.
    base.spotifyId = spotify.id;
    base.name = spotify.name;
    base.artist = spotify.artists[0] ?? base.artist;
    base.artists = spotify.artists.length ? spotify.artists : base.artists;
    if (!base.album) base.album = spotify.album;
    if (!base.durationMs) base.durationMs = spotify.durationMs;
    cover = cover ?? spotify.cover;
  }
  // Spotify itself said which song this is (see spotifyLocal.ts): nothing to look up.
  // (Spotify's own word beats a search, even one by your own app: the search can only guess.)
  if (spotifyHint && base.spotifyId !== spotifyHint) {
    base.spotifyId = spotifyHint;
    base.spotifyIds = [spotifyHint];
  }

  // No Spotify search of our own (or it found nothing): ask MetaBrainz. Its lookup is exact about the album and
  // title, so a few spellings are tried: the player's album, Apple's album for the song, the title standing in for
  // a single's album, and the title without "(feat. ...)" or a "- Remastered" tail.
  if (!base.spotifyId) {
    const titles = [...new Set([base.name, base.name.replace(/\s*[(\[].*?[)\]]/g, "").trim(), p.title].filter(Boolean))];
    const albums = [...new Set([base.album, apple?.collectionName ?? "", ...titles, ""])].filter((a, i, all) => a !== "" || i === all.length - 1);
    const artistNames = [...new Set([base.artist, p.artist].filter(Boolean))];
    const tries: [string, string, string][] = [];
    for (const artist of artistNames) for (const album of albums) for (const title of titles) tries.push([artist, album, title]);
    // In small groups, so a match stops the rest.
    let ids: string[] = [];
    for (let i = 0; i < tries.length && ids.length === 0 && i < 12; i += 4) {
      const results = await Promise.all(tries.slice(i, i + 4).map(([artist, album, title]) => listenBrainzIds(artist, album, title)));
      ids = [...new Set(results.flat())];
    }
    if (ids.length > 0) {
      base.spotifyId = ids[0];
      base.spotifyIds = ids;
    }
  }

  // Spotify's own cover for the song, from its public embed page: the picture its catalogue shows, and the one to
  // trust when Spotify is the player (Apple's search can land on another song's album).
  let spotifyCover: string | undefined = spotify?.cover;
  if (base.spotifyId && !spotifyCover) {
    try {
      spotifyCover = (await readTrack(base.spotifyId, base.album)).coverUrl;
    } catch {
      // the player's own picture is used instead
    }
  }
  cover = cover ?? spotifyCover;  base.coverUrl = spotifyCover ?? cover;
  return { track: base, cover, spotifyCover, spotify: base.spotifyId ? "found" : bearer ? "missing" : "unconfigured" };
}
