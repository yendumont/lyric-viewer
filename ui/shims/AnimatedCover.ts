// Spicy Lyrics converts Apple's animated cover stream in the browser (ffmpeg). Here the server has already fetched it
// as an ordinary MP4 (src/motion.ts), so this only asks for the address.
export function coverKey(artist: string, album: string): string {
  return `${artist}|${album}`;
}

const known = new Map<string, Promise<string | null>>();

export function getAnimatedCover(artist: string, album: string, track = ""): Promise<string | null> {
  const key = coverKey(artist, album);
  let found = known.get(key);
  if (!found) {
    found = fetch(`/api/motion?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}&track=${encodeURIComponent(track)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => (body?.url as string | undefined) ?? null)
      .catch(() => null);
    known.set(key, found);
    // Not found now may be found later (the server tries a failed lookup again), so only hits are kept.
    void found.then((url) => !url && known.delete(key));
  }
  return found;
}

export function memoVideo(): Promise<string | null> {
  return Promise.resolve(null);
}
