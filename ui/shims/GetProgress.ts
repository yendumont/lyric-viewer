// The lyric clock. Spicy Lyrics smooths Spotify's jittery position; Windows' media position is
// already steady, so this is the page's own song clock plus the user's offset.
import { $playbackOffset } from "../spicy/utils/stores.ts";
import { rawPositionMs } from "../state.ts";

export const requestPositionSync = () => {};

export default function GetProgress(): number {
  // Spicy Lyrics leads the clock by 100 ms to make up for audio output delay; kept the same here.
  return Math.max(0, rawPositionMs() + 100 - $playbackOffset.get());
}

export function _DEPRECATED___GetProgress(): number {
  return rawPositionMs();
}
