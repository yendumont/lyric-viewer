// A timing correction for the song on screen, kept per song and per source (the same lyrics from
// different sources are often timed a little differently). Saved by the server, so it is still
// there the next time the song plays.
import { $playbackOffset } from "./spicy/utils/stores.ts";
import { viewer } from "./state.ts";

const post = (body: unknown) =>
  fetch("/api/offset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

let current = 0;
let editedAt = 0;
let saveTimer = 0;

export const songOffset = (): number => current;

/** Take the server's saved value for what is on screen (ignored for a moment after the user's own change). */
export function applyServerOffset(ms: number): void {
  if (Date.now() - editedAt < 2500) return;
  if (ms === current) return;
  current = ms;
  $playbackOffset.set(ms);
}

/** Positive moves the lyrics later, negative earlier; `null` puts them back. Returns the new value. */
export function nudge(delta: number | null): number {
  current = delta === null ? 0 : Math.max(-5000, Math.min(5000, current + delta));
  editedAt = Date.now();
  $playbackOffset.set(current);

  const search = viewer.search;
  if (search?.chosen) {
    const key = search.key;
    const id = search.chosen;
    const ms = current;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void post({ key, id, ms }), 400);
  }
  return current;
}

export const describeOffset = (ms: number): string =>
  ms === 0 ? "In time" : `Lyrics ${ms > 0 ? "later" : "earlier"} by ${Math.abs(ms)} ms`;
