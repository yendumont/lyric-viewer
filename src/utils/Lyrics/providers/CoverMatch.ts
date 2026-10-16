// The extension compares cover art with a canvas (Genius matching). There is no canvas
// here, so covers are simply not compared and matching goes on title, artist and length.
export const COVER_SAME_MAX_DISTANCE = 10;
export const toImageUrl = (ref: string | undefined): string | undefined => ref;
export async function coverDistance(_a: string, _b: string): Promise<number | null> {
  return null;
}
