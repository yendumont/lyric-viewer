// The extension reaches some hosts through Spicetify's proxy because Spotify's page cannot
// (no CORS). A program on its own PC has no such limit, so these are plain requests.
const TIMEOUT_MS = 8000;

export function buildUrl(base: string, params: Record<string, string | number>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${base}?${query}`;
}

async function request(url: string, init: RequestInit, timeoutMs: number): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function getViaCosmos(url: string, timeoutMs = TIMEOUT_MS, headers?: Record<string, string>): Promise<any> {
  return request(url, { method: "GET", headers }, timeoutMs);
}

export function postViaCosmos(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = TIMEOUT_MS
): Promise<any> {
  return request(
    url,
    { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) },
    timeoutMs
  );
}
