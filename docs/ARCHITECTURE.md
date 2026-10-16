# Lyrics Viewer (#Hype): architecture and maintenance notes

How the app is put together, for anyone who wants to change it. (For what it does and how to run it, see the README.)
## What it is
An Electron window that follows whatever is playing on Windows and shows its lyrics with a copy of
Spicy Lyrics' real renderer. Pieces:

| Folder | What |
|---|---|
| `app/main.cjs` | Electron shell. Starts `bun run src/server.ts --no-window`, opens `http://127.0.0.1:3838`, kills the server on close. `app/package.json` is required (Electron needs it). |
| `src/server.ts` | Bun server: SSE `/events`, `/api/*`, `/cover`, `/fonts/*` (proxy of Spicy's font CDN), `/worker/*` (in-process Genius/YouTube Worker). |
| `src/smtc.ps1` | PowerShell reader of Windows' media session (title, artist, position, cover thumbnail, controls). Crops Spotify's logo band off thumbnails. |
| `src/engine.ts` | One search per song: resolve the song, ask every source, choose the best (`choose`), pins, per-song timing offsets, the "embedded" source. |
| `src/resolve.ts` | Finds cover (Apple search) and the Spotify id (own Spotify app if configured, else ListenBrainz labs lookup, else the debugger bridge hint). |
| `src/lookup.ts` | `config` (reads `config.json`) and `lookupOne(id, track)` for every provider; provider code is in `src/utils/Lyrics/providers` (copied from the fork). |
| `src/spotifyLocal.ts` | Optional bridge to Spotify's debugger port 8088: exact current track id, streaming quality, the Canvas address, heart/shuffle/repeat/volume state, and `spotifyDo()` for those four buttons. |
| `src/motion.ts` | Apple animated covers: finds the album (iTunes), reads the stream off the Apple album page, downloads the cover as one MP4 into `data/motion/`, serves it with byte ranges. Also `rangeFile()` (used for VLC video). |
| `src/cache.ts` | Lyrics cache (`data/lyrics-cache.json`). |
| `src/names.ts` | `sameName`: whole-word name matching ("Che" is not "Cher"). |
| `src/vlc.ts` | VLC via its web interface (password in config): status (including whether it is a video), controls, artwork, open file path. Position built from the whole-second tick (poll every 100 ms). |
| `src/local.ts` | Lyrics inside local files: music-folder index (`data/music-index.json`: titles/paths only), Windows Search lookup (ADODB), reads tags with `utils/LocalEmbed`. |
| `src/settings.ts` | `/api/config` read/write for the settings window; secrets are never sent to the page. |
| `ui/` | The page (TypeScript, bundled by `ui/build.ts` into `public/dist`). `ui/spicy/` is a **copy of the fork's `src`**; `ui/shims/` replaces the few modules tied to Spotify (see `REPLACED` in `ui/build.ts`). `ui/page.ts` builds the Spicy page and feeds it lyrics and the song clock; `menu.ts` (S menu), `settings.ts` (settings window), `controls.ts` (hover fade + dock lift), `cover.ts`, `offset.ts`, `dock.ts` (heart / volume / shuffle / repeat, timeline placement), `video.ts` (VLC video), `pair.ts` (Canvas + animated cover songs), `manager.ts` (lyrics manager popup) are the app's own UI. |
| `data/` | Runtime files: `picks.json`, `offsets.json`, `music-index.json`, `lyrics-cache.json`, `motion/` (animated covers), `fonts/`, `window/` (Electron profile: holds the page's localStorage and IndexedDB, i.e. the experiment switches and the lyrics manager's saved TTML). Safe to delete; deleting `window/` resets the switches and the saved lyrics. |
| `tools/` | Dev helpers (below). |

Data flow: smtc.ps1 / VLC -> `server.ts recompute()` -> `engine.ensureSearch` -> providers -> SSE to the page ->
`page.ts onState` -> `ApplyLyrics` (Spicy's own applier + animator). The song clock is `viewer.clock` in
`ui/state.ts`, read by the shimmed `SpotifyPlayer`/`GetProgress`.

## Run / build
- Run: `start.cmd` (needs Bun on PATH or in `%USERPROFILE%\.bun\bin`; `bun install` once).
- Rebuild the page after editing anything in `ui/`: `bun ui/build.ts` (needs the `sass` package for `default.scss`).
  The server code (`src/`) is not built; restart the app to apply.
- No type-check is set up for the app (the copied `tsconfig.json` has `"types": []`); `bun build src/server.ts
  --target=bun --outfile=...` is a quick syntax check.

## Testing against the real app (what has been used)
- Start Electron with the debugger port: `node_modules\electron\dist\electron.exe app --remote-debugging-port=9333`.
- `bun tools/cdp.ts eval "<js>"`, `shot <png>`, `hover x,y`, `size w,h` talk to that window. `window.__errors` holds
  page errors; `window.__viewer` has test hooks (`apply`, `clock`, `hold`, `tidy`, `cover`, `viewer`, `global` (Spicy's event bus), `setExperiment`).
  Faking a song: `__viewer.hold(true)` stops server updates, then set `__viewer.viewer.search / .media` and evoke `playback:songchange`.
- If the app is already open it holds the single-instance lock: stop its electron.exe/bun.exe first, or the debug launch silently does nothing.
- Tests that flip switches persist them (experiments live in `localStorage["SL:settings"]` of the profile): put them back afterwards.
- If Electron exits at once: `ELECTRON_RUN_AS_NODE` is set in the environment (unset it).
- The built-in browser pane throttles animation when hidden; the Electron window + CDP screenshots are reliable.
- PowerShell 5.1 quirks hit often: `&&` is not available; here-strings must close at column 0; reading/writing
  files with `Set-Content` can add a BOM or change line endings (the helper pattern used in this work reads the file,
  normalises `\r\n`, replaces, and writes UTF-8 without BOM).

## Updating the renderer from the fork
Copy the fork's `src` over `ui/spicy` (then re-apply the few edits listed here), run `bun ui/build.ts`, fix any
module the shims no longer fit. Local edits inside `ui/spicy`:
- `utils/Lyrics/Applyer/Credits/ApplyProvider.ts`: nothing project-specific now except the map entries (`embedded`).
- `utils/experiments.ts`: one viewer-only entry, `videoSongCover`, added to `EXPERIMENTS`.
- Everything else Spotify-specific is swapped through `ui/shims` (the `REPLACED` list in `ui/build.ts`): SpotifyPlayer, GetProgress, PageView, fetchLyrics,
  PopupLyrics, CompactMode, Resolve, AnimatedCover (asks `/api/motion`), LiveBackground (see below), CanvasVideo (Canvas address from the server),
  getTracks (lyrics manager). `ui/shims/env.ts` fakes the `Spicetify` global. Shims must import `./PageView.ts` (the shim), never Spicy's real
  PageView: the plugin only swaps imports made from inside `ui/spicy`, and the real one drags in modules that do not build here. The plugin matches
  extensionless imports too. `ui/project/config.ts` is copied from the fork's `project/`.
- Bun cannot parse the lyrics manager's `styles.css` (nested `@keyframes`), so `build.ts` appends it, `settings-panel.css` and the modal/sonner polyfills raw to `spicy.css`.
- `ui/page.ts present()` converts the developer API's lyrics shape for Spicy's code (`spicy_lyrics` -> `spl`,
  `UploadAttribution` -> `TTMLUploadMetadata`).

## Optional changes to your PC (reversible with `tools/undo-spotify-debug.ps1`)
- For the Spotify extras (exact song, Canvas, heart/shuffle/repeat/volume, quality) Spotify is started with `--remote-debugging-port=8088`
  (for example through Spicetify's `spotify_launch_flags`). That port can be used by any program on the PC, so it is optional.
- VLC's web interface must be enabled by hand (password in `config.json`).

## External services used
Spicy Lyrics developer API (your own key), LRCLIB/Unison/lrc.red/LRCMux/NetEase/QQ/KuGou/Kuwo/Deezer/AMLL/Bini/
YouTube Music/Genius/Musixmatch (own token), Apple iTunes search, ListenBrainz labs (`spotify-id-from-metadata`),
Spotify embed page (cover), Gemini (own key), fonts from `fonts.spikerko.org` (fetched by the server and cached).
Odesli now needs a key and Spotify developer apps may need Premium, so neither is required; an own-app Spotify search is optional.

## Known limits
- Spicy Lyrics only for songs on Spotify (needs a Spotify id). Local files use embedded lyrics and the other sources.
- Spotify quality labels (`LEVELS` in `spotifyLocal.ts`) come from Spotify's client enum; only "High (160 kbps)" was seen.
- VLC: position accurate to about 50 ms (whole-second ticks); VLC's 0..1 position was tried and is too coarse.
- Not ported: Spicy's full settings panel, Popup Lyrics.
- Spotify Canvas, heart, shuffle, repeat and volume need Spotify running with the debugger port (8088); other players have none of them. Apple covers need the album found on Apple Music (many albums have none).
- VLC video (cover / background / no-cover look, sync) was NOT tested against a live VLC (it would not start in the test sessions); the page side was tested with a stand-in file, and Apple's fragmented MP4 cannot be seeked reliably, so the playbackRate catch-up is also untested on a seekable file.
- One unexplained event: the saved blur value (`experimentValue:liveBackground`) once read 0 instead of 24 right after a rebuild; it stayed 24 across later reloads.
- Old Windows Media Player and apps that do not register with Windows' media controls are not detected.
- Gemini translation, VLC playback controls and audio-delay feel were never verified live.

## Recent changes (checkpoint)
- Names are compared as whole words (`src/names.ts sameName`): "Che" no longer matches "Cher". Used by Apple, Spotify and
  ListenBrainz matching and by local-file matching.
- Covers: when Spotify plays, the order is Spotify's own catalogue cover (embed page, by Spotify id), the player's
  thumbnail, then Apple's. For every other player the player's own cover comes first (VLC artwork / Windows thumbnail,
  bars trimmed in `ui/cover.ts`), then search covers. See `coverFor` in `src/server.ts`.
- Lyrics cache: `src/cache.ts` keeps online sources' results in `data/lyrics-cache.json` (found 3 days, not-found 6
  hours, 300 songs). Never cached: Spicy Lyrics (its terms), the embedded source, errors. "Check all sources again"
  clears the song's entry.
- The S menu is rebuilt only when its content changes and never under the pointer (rebuilding mid-click swallowed clicks).
- The "no lyrics" notice has no Copy details / Discord buttons (`ui/spicy/utils/Lyrics/LyricsNotice.ts` edited).
- Electron plays H.264 and HEVC directly (checked with canPlayType and MediaSource), so Spotify Canvas (mp4) and Apple's
  HLS animated covers need no conversion; Apple's CDN has to be reached through the server (CORS).

## Pictures: Canvas, animated covers, VLC video (current behaviour)
Switches are Spicy experiments, shown in the S menu and Settings > Pictures: Animated album covers (`animatedCover`, on), Spotify Canvas (`canvasImmersive`, on),
Live video background (`liveBackground`, off by default, now means VLC's video only), Covers for video songs (`videoSongCover`, on), Keep video aspect ratio
(`keepVideoAspect`, off), plus the Background blur slider (`experimentValue:liveBackground`, 0 to 60 px, default 24) and Video sync (`videoSyncMs`, -1000 to 1000 ms,
page localStorage). `page.ts` re-applies experiment page classes whenever one flips.

What shows, by song:
| Song | Cover spot | Background | Layout |
|---|---|---|---|
| Canvas only | (hidden) | the Canvas Stage, its colours light the page | Canvas dock: title, timeline, controls along the bottom, heart/volume (Spotify) |
| Canvas and an Apple animated cover (`ui/pair.ts`) | the animated cover | the Canvas video, dark and blurred (`.LiveBackgroundVideo.CanvasPair`, blur slider applies) | normal layout |
| Animated cover only | the animated cover | normal | normal |
| VLC video, Live video background on | the looked-up cover/animated cover (`videoSongCover`), or nothing | the video, blurred | with no cover: `NoCoverLook` + the Canvas dock layout |
| VLC video, Live video background off | the video, in step with VLC | normal | normal |
Animated covers never go in the background (`ui/shims/LiveBackground.ts` replaces Spicy's live background and keeps only the blur setting).
The Spotify Canvas switch turns the Canvas off everywhere, including the pair background.

How each piece works:
- Canvas Stage: the fork's `CanvasImmersive.ts` unchanged; `ui/shims/CanvasVideo.ts` supplies the Canvas MP4 address (`media.canvas`, from `spotifyCanvas()` in
  `src/spotifyLocal.ts`, polled every 1.5 s by `src/server.ts`). The shim returns nothing while `canvasWithheld()` (pair.ts: the animated-cover lookup is pending or found),
  so the stage stays away for pair songs and is shown as usual for songs without an animated cover. `page.ts onState` fires `nowbar:open` when the Canvas changes.
- Dock: Spicy's Canvas CSS styles heart, shuffle/repeat, volume and a timeline under the title. `ui/dock.ts` creates those elements and moves `.Timeline`; the buttons are
  Spotify's own: the server runs `spotifyDo()` for the fixed commands `heart`, `shuffle`, `repeat`, `volume <0..1>`. `controls.ts` drives `--DockLift`/`--StageBrightness`.
  `index.html` sets border-box inside `.NowBar` and hides the quality line in the Canvas layout.
- Apple animated covers: Spicy's `utils/AnimatedCover/` cover overlay, with `AnimatedCover.ts` shimmed to `/api/motion` -> `src/motion.ts` (largest H.264 variant up to 800 px;
  the HLS playlist only slices one MP4, so no ffmpeg/hls.js; albums with none are remembered a week, a failed iTunes search is not). The lookup needs the album, which the server
  finds after the song changes, so `page.ts paintMeta` re-evokes `page:open` once the track is resolved.
- VLC video: `vlcMedia()` sets `video`; the server finds the file once per song (`vlcCurrentPath`) and serves only that file (mp4/m4v/webm/mkv/mov) at `/videofile?v=<id>`.
  `ui/video.ts` plays it muted, kept on the song clock by nudging playbackRate (0.85 to 1.15), seeking only past 0.8 s and at most every 1.5 s, never mid-seek.
  `/cover?video=1` skips the player's artwork (a video's artwork is a frame): catalogue covers only.
- Spotify id order (`src/resolve.ts`): the exact id Spotify reports over the debugger port, then the own-app search (spotifyClientId/Secret), then ListenBrainz.
- Harmless console noise: "ResizeObserver loop completed" errors from the Canvas stage.

## Lyrics manager (Spicy's Local Lyrics DB) and sources
- `ui/manager.ts` opens the fork's React components unchanged (key L, or S menu > Lyrics manager). Saved TTML lives in the page's IndexedDB (`spicylyrics` db, key = song uri:
  the Spotify uri, else `viewer:track:<key>`). A saved entry wins over every source (`paintSaved` in `ui/page.ts`, credit "Provided by: Local DB"). Shims: `fetchLyrics.ts` (the manager
  calls it after upload/delete/reset; falls back to `viewer.reload`), `getTracks.ts` (names come from the last 200 songs the page showed, `ldbSeen` in localStorage). The list's play button does nothing.
- Every source is asked unless it is listed in `disabled` in config.json (Settings > Lyrics sources). Musixmatch is skipped, with a note, without your own token (Settings > Keys).

- VLC video names: for a file with a video stream, `src/names.ts cleanVideoName` strips "(Official Video)", "[4K]", YouTube ids, "- Topic" and the like (keeping "(feat. ...)"), and splits "Artist - Song" when no artist is tagged, before the song is looked up (Spicy Lyrics needs the Spotify id). Used in `src/vlc.ts vlcMedia`; audio files are untouched. Tested on example names only, not with a real VLC video.

- Spotify id for songs playing elsewhere (VLC, a browser): with no own Spotify app configured, `src/resolve.ts` asks the running Spotify client to search for the song (`spotifyClientSearch` in `src/spotifyLocal.ts`): Spotify's own search (`Spicetify.GraphQL.Request` with `searchModalResults`, run through the debugger port with the client's own login, so no developer app or key), answered in the Web API's shape. Only `api.spotify.com/v1/search` addresses are accepted by the function, and the Web API itself (CosmosAsync or the client token) was tried first and is rate-limited (429), which is why GraphQL is used. Its answer has no album name or length, so matching is by title and artist. Then ListenBrainz. Needs Spotify open with the debugger port. Verified live: "ick" by yuke, "Blinding Lights", "Video Games" and "Snooze" resolved, and Spicy Lyrics returned word-synced lyrics for the first two.
