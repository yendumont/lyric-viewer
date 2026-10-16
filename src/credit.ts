/**
 * Who a lyric is credited to. Spicy Lyrics' terms ask for the provider and, for community
 * syncs, the uploader and maker; Unison names the person who made its lyrics.
 */
export type Credit = {
  /** The provider line, e.g. "Lyrics from Unison". */
  text: string;
  /** The people behind it, each with a link to their profile when there is one. */
  people: { role: string; name: string; url?: string }[];
};

/** Links come from other people's data, so only plain https addresses are ever used. */
export function safeUrl(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

/** The credit as one line for inside a file: names with their links, in the order shown on the page. */
export function creditLine(credit: Credit): string {
  const parts = [
    credit.text,
    ...credit.people.map((p) => (p.url ? `${p.role} ${p.name} (${p.url})` : `${p.role} ${p.name}`)),
  ];
  // An XML comment may not contain "--" and should stay on one line.
  return parts.join(" · ").replace(/[\r\n]+/g, " ").replace(/--+/g, "-");
}
