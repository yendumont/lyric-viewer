import Global from "./spicy/components/Global/Global.ts";
import ApplyDynamicBackground, { PAGE_BACKGROUND_KEY } from "./spicy/components/DynamicBG/dynamicBackground.ts";
import { Icons } from "./spicy/components/Styling/Icons.ts";
import { DestroyAllLyricsContainers } from "./spicy/utils/Lyrics/Applyer/CreateLyricsContainer.ts";
import ApplyLyrics from "./spicy/utils/Lyrics/Global/Applyer.ts";
import { EmitNotApplyed } from "./spicy/utils/Lyrics/Applyer/OnApply.ts";
import { IsLyricsSkeletonEnabled, SkeletonMarkup, ShowLyricsSkeleton } from "./spicy/utils/Lyrics/LyricsSkeleton.ts";
import { triggerRemeasureLV } from "./spicy/utils/Lyrics/LyricsVirtualizer.ts";
import { onAnimationFrame } from "./spicy/utils/AnimationFrameLoop.ts";
import { CleanupScrollEvents, InitializeScrollEvents, ScrollToActiveLine } from "./spicy/utils/Scrolling/ScrollToActiveLine.ts";
import { ClearScrollSimplebar, ScrollSimplebar } from "./spicy/utils/Scrolling/Simplebar/ScrollSimplebar.ts";
import { addLinesEvListener, ClearLyricsContentArrays, LyricsObject } from "./spicy/utils/Lyrics/lyrics.ts";
import { ApplyExperimentClasses, isExperimentEnabled, onExperimentChange, setExperiment } from "./spicy/utils/experiments.ts";
import { initAnimatedCover } from "./spicy/utils/AnimatedCover/index.ts";
import "./spicy/components/DynamicBG/CanvasImmersive.ts";
import {
  $currentLyricsData,
  $currentLyricsType,
  $geminiApiKey,
  $geminiModel,
  $geniusEagerMatch,
  $geniusFavoriteArtists,
  $geniusLooseSearch,
  $geniusProxyUrl,
  $lineMeanings,
  $lineMeaningsFrom,
  $lyricsContainerExists,
  $playbackOffset,
  $smoothScrolling,
  $translationLanguage,
} from "./spicy/utils/stores.ts";
import { DisableCompactMode, EnableCompactMode } from "./shims/CompactMode.ts";
import { initLineExtras } from "./spicy/utils/Lyrics/Extras/index.ts";
import { setPage } from "./shims/PageView.ts";
import { initControlsFade } from "./controls.ts";
import { initDock, paintDock } from "./dock.ts";
import { initVideo, paintVideo } from "./video.ts";
import { initPair, paintPair } from "./pair.ts";
import { rememberSong } from "./shims/getTracks.ts";
import { LocalLyricsManager } from "./spicy/utils/Lyrics/manager/index.ts";
import { fetchCover, tidy } from "./cover.ts";
import { initMenu, refreshMenu } from "./menu.ts";
import { applyServerOffset } from "./offset.ts";
import { rawPositionMs, uriOf, viewer, type Media, type Prefs, type Search } from "./state.ts";

const $ = <T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector);

let page: HTMLElement;
let loaded = { key: "", id: "" };

// ── The page ───────────────────────────────────────────────────────────────────────────────
function buildPage(): HTMLElement {
  const element = document.createElement("div");
  element.id = "SpicyLyricsPage";
  element.classList.add("SpicyRenderer", "UseSpicyFont", "Fullscreen", "NowBarStatus__Open", "NowBarSide__Left");
  element.innerHTML = `
    <div class="ContentBox">
      <div class="NowBar Active LeftSide">
        <div class="CenteredView">
          <div class="Header">
            <div class="MediaBox">
              <div class="MediaContent"></div>
              <div class="MediaImageContainer">
                <div class="fi_FromImage ib_ImageBox"></div>
                <div class="ti_ToImage ib_ImageBox"></div>
              </div>
            </div>
            <div class="Metadata">
              <div class="SongName"><span></span></div>
              <div class="Artists"><span></span></div>
              <div class="Quality"><span></span></div>
            </div>
          </div>
        </div>
      </div>
      <div class="LyricsContainer">
        <div class="loaderContainer"><div id="DotLoader"></div></div>
        ${SkeletonMarkup}
        <div class="LyricsContent ScrollbarScrollable"></div>
      </div>
      <div class="ViewControls"></div>
    </div>`;
  return element;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function buildNowBar(): void {
  const content = $(".NowBar .MediaContent", page)!;
  content.innerHTML = `
    <div class="Timeline">
      <span class="Time Position">0:00</span>
      <div class="SliderBar" style="--SliderProgress: 0"><div class="Handle"></div></div>
      <span class="Time Duration">0:00</span>
    </div>
    <div class="PlaybackControls">
      <div class="PlaybackControl ShuffleToggle" style="visibility:hidden">${Icons.Shuffle}</div>
      <span class="PrevControl">${Icons.PrevTrack}</span>
      <div class="PlaybackControl PlayStateToggle Paused">${Icons.Play}</div>
      <span class="NextControl">${Icons.NextTrack}</span>
      <div class="PlaybackControl LoopToggle" style="visibility:hidden">${Icons.Loop}</div>
    </div>`;

  const slider = $<HTMLElement>(".SliderBar", content)!;
  slider.addEventListener("click", (event) => {
    const rect = slider.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    viewer.seek(Math.round(fraction * (viewer.media.durationMs ?? 0)));
  });
  const press = (selector: string, command: string) => {
    const node = $(selector, content);
    node?.addEventListener("click", () => viewer.command(command));
  };
  press(".PrevControl", "prev");
  press(".PlayStateToggle", "toggle");
  press(".NextControl", "next");
}

function paintNowBar(): void {
  const media = viewer.media;
  const duration = media.durationMs ?? 0;
  const position = Math.min(rawPositionMs(), duration || Infinity);
  const slider = $<HTMLElement>(".SliderBar", page);
  slider?.style.setProperty("--SliderProgress", String(duration ? position / duration : 0));
  const positionText = $(".Time.Position", page);
  const durationText = $(".Time.Duration", page);
  if (positionText) positionText.textContent = fmt(position);
  if (durationText) durationText.textContent = fmt(duration);

  const toggle = $(".PlayStateToggle", page);
  const playing = viewer.clock.playing;
  if (toggle && toggle.classList.contains("Playing") !== playing) {
    toggle.classList.toggle("Playing", playing);
    toggle.classList.toggle("Paused", !playing);
    toggle.innerHTML = playing ? Icons.Pause : Icons.Play;
  }
}

let shownCover = "";
let lastSeen = "";
let lastTrackStamp = "";
function paintMeta(): void {
  const search = viewer.search;
  const media = viewer.media;
  const title = search?.track?.name || media.title || "";
  const artists = search?.track?.artists?.length ? search.track.artists.join(", ") : search?.track?.artist || media.artist || "";
  const name = $(".Metadata .SongName span", page);
  const by = $(".Metadata .Artists span", page);
  if (name && name.textContent !== title) name.textContent = title;
  if (by && by.textContent !== artists) by.textContent = artists;
  const quality = $(".Metadata .Quality span", page);
  const qualityText = media.quality ?? "";
  if (quality && quality.textContent !== qualityText) quality.textContent = qualityText;
  const seenUri = uriOf();
  const seenStamp = `${seenUri}|${title}|${artists}`;
  if (seenUri && seenStamp !== lastSeen) {
    lastSeen = seenStamp;
    rememberSong(seenUri, title, artists ? artists.split(", ") : [], media.durationMs ?? 0, viewer.coverUrl || undefined);
  }
  document.title = title ? `${artists} - ${title}` : "Lyric Viewer";

  // A new cover when the song changes, when the player hands over its own, and once the lookup has one.
  const key = search?.key ?? "";
  // The animated cover and the live background look the song up by its album, which the server finds a moment after the
  // song changes: once it is known they are asked again (they ran, and found nothing to look up, when the song changed).
  const trackStamp = search?.track ? `${key}|${search.track.album}` : "";
  if (trackStamp && trackStamp !== lastTrackStamp) {
    lastTrackStamp = trackStamp;
    setTimeout(() => Global.Event.evoke("page:open", { cardMode: false }), 0);
  }
  // A video in VLC shown as the background: its cover is looked up (when the experiment is on) instead of taken from the player.
  const videoLookup = !!media.video && isExperimentEnabled("liveBackground") && isExperimentEnabled("videoSongCover");
  const stamp = `${key}|${media.cover || ""}|${search?.track ? 1 : 0}|${videoLookup ? "v" : ""}`;
  if (key && stamp !== shownCover) {
    shownCover = stamp;
    const url = `/cover?key=${encodeURIComponent(key)}${videoLookup ? "&video=1" : ""}&t=${Date.now()}`;
    viewer.coverMissing = false;
    void fetchCover(url).then((shown) => {
      // Dropped if the song changed while it loaded.
      if (shownCover !== stamp) return;
      if (!shown) {
        viewer.coverMissing = true;
        return;
      }
      viewer.coverUrl = shown;
      void ApplyDynamicBackground($(".ContentBox", page)!, PAGE_BACKGROUND_KEY);
      const from = $<HTMLElement>(".fi_FromImage", page);
      if (from) {
        from.style.backgroundImage = `url("${shown}")`;
        from.classList.add("containsImage");
      }
      Global.Event.evoke("viewer:cover", shown);
    });
  }
}

// ── Server events ──────────────────────────────────────────────────────────────────────────
function onState(next: { media: Media; search: Search | null; prefs: Prefs }): void {
  if ((window as any).__hold) return;
  const previous = viewer.search?.key;
  const canvasBefore = viewer.media.canvas?.url ?? "";
  viewer.media = next.media;
  viewer.search = next.media.none ? null : next.search;
  viewer.prefs = next.prefs;
  refreshMenu();
  // The Canvas is read from Spotify a moment after the song changes (and goes when the player does): the stage follows.
  if ((next.media.canvas?.url ?? "") !== canvasBefore) setTimeout(() => Global.Event.evoke("nowbar:open", {}), 0);

  const media = next.media;
  const playing = !media.none && media.status === "Playing";
  if (media.none || !media.title) {
    if (!idle) showIdle();
    viewer.clock = { pos: 0, at: Date.now(), playing: false };
    page.classList.add("NothingPlaying");
    return;
  }
  page.classList.remove("NothingPlaying");
  idle = false;

  const reported = (media.positionMs ?? 0) + (playing ? Date.now() - (media.at ?? Date.now()) : 0);
  const mine = rawPositionMs();
  const trackChanged = previous !== viewer.search?.key;
  if (trackChanged || Math.abs(reported - mine) > 350 || viewer.clock.playing !== playing) {
    viewer.clock = { pos: reported, at: Date.now(), playing };
  } else {
    viewer.clock = { pos: mine + (reported - mine) * 0.2, at: Date.now(), playing };
  }

  if (trackChanged) {
    loaded = { key: "", id: "" };
    savedChecked = "";

    clearForNewSong();
    Global.Event.evoke("playback:songchange", { uri: uriOf() });
  }
  applyServerOffset(viewer.search?.offsetMs ?? 0);
  paintMeta();
  void paintLyrics();
}

let idle = false;
/** Nothing is playing: the lyrics and the cover go, and a plain notice shows. */
function showIdle(): void {
  idle = true;
  loaded = { key: "", id: "" };
  shownCover = "";
  viewer.coverUrl = "";
  clearForNewSong();
  document.title = "Lyric Viewer";
}

/** The old song's lyrics go at once, and the loading placeholder shows until the new ones arrive. */
function clearForNewSong(): void {
  EmitNotApplyed();
  DestroyAllLyricsContainers();
  ClearLyricsContentArrays();
  ClearScrollSimplebar();
  const content = $(".LyricsContainer .LyricsContent", page);
  if (content) content.innerHTML = "";
  $currentLyricsType.set("None");
  if (IsLyricsSkeletonEnabled()) ShowLyricsSkeleton();
  else $(".LyricsContainer .loaderContainer", page)?.classList.add("active");
}

/** What Spicy Lyrics' own fetch does when lyrics are ready, before they are applied. */
function present(lyrics: any, uri: string | undefined): void {
  // Spicy Lyrics' developer API names its sources and its uploader differently from the extension, whose
  // credit lines (Provided by, and Made by @name with the picture) are then drawn by Spicy's own code.
  const names: Record<string, string> = { spicy_lyrics: "spl", apple_music: "aml", spotify: "spt" };
  if (names[lyrics.source]) {
    if (lyrics.source === "spicy_lyrics" && lyrics.UploadAttribution && !lyrics.TTMLUploadMetadata) {
      lyrics.TTMLUploadMetadata = { Maker: lyrics.UploadAttribution.Maker, Uploader: lyrics.UploadAttribution.Uploader };
    }
    lyrics.source = names[lyrics.source];
  }
  lyrics.uri = uri;
  $currentLyricsData.set(JSON.stringify(lyrics));
  $currentLyricsType.set(lyrics.Type);
}

let savedChecked = "";

/** Lyrics saved in the lyrics manager win over every source, as in Spicy Lyrics. */
async function paintSaved(key: string, uri: string | undefined): Promise<boolean> {
  if (!uri) return false;
  if (loaded.key === key && loaded.id === "ldb") return true;
  if (savedChecked === key) return false;
  savedChecked = key;
  const saved = await LocalLyricsManager.get(uri);
  if (viewer.search?.key !== key) return false;
  if (!saved) return false;
  loaded = { key, id: "ldb" };
  const data = { ...saved, uri };
  present(data, uri);
  await ApplyLyrics([data, 200, uri]);
  return true;
}

async function paintLyrics(): Promise<void> {
  const search = viewer.search;
  if (!search) return;
  const uri = uriOf();
  const chosen = search.chosen;
  if (await paintSaved(search.key, uri)) return;
  // Saved lyrics are on screen for this song but another check is pending: leave them be.
  if (loaded.key === search.key && loaded.id === "ldb") return;

  if (chosen) {
    if (loaded.key === search.key && loaded.id === chosen) return;
    loaded = { key: search.key, id: chosen };
    try {
      const res = await fetch(`/api/lyrics?key=${encodeURIComponent(search.key)}&id=${encodeURIComponent(chosen)}`);
      if (!res.ok) throw new Error("no lyrics");
      const lyrics = await res.json();
      if (loaded.key !== search.key || loaded.id !== chosen) return;
      present(lyrics, uri);
      await ApplyLyrics([lyrics, 200, uri]);
    } catch {
      loaded = { key: "", id: "" };
    }
  } else if (!search.searching && !search.resolving) {
    if (loaded.key === search.key && loaded.id === "none") return;
    loaded = { key: search.key, id: "none" };
    await ApplyLyrics(["lyrics-not-found", 404, uri]);
  }
}

function connect(): void {
  const source = new EventSource("/events");
  source.onmessage = (event) => onState(JSON.parse(event.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 1500);
  };
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** The keys and the Worker address come from the app's config, then Spicy Lyrics' own translation and meanings take over. */
async function loadInit(): Promise<void> {
  try {
    const init = await (await fetch("/api/init")).json();
    $geminiApiKey.set(init.geminiApiKey ?? "");
    if (init.geminiModel) $geminiModel.set(init.geminiModel);
    $translationLanguage.set(init.translateTo || "English");
    $geniusFavoriteArtists.set(init.geniusFavoriteArtists ?? "");
    $lineMeaningsFrom.set(init.lineMeaningsFrom);
    $geniusLooseSearch.set(init.geniusLooseSearch !== false);
    $geniusEagerMatch.set(init.geniusEagerMatch !== false);
    $geniusProxyUrl.set(init.geniusProxyUrl);
  } catch (error) {
    console.error("init", error);
  }
}

async function startExtras(): Promise<void> {
  await loadInit();
  window.addEventListener("lv:config", () => void loadInit());
  // Line meanings (Genius's explanations, the small "i" next to lines) start on, as in Spicy Lyrics here; the S menu turns them off.
  if (localStorage.getItem("lineMeaningsOn") !== "1") {
    $lineMeanings.set(true);
    localStorage.setItem("lineMeaningsOn", "1");
  }
  // Smooth Scrolling, Spicy Lyrics' glide from line to line, starts on here (it is opt-in in the extension).
  if (!localStorage.getItem("smoothScrollDefaulted")) {
    $smoothScrolling.set(true);
    localStorage.setItem("smoothScrollDefaulted", "1");
  }
  initLineExtras();
  // Apple's animated covers start on here (the Canvas Stage is on by default); both have switches in the S menu and Settings.
  if (!localStorage.getItem("animatedCoverDefaulted")) {
    setExperiment("animatedCover", true);
    localStorage.setItem("animatedCoverDefaulted", "1");
  }
  initAnimatedCover();
}

export function initPage(): void {
  page = buildPage();
  document.getElementById("app")!.appendChild(page);
  const notice = document.createElement("div");
  notice.className = "IdleNotice";
  notice.innerHTML = "<img src=\"/logo.png\" alt=\"\"><b>Nothing is playing</b>Play something in Spotify, a browser, or any app that shows in Windows' media controls.";
  document.getElementById("app")!.appendChild(notice);
  setPage(page);

  viewer.markSaved = (uri) => {
    if (viewer.search && uriOf() === uri) {
      loaded = { key: viewer.search.key, id: "ldb" };
      savedChecked = viewer.search.key;
    }
  };
  viewer.reload = async (uri) => {
    const search = viewer.search;
    if (!search || uriOf() !== uri) return null;
    loaded = { key: "", id: "" };
    savedChecked = search.key;
    if (!search.chosen) return ["lyrics-not-found", 404, uri];
    try {
      const res = await fetch(`/api/lyrics?key=${encodeURIComponent(search.key)}&id=${encodeURIComponent(search.chosen)}`);
      if (!res.ok) throw new Error("no lyrics");
      const lyrics = await res.json();
      loaded = { key: search.key, id: search.chosen };
      present(lyrics, uri);
      return [lyrics, 200, uri];
    } catch {
      return ["lyrics-not-found", 404, uri];
    }
  };
  viewer.command = (cmd) => void post("/api/cmd", { cmd });
  viewer.seek = (ms) => {
    if (!viewer.media.canSeek) return;
    const target = Math.max(0, Math.round(ms));
    viewer.command(`seek ${target}`);
    viewer.clock = { pos: target, at: Date.now(), playing: viewer.clock.playing };
  };

  $playbackOffset.set(0);

  ApplyExperimentClasses(page);
  // Spicy's page code re-applies these when a switch flips; here that is up to us.
  onExperimentChange(() => ApplyExperimentClasses(page));
  const contentBox = $(".ContentBox", page)!;
  try {
    ApplyDynamicBackground(contentBox, PAGE_BACKGROUND_KEY);
  } catch (error) {
    console.error("background", error);
  }

  // Following the song: what Spicy Lyrics' page sets up when lyrics are applied, and its per-frame scroll.
  Global.Event.listen("lyrics:not-apply", () => CleanupScrollEvents());
  Global.Event.listen("lyrics:apply", ({ Type }: { Type: string }) => {
    CleanupScrollEvents();
    if (!Type || Type === "Static") return;
    if (ScrollSimplebar) InitializeScrollEvents(ScrollSimplebar);
    setTimeout(() => triggerRemeasureLV(), 1000);
    setTimeout(() => triggerRemeasureLV(), 1500);
  });
  onAnimationFrame(() => {
    if (ScrollSimplebar) ScrollToActiveLine(ScrollSimplebar);
  });

  // The same rule as Spicy Lyrics' Fullscreen view: a window narrower than 70.8rem switches to compact mode.
  const narrow = window.matchMedia("(max-width: 70.812rem)");
  const fit = () => {
    if (narrow.matches) {
      page.classList.add("CompactifyEnabledCompactMode");
      EnableCompactMode();
    } else {
      page.classList.remove("CompactifyEnabledCompactMode");
      DisableCompactMode();
    }
  };
  narrow.addEventListener("change", fit);

  buildNowBar();
  initDock(page);
  initVideo(page);
  initPair(page);
  fit();
  initControlsFade(page);
  initMenu();
  addLinesEvListener();
  void startExtras();
  $lyricsContainerExists.set(true);
  Global.Event.evoke("page:open", { cardMode: false });

  const tick = () => {
    requestAnimationFrame(tick);
    paintNowBar();
    paintDock();
    paintVideo();
    paintPair();
  };
  requestAnimationFrame(tick);
  connect();
}

// Hooks for testing the drawing without a song (tools/cdp.ts).
(window as any).__viewer = {
  apply: (lyrics: object) => {
    present(lyrics, uriOf());
    return ApplyLyrics([lyrics, 200, uriOf()]);
  },
  clock: (ms: number, playing = false) => (viewer.clock = { pos: ms, at: Date.now(), playing }),
  clear: () => clearForNewSong(),
  viewer,
  global: Global,
  setExperiment,
  cover: fetchCover,
  tidy,
  hold: (on: boolean) => ((window as any).__hold = on),
  exists: () => $lyricsContainerExists.get(),
  type: () => $currentLyricsType.get(),
  counts: () => ({ syl: LyricsObject.Types.Syllable.Lines.length, line: LyricsObject.Types.Line.Lines.length, first: LyricsObject.Types.Syllable.Lines[1]?.StartTime, status: LyricsObject.Types.Syllable.Lines.slice(0, 6).map((l: any) => l.Status) }),
  setExists: (v: boolean) => $lyricsContainerExists.set(v),
};
