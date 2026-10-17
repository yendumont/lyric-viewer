import { fileURLToPath } from "node:url";
// Makes the provider code (written for Spotify's page) run on its own: a tiny stand-in for
// the bits of Spicetify it touches, a DOMParser for Genius pages, and an in-process copy of
// the Worker so Genius and YouTube Music need no deployed Worker.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DOMParser } from "linkedom";
import worker from "./worker/worker.js";

export const WORKER_BASE = "http://worker.local";

const STORE = fileURLToPath(new URL("../data/storage.json", import.meta.url));
const memory: Record<string, string> = existsSync(STORE) ? JSON.parse(readFileSync(STORE, "utf8")) : {};

(globalThis as any).Spicetify = {
  LocalStorage: {
    get: (key: string) => memory[key] ?? null,
    set: (key: string, value: string) => {
      memory[key] = value;
      mkdirSync(dirname(STORE), { recursive: true });
      writeFileSync(STORE, JSON.stringify(memory));
    },
  },
};
(globalThis as any).DOMParser = DOMParser;

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: any, init?: any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(WORKER_BASE)) return (worker as any).fetch(new Request(url, init));
  return realFetch(input, init);
}) as typeof fetch;
