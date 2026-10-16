// The small menu: which source's lyrics to show, and the switches that matter day to day.
import { $experiment, setExperiment } from "./spicy/utils/experiments.ts";
import {
  $lineMeanings,
  $minimalLyricsMode,
  $simpleLyricsMode,
  $smoothScrolling,
  $translateLyrics,
} from "./spicy/utils/stores.ts";
import { describeOffset, nudge, songOffset } from "./offset.ts";
import { openLyricsManager } from "./manager.ts";
import { closeSettings, openSettings, settingsOpen } from "./settings.ts";
import { viewer } from "./state.ts";

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const el = (tag: string, className = "", text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

let menu: HTMLElement;
let toastTimer = 0;

export function toast(text: string): void {
  const node = document.getElementById("toast");
  if (!node) return;
  node.textContent = text;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.classList.remove("show"), 1700);
}

function row(label: string, hint: string, on: boolean, onClick: () => void, disabled = false): HTMLElement {
  const button = el("button", on ? "on" : "");
  button.append(el("span", "", label), el("small", "", hint));
  button.disabled = disabled;
  button.onclick = () => {
    onClick();
    fill();
  };
  return button;
}

function fill(): void {
  lastSignature = signature();
  menu.textContent = "";
  const search = viewer.search;

  if (search) {
    const auto = el("button", search.pinned ? "" : "on");
    auto.append(el("span", "", "Automatic"), el("small", "", "best sync, in your order"));
    auto.onclick = () => {
      void post("/api/pick", { key: search.key, id: null });
      hide();
    };
    menu.append(auto);
    for (const source of search.sources) {
      const button = el("button", search.pinned === source.id ? "on" : "");
      const sync = source.sync === "word" ? "word" : source.sync === "line" ? "line" : source.sync === "none" ? "unsynced" : "";
      const hint =
        source.state === "found" ? `${sync}${source.lines ? ` · ${source.lines} lines` : ""}` :
        source.state === "searching" ? "searching…" :
        source.state === "none" ? "not found" :
        source.state === "skipped" ? "skipped" : "failed";
      button.append(el("span", "", source.label), el("small", "", hint));
      button.disabled = source.state !== "found";
      button.title = source.detail ?? "";
      button.onclick = () => {
        void post("/api/pick", { key: search.key, id: source.id });
        hide();
      };
      menu.append(button);
    }
    const again = el("button", "");
    again.append(el("span", "", "Check all sources again"), el("small", "", search.searching || search.resolving ? "searching…" : "ask every source"));
    again.disabled = search.searching || search.resolving;
    again.onclick = () => {
      void post("/api/recheck", {});
      hide();
      toast("Checking every source again…");
    };
    menu.append(again, el("hr"));
  }

  menu.append(
    row("Prefer best sync", viewer.prefs.preferBestSync ? "on" : "off", viewer.prefs.preferBestSync, () =>
      void post("/api/prefs", { preferBestSync: !viewer.prefs.preferBestSync })
    ),
    row("Translate lyrics", $translateLyrics.get() ? "on" : "off", $translateLyrics.get(), () => $translateLyrics.set(!$translateLyrics.get())),
    row("Word-synced translation", $experiment("syncedTranslation").get() ? "on" : "off", $experiment("syncedTranslation").get(), () =>
      setExperiment("syncedTranslation", !$experiment("syncedTranslation").get())
    ),
    row("Line meanings (Genius)", $lineMeanings.get() ? "on" : "off", $lineMeanings.get(), () => $lineMeanings.set(!$lineMeanings.get())),
    row("Smooth scrolling", $smoothScrolling.get() ? "on" : "off", $smoothScrolling.get(), () => $smoothScrolling.set(!$smoothScrolling.get())),
    row("Animated album covers", $experiment("animatedCover").get() ? "on" : "off", $experiment("animatedCover").get(), () =>
      setExperiment("animatedCover", !$experiment("animatedCover").get())
    ),
    row("Spotify Canvas", $experiment("canvasImmersive").get() ? "on" : "off", $experiment("canvasImmersive").get(), () =>
      setExperiment("canvasImmersive", !$experiment("canvasImmersive").get())
    ),
    row("Keep video aspect ratio", $experiment("keepVideoAspect").get() ? "on" : "off", $experiment("keepVideoAspect").get(), () =>
      setExperiment("keepVideoAspect", !$experiment("keepVideoAspect").get())
    ),
    row("Live video background", $experiment("liveBackground").get() ? "on" : "off", $experiment("liveBackground").get(), () =>
      setExperiment("liveBackground", !$experiment("liveBackground").get())
    ),
    row("Simple Lyrics Mode", $simpleLyricsMode.get() ? "on" : "off", $simpleLyricsMode.get(), () => $simpleLyricsMode.set(!$simpleLyricsMode.get())),
    row("Minimal Lyrics Mode", $minimalLyricsMode.get() ? "on" : "off", $minimalLyricsMode.get(), () => $minimalLyricsMode.set(!$minimalLyricsMode.get()))
  );

  const offset = el("div", "offset");
  const minus = el("button", "", "−");
  const plus = el("button", "", "+");
  const value = el("span", "", describeOffset(songOffset()));
  const change = (delta: number | null) => {
    value.textContent = describeOffset(nudge(delta));
  };
  minus.onclick = () => change(-50);
  plus.onclick = () => change(50);
  value.title = "Saved for this song and source. Keys: [ and ] move it 50 ms (Shift: 10 ms), 0 resets.";
  value.onclick = () => change(null);
  offset.append(minus, value, plus);
  menu.append(el("hr"), offset);

  const settings = el("button", "");
  settings.append(el("span", "", "Settings…"), el("small", "", "sources, keys, translation"));
  settings.onclick = () => {
    hide();
    void openSettings(() => window.dispatchEvent(new Event("lv:config")));
  };
  const manager = el("button", "");
  manager.append(el("span", "", "Lyrics manager…"), el("small", "", "saved lyrics, upload TTML (L)"));
  manager.onclick = () => {
    menu.hidden = true;
    openLyricsManager();
  };
  menu.append(el("hr"), manager, settings);
}

function shiftBy(delta: number | null): void {
  toast(describeOffset(nudge(delta)));
}

export const hide = (): void => {
  menu.hidden = true;
};

export function toggleMenu(anchor: HTMLElement): void {
  if (!menu.hidden) return hide();
  fill();
  menu.hidden = false;
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(12, Math.min(rect.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 12))}px`;
  menu.style.top = `${rect.bottom + 8}px`;
}

let lastSignature = "";

/** What the menu shows, so it is only rebuilt when that changes (rebuilding mid-click swallowed the click). */
function signature(): string {
  const s = viewer.search;
  return JSON.stringify([s?.key, s?.pinned, s?.searching, s?.resolving, s?.sources.map((x) => [x.id, x.state, x.sync, x.lines]), viewer.prefs, songOffset()]);
}

export function refreshMenu(): void {
  if (menu.hidden) return;
  const next = signature();
  if (next === lastSignature) return;
  // Never while the pointer is on it: a button replaced between press and release does not click.
  if (menu.matches(":hover")) return;
  lastSignature = next;
  fill();
}

export function initMenu(): void {
  menu = el("div", "vmenu");
  menu.hidden = true;
  document.body.append(menu, Object.assign(el("div", "vtoast"), { id: "toast" }));

  const tools = el("div", "vtools");
  const gear = el("button", "vtool");
  gear.title = "Sources and settings (S)";
  gear.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>';
  gear.onclick = (event) => {
    event.stopPropagation();
    toggleMenu(gear);
  };
  const full = el("button", "vtool");
  full.title = "Fullscreen (F)";
  full.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 5h6v2H7v4H5zm8 0h6v6h-2V7h-4zM5 13h2v4h4v2H5zm12 0h2v6h-6v-2h4z"/></svg>';
  full.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  tools.append(gear, full);
  document.body.append(tools);

  document.addEventListener("click", (event) => {
    if (!menu.hidden && !menu.contains(event.target as Node)) hide();
  });
  document.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) return;
    const key = event.key.toLowerCase();
    if (settingsOpen()) return;
    if (key === "s") toggleMenu(gear);
    else if (key === "f") full.click();
    else if (key === "l") openLyricsManager();
    else if (key === "escape") {
      if (settingsOpen()) closeSettings();
      else hide();
    } else if (event.key === ",") void openSettings(() => window.dispatchEvent(new Event("lv:config")));
    else if (event.key === "]" || event.key === "}") shiftBy(event.shiftKey ? 10 : 50);
    else if (event.key === "[" || event.key === "{") shiftBy(event.shiftKey ? -10 : -50);
    else if (key === "0") shiftBy(null);
    else if (key === " ") {
      event.preventDefault();
      viewer.command("toggle");
    } else if (key === "t") {
      $translateLyrics.set(!$translateLyrics.get());
      toast(`Translation ${$translateLyrics.get() ? "on" : "off"}`);
    }
  });
}
