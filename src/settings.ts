import { fileURLToPath } from "node:url";
import { existsSync, writeFileSync, renameSync } from "node:fs";
import { config } from "./lookup.ts";
import { ALL_IDS } from "./lookup.ts";
import { DEFAULT_ORDER, PROVIDER_LABELS } from "./utils/Lyrics/providers/registry.ts";
import type { LyricsProviderId } from "./utils/Lyrics/providers/registry.ts";

// The settings page reads and writes config.json through this. Keys and tokens are never sent to the page:
// it is only told whether one is set, and can replace or clear it.

const CONFIG_FILE = fileURLToPath(new URL("../config.json", import.meta.url));

const SECRETS = ["spicyApiKey", "musixmatchToken", "geminiApiKey", "vlcPassword", "spotifyClientSecret"] as const;

type Kind = "string" | "bool" | "number" | "list" | "choice";
const FIELDS: Record<string, { kind: Kind; choices?: string[] }> = {
  translateTo: { kind: "string" },
  geminiModel: { kind: "string" },
  geniusFavoriteArtists: { kind: "list" },
  geniusLooseSearch: { kind: "bool" },
  geniusEagerMatch: { kind: "bool" },
  lineMeaningsFrom: { kind: "choice", choices: ["artist", "editors", "everyone"] },
  wordSync: { kind: "choice", choices: ["hand", "all", "off"] },
  preferBestSync: { kind: "bool" },
  order: { kind: "list" },
  disabled: { kind: "list" },
  vlcPort: { kind: "number" },
  musicFolders: { kind: "list" },
  spotifyClientId: { kind: "string" },
};

const DEFAULTS: Record<string, unknown> = {
  translateTo: "English",
  geminiModel: "gemini-3.5-flash-lite",
  geniusFavoriteArtists: [],
  geniusLooseSearch: true,
  geniusEagerMatch: true,
  lineMeaningsFrom: "everyone",
  wordSync: "hand",
  preferBestSync: true,
  disabled: [],
  vlcPort: 8080,
  musicFolders: [],
  spotifyClientId: "",
};

export function readSettings() {
  const c = config as any;
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(FIELDS)) values[key] = c[key] ?? DEFAULTS[key];
  const given: string[] = Array.isArray(c.order) ? c.order : [];
  const base = [...given, ...(DEFAULT_ORDER as string[])].filter((id, i, all) => ALL_IDS.includes(id as any) && all.indexOf(id) === i);
  const rest = ALL_IDS.filter((id) => !base.includes(id));
  values.order = [...rest.filter((id) => id === "embedded"), ...base, ...rest.filter((id) => id !== "embedded")];

  const secrets: Record<string, boolean> = {};
  for (const key of SECRETS) secrets[key] = String(c[key] ?? "").trim() !== "";
  return {
    values,
    secrets,
    sources: ALL_IDS.map((id) => ({ id, label: id === "embedded" ? "Embedded lyrics (the song's own file)" : PROVIDER_LABELS[id as LyricsProviderId] })),
  };
}

/** Apply changes from the page (a field left out is left alone; `null` clears a secret) and save config.json. */
export function writeSettings(body: any): void {
  const c = config as any;
  for (const [key, spec] of Object.entries(FIELDS)) {
    if (!(key in body)) continue;
    const v = body[key];
    if (spec.kind === "string" && typeof v === "string") c[key] = v.trim();
    else if (spec.kind === "bool" && typeof v === "boolean") c[key] = v;
    else if (spec.kind === "number" && Number.isFinite(Number(v))) c[key] = Math.round(Number(v));
    else if (spec.kind === "choice" && spec.choices?.includes(String(v))) c[key] = String(v);
    else if (spec.kind === "list" && Array.isArray(v)) {
      const items = v.map((x) => String(x).trim()).filter(Boolean);
      c[key] = key === "order" || key === "disabled" ? items.filter((id) => ALL_IDS.includes(id as any)) : items;
    }
  }
  for (const key of SECRETS) {
    if (!(key in body)) continue;
    if (body[key] === null) c[key] = "";
    else if (typeof body[key] === "string" && body[key].trim() !== "") c[key] = body[key].trim();
  }

  // Written to a temp file first, so a failed write cannot leave a half-written config.
  const temp = `${CONFIG_FILE}.tmp`;
  writeFileSync(temp, JSON.stringify(c, null, 2));
  if (existsSync(CONFIG_FILE)) renameSync(temp, CONFIG_FILE);
  else renameSync(temp, CONFIG_FILE);
}
