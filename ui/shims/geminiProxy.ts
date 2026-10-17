// Spicy Lyrics' translation code calls Gemini directly, with the key in a header. Here the key stays on the server, so those
// requests are sent to this app's own /api/gemini route instead, which adds the key and forwards them to Google.
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/";
const realFetch = window.fetch.bind(window);

window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(GEMINI)) return realFetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.delete("x-goog-api-key");
  return realFetch(`/api/gemini/${encodeURIComponent(url.slice(GEMINI.length))}`, { ...init, headers });
};
