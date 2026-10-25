/**
 * The extra bits of enhanced LRC that Mornye (and some other apps) write into a file, beyond plain
 * `[mm:ss.xx]` lines and `<mm:ss.xx>` word tags:
 *
 *   [00:12.34]v2:<00:12.34>Hel<00:12.80>lo      v1: / v2: / v3: = who sings the line
 *   [bg:<00:13.60>ooh <00:14.00>yeah]            a backing vocal for the line above it
 *   [x-translation:12340:BASE64]                 extra data about a line (translation, romanization)
 *   [by:Mornye (source: ...)]  [ti:..]  [offset:200]   tags about the file
 *
 * This file only recognises those rows and picks them apart; EmbeddedLyrics.ts and providers/Lrc.ts
 * decide what to do with them. Text without any of them is not changed by anything here.
 */

/** `[bg:...]`: a backing vocal of the line before it. Group 1 is what is inside the brackets. */
export const BACKGROUND_ROW = /^\s*\[bg:(.*)\]\s*$/i;

/** `[x-translation:...]`, `[x-romaji:...]`, `[x-romaji-words:...]`: extra data, not lyrics. */
export const SUPPLEMENT_ROW = /^\s*\[x-[a-z0-9_-]+:[^\]]*\]\s*$/i;

/** `[ti:...]`, `[by:...]` and the like: about the file, not lyrics. */
export const TAG_ROW = /^\s*\[(?:ti|ar|al|by|offset|length|re|ve|tool|au|la|encoder|instrumental):.*\]\s*$/i;

/** True for rows that carry no lyric text of their own (a backing vocal is handled separately). */
export const isMetadataRow = (row: string): boolean => SUPPLEMENT_ROW.test(row) || TAG_ROW.test(row);

// The singer label comes right after the line's time, either before or after the first word tag.
const VOICE_PREFIX = /^(\s*(?:<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>\s*)*)(v[1-9]\d*):[ \t]*/i;

/**
 * Who sings a line: `v1:` and `v3:` (a group) are the first side, `v2:` is the other. Further numbers
 * alternate, as Mornye does. Returns the line without its label.
 */
export function splitVoice(body: string): { body: string; opposite: boolean; voice?: string } {
  const match = VOICE_PREFIX.exec(body);
  if (!match) return { body, opposite: false };
  const id = match[2].toLowerCase();
  const number = Number(id.slice(1));
  const opposite = id === "v3" ? false : number % 2 === 0;
  return { body: body.slice(0, match[1].length).replace(/\s+/g, "") + body.slice(match[0].length), opposite, voice: id };
}

/** `[offset:200]` in seconds, to subtract from every time. LRC says a positive offset shows the lyrics earlier. */
export function offsetSeconds(text: string): number {
  const match = /^\s*\[offset:\s*(-?\d+)\s*\]\s*$/im.exec(text);
  return match ? Number(match[1]) / 1000 : 0;
}
