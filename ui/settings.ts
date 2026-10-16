import { $experimentSlider, isExperimentEnabled, setExperiment } from "./spicy/utils/experiments.ts";

// The settings window: everything that used to need editing config.json. Opened from the S menu or with the
// comma key. Keys are never sent here: each shows whether it is set, and can be replaced or cleared.

type Source = { id: string; label: string };
type Data = { values: Record<string, any>; secrets: Record<string, boolean>; sources: Source[] };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

let overlay: HTMLElement | null = null;

const get = async (): Promise<Data> => (await fetch("/api/config")).json();
const save = async (body: unknown): Promise<Data> =>
  (await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();

export const settingsOpen = () => !!overlay;

export function closeSettings(): void {
  overlay?.remove();
  overlay = null;
}

function row(label: string, hint: string | null, control: HTMLElement): HTMLElement {
  const wrap = el("div", "st-row");
  const text = el("div", "st-text");
  text.append(el("div", "st-label", label));
  if (hint) text.append(el("div", "st-hint", hint));
  wrap.append(text, control);
  return wrap;
}

function toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const label = el("label", "st-toggle");
  const input = el("input");
  input.type = "checkbox";
  input.checked = on;
  input.onchange = () => onChange(input.checked);
  label.append(input, el("span", "st-track"));
  return label;
}

function textField(value: string, placeholder: string, onCommit: (v: string) => void, secret = false): HTMLInputElement {
  const input = el("input", "st-input");
  input.type = secret ? "password" : "text";
  input.value = value;
  input.placeholder = placeholder;
  input.spellcheck = false;
  input.autocomplete = "off";
  input.onchange = () => onCommit(input.value);
  return input;
}

function select(value: string, options: [string, string][], onChange: (v: string) => void): HTMLElement {
  const box = el("select", "st-input");
  for (const [v, label] of options) {
    const option = el("option", "", label);
    option.value = v;
    box.append(option);
  }
  box.value = value;
  box.onchange = () => onChange(box.value);
  return box;
}

/** A key or token: shows whether one is set; typing a new one replaces it, Clear removes it. */
function secretField(name: string, isSet: boolean, apply: (body: Record<string, unknown>) => Promise<void>, placeholder: string): HTMLElement {
  const wrap = el("div", "st-secret");
  const input = textField("", isSet ? "set (type to replace)" : placeholder, () => {}, true);
  input.onchange = async () => {
    if (!input.value.trim()) return;
    await apply({ [name]: input.value });
    input.value = "";
  };
  wrap.append(input);
  if (isSet) {
    const clear = el("button", "st-small", "Clear");
    clear.type = "button";
    clear.onclick = () => void apply({ [name]: null });
    wrap.append(clear);
  }
  return wrap;
}

export async function openSettings(onChanged: () => void): Promise<void> {
  if (overlay) return;
  overlay = el("div", "st-overlay");
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) closeSettings();
  });
  const panel = el("div", "st-panel");
  overlay.append(panel);
  document.body.append(overlay);

  const render = async () => {
    const data = await get();
    const top = panel.scrollTop;
    panel.textContent = "";

    const head = el("div", "st-head");
    head.append(el("h2", "", "Settings"));
    const close = el("button", "st-close", "×");
    close.type = "button";
    close.onclick = closeSettings;
    head.append(close);
    panel.append(head);

    const apply = async (body: Record<string, unknown>, rerender = true) => {
      await save(body);
      onChanged();
      if (rerender) await render();
    };
    const v = data.values;

    // ── Sources ──
    panel.append(el("h3", "", "Lyrics sources"));
    panel.append(el("p", "st-note", "Asked from top to bottom; switch off the ones you do not want. The best-synced result is shown, and this order breaks ties."));
    const order: string[] = [...v.order];
    const off = new Set<string>(v.disabled);
    const labelOf = (id: string) => data.sources.find((s) => s.id === id)?.label ?? id;
    const list = el("div", "st-list");
    order.forEach((id, index) => {
      const item = el("div", "st-source" + (off.has(id) ? " off" : ""));
      item.append(el("span", "st-rank", String(index + 1)), el("span", "st-name", labelOf(id)));
      const up = el("button", "st-small", "↑");
      up.type = "button";
      up.disabled = index === 0;
      up.onclick = () => {
        [order[index - 1], order[index]] = [order[index], order[index - 1]];
        void apply({ order });
      };
      const down = el("button", "st-small", "↓");
      down.type = "button";
      down.disabled = index === order.length - 1;
      down.onclick = () => {
        [order[index + 1], order[index]] = [order[index], order[index + 1]];
        void apply({ order });
      };
      item.append(up, down, toggle(!off.has(id), (on) => {
        if (on) off.delete(id);
        else off.add(id);
        void apply({ disabled: [...off] });
      }));
      list.append(item);
    });
    panel.append(list);
    panel.append(row("Prefer best sync", "Show word sync over line sync over unsynced; off uses the first source that has lyrics.", toggle(v.preferBestSync, (on) => void apply({ preferBestSync: on }, false))));
    panel.append(row("lrc.red / BiniLyrics word sync", "Hand-timed only keeps word sync where a person timed it.", select(v.wordSync, [["hand", "Hand-timed only"], ["all", "All word sync"], ["off", "No word sync"]], (x) => void apply({ wordSync: x }, false))));

    // ── Keys ──
    panel.append(el("h3", "", "Keys and tokens"));
    panel.append(el("p", "st-note", "Kept in config.json on this PC and only sent to the service they are for."));
    panel.append(row("Spicy Lyrics key", "Your developer key.", secretField("spicyApiKey", data.secrets.spicyApiKey, apply, "paste your key")));
    panel.append(row("Gemini API key", "For translation (aistudio.google.com).", secretField("geminiApiKey", data.secrets.geminiApiKey, apply, "paste your key")));
    panel.append(row("Musixmatch token", "Your own user token; without it Musixmatch is skipped.", secretField("musixmatchToken", data.secrets.musixmatchToken, apply, "paste your token")));
    panel.append(row("VLC web password", "For VLC (see the README); VLC needs its web interface on.", secretField("vlcPassword", data.secrets.vlcPassword, apply, "VLC's Lua HTTP password")));
    panel.append(row("VLC web port", "Usually 8080. Takes effect after restarting the app.", textField(String(v.vlcPort ?? 8080), "8080", (x) => void apply({ vlcPort: Number(x) || 8080 }, false))));

    // ── Local files ──
    panel.append(el("h3", "", "Local files"));
    panel.append(row("Music folders", "Extra folders to search for the playing song's file, separated by semicolons. Files anywhere Windows has indexed (everything under your user folder by default) are found without this; use it for other drives or folders Windows does not index.", textField((v.musicFolders as string[]).join("; "), "C:\\Users\\you\\Music", (x) => void apply({ musicFolders: x.split(";") }, false))));

    // ── Translation ──
    panel.append(el("h3", "", "Pictures"));
    panel.append(el("p", "st-note", "Moving pictures behind the song. Saved on this PC; the Canvas needs Spotify running with its debugger port (see the README)."));
    const picture = (id: "animatedCover" | "canvasImmersive" | "liveBackground" | "videoSongCover" | "keepVideoAspect", label: string, hint: string) =>
      panel.append(row(label, hint, toggle(isExperimentEnabled(id), (on) => setExperiment(id, on))));
    picture("animatedCover", "Animated album covers", "Apple Music's moving cover, over the album cover, when the album has one.");
    picture("canvasImmersive", "Spotify Canvas", "The song's Canvas video fills the cover side of the screen, and its colours light the page.");
    picture("liveBackground", "Live video background", "A video playing in VLC, darkened and blurred, behind the lyrics. (Animated covers never go in the background.)");
    {
      const blur = $experimentSlider("liveBackground");
      const wrap = el("div", "st-slider");
      const range = el("input");
      range.type = "range";
      range.min = "0";
      range.max = "60";
      range.step = "1";
      range.value = String(blur.get());
      const value = el("span", "st-sliderval", `${blur.get()} px`);
      range.oninput = () => {
        blur.set(Number(range.value));
        value.textContent = `${range.value} px`;
      };
      wrap.append(range, value);
      panel.append(row("Background blur", "How blurred the video behind the lyrics is. 0 is sharp.", wrap));
    }
    {
      const wrap = el("div", "st-slider");
      const range = el("input");
      range.type = "range";
      range.min = "-1000";
      range.max = "1000";
      range.step = "10";
      range.value = localStorage.getItem("videoSyncMs") ?? "0";
      const value = el("span", "st-sliderval", `${range.value} ms`);
      range.oninput = () => {
        localStorage.setItem("videoSyncMs", range.value);
        value.textContent = `${range.value} ms`;
      };
      wrap.append(range, value);
      panel.append(row("Video sync", "If the picture is ahead of VLC, move this up (shows it later); behind, move it down.", wrap));
    }
    picture("keepVideoAspect", "Keep video aspect ratio", "Show videos and animated covers in their own shape instead of cropping them to fill the screen.");
    picture("videoSongCover", "Covers for video songs", "With a video as the background: look up the song's cover or animated cover for the cover spot; off, or none found, shows no album cover.");

    panel.append(el("h3", "", "Translation"));
    panel.append(row("Translate into", "In plain words: English, Español, 日本語…", textField(v.translateTo, "English", (x) => void apply({ translateTo: x || "English" }, false))));
    panel.append(row("Gemini model", "The default is the fastest and cheapest.", textField(v.geminiModel, "gemini-3.5-flash-lite", (x) => void apply({ geminiModel: x || "gemini-3.5-flash-lite" }, false))));

    // ── Genius ──
    panel.append(el("h3", "", "Genius"));
    panel.append(row("Favourite artists", "Real artists whose songs you have under someone else's name, separated by commas.", textField((v.geniusFavoriteArtists as string[]).join(", "), "artist one, artist two", (x) => void apply({ geniusFavoriteArtists: x.split(/[,\n]/) }, false))));
    panel.append(row("Loose search", "When the exact song finds nothing, search more broadly.", toggle(v.geniusLooseSearch, (on) => void apply({ geniusLooseSearch: on }))));
    panel.append(row("Eager matching", "Show the best-looking page when nothing proves which is right (needs loose search).", toggle(v.geniusEagerMatch, (on) => void apply({ geniusEagerMatch: on }, false))));
    panel.append(row("Meanings from", "Whose Genius explanations to show on lines.", select(v.lineMeaningsFrom, [["artist", "Artist only"], ["editors", "Artist and editors"], ["everyone", "Everyone"]], (x) => void apply({ lineMeaningsFrom: x }, false))));

    panel.scrollTop = top;
  };

  await render();
}
