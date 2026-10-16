// Names compared as whole words, so "Che" is not "Cher" and "Drake" is not "Drake Bell", while
// "Taylor Swift" still matches "Taylor Swift feat. Someone".
export const sameName = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  return ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
};

// A video's name usually carries what the video is, not just what the song is: "Artist - Song (Official Music Video) [4K].mp4",
// "Song [aBcDeFgHiJk].webm" (a YouTube id), "Artist - Topic". Spotify and the lyrics sources know the song, not the video, so
// that is stripped before looking the song up. A "(feat. ...)" or "(prod. ...)" part is kept.
const NOISE =
  /\b(?:official|music video|lyric(?:s)? video|lyrics?|audio|visuali[sz]er|video|hd|hq|uhd|4k|8k|2160p|1440p|1080p|720p|480p|explicit|clean|clip|m\/v|mv|remaster(?:ed)?|full (?:song|version)|with lyrics|vevo)\b/i;
const KEEP = /\b(?:feat|ft|featuring|prod|with|vs|x)\b\.?/i;

function stripNoise(text: string): string {
  let s = text.replace(/_+/g, " ");
  // A YouTube id left by a downloader: "Title [dQw4w9WgXcQ]" or "Title-dQw4w9WgXcQ".
  s = s.replace(/\s*\[[A-Za-z0-9_-]{11}\]\s*$/, "").replace(/-[A-Za-z0-9_-]{11}$/, "");
  // Bracketed parts that only say what kind of video it is.
  s = s.replace(/[(\[{]([^)\]}]*)[)\]}]/g, (whole, inner: string) => (NOISE.test(inner) && !KEEP.test(inner) ? " " : whole));
  // A tail such as " - Official Video" or " | Lyrics".
  // (Only when the whole tail is such words: "Lana Del Rey - Video Games" is a song, not a video label.)
  s = s.replace(/\s*[-–—|:]\s*(?:(?:official|lyrics?|audio|music|video|visuali[sz]er|hd|4k|version|with)\s*)+$/i, "");
  return s.replace(/\s{2,}/g, " ").trim();
}

export function cleanVideoName(artist: string, title: string): { artist: string; title: string } {
  let a = stripNoise(artist).replace(/\s*-\s*topic$/i, "").replace(/vevo$/i, "").trim();
  let t = stripNoise(title);
  // "Artist - Song" in the title when the file names no artist.
  if (!a) {
    const at = t.indexOf(" - ");
    if (at > 0) {
      a = t.slice(0, at).trim();
      t = t.slice(at + 3).trim();
    }
  } else if (t.toLowerCase().startsWith(`${a.toLowerCase()} - `)) {
    // "Artist - Song" as the title of a file whose artist tag says the same.
    t = t.slice(a.length + 3).trim();
  }
  return { artist: a, title: t || title.trim() };
}