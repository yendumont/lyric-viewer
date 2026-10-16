import type { TrackInfo } from "./utils/Lyrics/providers/types.ts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** The track id in a Spotify link ("open.spotify.com/track/<id>", with or without a locale or ?si=, or "spotify:track:<id>"). */
export function trackIdFrom(input: string): string | null {
  const text = input.trim();
  const uri = /^spotify:track:([A-Za-z0-9]{22})$/.exec(text);
  if (uri) return uri[1];
  const link = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?track\/([A-Za-z0-9]{22})/.exec(text);
  return link ? link[1] : null;
}

/**
 * The song's title, artists, length and cover, read from Spotify's public embed page for the
 * track (the same page behind a Spotify "embed" iframe). No login or token is involved.
 * Spotify does not put the album name in it, so that stays empty unless given.
 */
export async function readTrack(id: string, album = ""): Promise<TrackInfo> {
  const res = await fetch(`https://open.spotify.com/embed/track/${id}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Spotify answered ${res.status} for that link`);
  const html = await res.text();
  const raw = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!raw) throw new Error("Could not read the song from Spotify's page");

  const entity = JSON.parse(raw[1])?.props?.pageProps?.state?.data?.entity;
  if (!entity?.name) throw new Error("Spotify's page had no song in it");

  const artists: string[] = (entity.artists ?? []).map((a: any) => a?.name).filter(Boolean);
  const covers: { url: string; maxWidth?: number }[] = entity.visualIdentity?.image ?? entity.coverArt ?? [];
  const cover = [...covers].sort((a, b) => (b.maxWidth ?? 0) - (a.maxWidth ?? 0))[0]?.url;

  return {
    name: entity.name,
    artist: artists[0] ?? "",
    artists,
    album,
    spotifyId: id,
    coverUrl: cover,
    durationMs: Number(entity.duration) || 0,
  };
}
