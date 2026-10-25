import { expect, mock, test } from "bun:test";

// The TTML parser needs fast-xml-parser, which these tests do not use; stand in for it when it is not installed.
let haveXml = true;
try {
  require.resolve("fast-xml-parser");
} catch {
  haveXml = false;
}
if (!haveXml) mock.module("../src/utils/Lyrics/ttml/parser.ts", () => ({ parseTTML: () => null }));

const { parseEmbeddedText } = await import("../src/utils/LocalEmbed/EmbeddedLyrics.ts");
const { parseLrcToLine } = await import("../src/utils/Lyrics/providers/Lrc.ts");

const MORNYE = [
  "[ti:Song]",
  "[by:Mornye (source: Extension: spicy-lyrics-desktop)]",
  "[offset:200]",
  "[00:12.000]v2:<00:12.000>Hel<00:12.400><00:12.400>lo <00:12.800>",
  "[bg:<00:12.500>ooh <00:12.900>yeah<00:13.200>]",
  "[x-translation:12000:aGk=]",
  "[00:14.000]v1:<00:14.000>Bye <00:14.500>now<00:15.000>",
].join("\n");

test("word-synced Mornye text keeps singers and backing vocals", () => {
  const r = parseEmbeddedText(MORNYE, 30);
  expect(r.Type).toBe("Syllable");
  expect(r.Content.length).toBe(2);
  expect(r.Content[0].OppositeAligned).toBe(true);
  expect(r.Content[1].OppositeAligned).toBe(false);
  expect(r.Content[0].Lead.Syllables.map((s: any) => s.Text).join("|")).toBe("Hel|lo");
  expect(r.Content[0].Lead.Syllables[0].IsPartOfWord).toBe(true);
  expect(r.Content[0].Background[0].Syllables.map((s: any) => s.Text)).toEqual(["ooh", "yeah"]);
  // [offset:200] shows lyrics 0.2 s earlier
  expect(r.Content[0].Lead.StartTime).toBeCloseTo(11.8, 5);
  expect(JSON.stringify(r)).not.toContain("v2:");
  expect(JSON.stringify(r)).not.toContain("x-translation");
});

test("line mode drops labels, adds backing in brackets, keeps alignment", () => {
  const r = parseLrcToLine(MORNYE, 30);
  expect(r.Type).toBe("Line");
  expect(r.Content[0].Text).toBe("Hello (ooh yeah)");
  expect(r.Content[0].OppositeAligned).toBe(true);
  expect(r.Content[1].Text).toBe("Bye now");
});

test("ordinary enhanced LRC is unchanged", () => {
  const r = parseEmbeddedText("[00:01.00]<00:01.00>Hi <00:01.50>you<00:02.00>\n[00:03.00]<00:03.00>Yo<00:03.50>", 10);
  expect(r.Content.length).toBe(2);
  expect(r.Content[0].OppositeAligned).toBe(false);
  expect(r.Content[0].Background).toBeUndefined();
  const l = parseLrcToLine("[00:01.00]Hello\n[00:03.00]World", 10);
  expect(l.Content.map((c: any) => c.Text)).toEqual(["Hello", "World"]);
});
