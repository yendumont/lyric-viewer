<p align="center"><img src="assets/logo.png" alt="Lyric Viewer" width="160"></p>

# Lyric Viewer

A lyrics window for Windows that follows whatever is playing (Spotify, VLC, a browser tab, any app that shows in Windows' media
controls), finds its lyrics in every lyrics source it knows, and shows them with [Spicy Lyrics](https://github.com/spikerko/spicy-lyrics)'
own renderer: word-by-word fill, letter effects, scrolling, backing vocals, duets, interlude dots, translation, line meanings and the
animated background.

> **Unofficial.** Lyric Viewer is an independent app, not made or supported by Spicy Lyrics, Spotify, Apple or VLC. See [NOTICE.md](NOTICE.md).

## Features

- **Follows what is playing.** Windows' media controls, VLC (through its web interface) and, optionally, Spotify's own player state.
- **Every source at once.** Spicy Lyrics (your developer key), LRCLIB, Unison, lrc.red, LRCMux, NetEase, QQ Music, KuGou, Kuwo, Deezer,
  AMLL TTML DB, BiniLyrics, YouTube Music, Genius, Musixmatch (your own token), plus lyrics stored inside your music files. The
  best-synced result is shown (word, then line, then plain); pin another source per song, or change the order, in the settings.
- **Lyrics cache.** Online results are kept for a few days so a replayed song is not searched again. Spicy Lyrics' answers, lyrics from
  your own files and errors are never kept.
- **Lyrics manager.** Spicy Lyrics' Local Lyrics DB: upload a `.ttml` for the song on screen (save it or use it once), search, download
  and delete. Saved lyrics win over every source.
- **Translation and line meanings** (translation uses your own Gemini key), Simple and Minimal lyrics modes, per-song timing offsets.
- **Spotify Canvas** in Spicy Lyrics' Canvas Stage layout, with heart, shuffle, repeat and volume (needs Spotify's debugger port, see below).
- **Apple Music animated covers** in the cover spot. A song with both a Canvas and an animated cover shows the animated cover in the
  cover spot and the Canvas, blurred, behind the lyrics. Animated covers never go in the background.
- **Videos playing in VLC**: the picture fills the background (darkened, blurred, adjustable) or plays in the cover spot, kept in step
  with VLC; the song's cover or animated cover can be looked up for the cover spot, or the page goes without a cover.
- **Local files**: lyrics stored in the song's file (lyrics tag, embedded TTML or LRC, synced-lyrics frame), found through your music
  folders or Windows Search.

## Install

You need Windows 10 or 11, an internet connection, and [Bun](https://bun.sh). You do not need to install Node.js or Electron yourself:
`bun install` downloads Electron (about 100 MB) for you.

1. **Get the files.** Either click the green **Code** button on this page → **Download ZIP**, and extract it somewhere you will keep it
   (for example `C:\Apps\lyric-viewer`), or, if you have Git: `git clone https://github.com/yendumont/lyric-viewer.git`.

2. **Install Bun** (once). Open PowerShell and run:

   ```powershell
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

   Then **close that window and open a new PowerShell** so it can find `bun`.

3. **Install the app's packages.** In PowerShell, go to the folder from step 1 and run:

   ```powershell
   cd C:\Apps\lyric-viewer
   bun install
   copy config.example.json config.json
   ```

   (Use your own folder in the `cd` line. Tip: in File Explorer, open the folder, click the address bar, type `powershell` and press Enter.)

4. **Start it** by double-clicking `start.cmd` in that folder. The very first start builds the page, which takes a few seconds before the
   window appears. It opens its own window; closing the window stops everything. To get a shortcut: right-click `start.cmd` → Show more
   options → Send to → Desktop (create shortcut), and pin that if you like.

It works straight away with no keys: it finds lyrics from the free sources. Add your keys and other settings afterwards (next section).

**If the window says it could not start:** check that Bun is installed (open a new PowerShell and run `bun --version`), and run
`bun install` again. To see the error, run `bun run src/server.ts` in the app folder and read what it prints.

To update later: download the new files over the old ones (keep your `config.json`), then run `bun install` and `bun ui/build.ts`.

## Setting it up

Open the settings window with the comma key (or the S menu → Settings). Everything below is also in `config.json`, which holds your
keys: never share or commit it (it is in `.gitignore`).

- **Spicy Lyrics key** (`spicyApiKey`): for Spicy Lyrics' own lyrics. Go to the [Spicy Lyrics developer dashboard](https://developers.spicylyrics.org/dashboard),
  create an application there, and copy its secret key into the settings window (Keys and tokens) or into `config.json`. The key is
  only ever sent to Spicy Lyrics' API. Without it that source is skipped and the other sources still work.
- **Musixmatch token** (`musixmatchToken`): your own; without it Musixmatch is skipped.
- **Gemini key** (`geminiApiKey`, `translateTo`, `geminiModel`): for translation. The lyrics of the song on screen are sent to Google's
  Gemini API with your key, nothing else is.
- **Spotify app** (`spotifyClientId`, `spotifyClientSecret`, optional): Spicy Lyrics is looked up by Spotify song id. Without an app of
  your own the app asks ListenBrainz's public lookup (artist, album, title to Spotify ids), which covers released songs. With your
  own app (or one a friend lets you use; it is only used to search the public catalogue) its search is used first.
- **Source order and switches**: settings window → Lyrics sources.
- **Music folders** (`musicFolders`): extra folders to search for the playing song's file. Files anywhere Windows has indexed are found
  without this.

### Spotify extras (optional)

The exact song, Canvas, heart/shuffle/repeat/volume and the quality line come from Spotify's player state, read over Chromium's debugger
port. Start Spotify with `--remote-debugging-port=8088` (with [Spicetify](https://spicetify.app):
`spicetify config spotify_launch_flags "--remote-debugging-port=8088"` then `spicetify apply`). **That port can be used by any program
on your PC**, so leave it off if you do not want that. `tools/undo-spotify-debug.ps1` puts Spotify's launch back as it was. Without it
the app still works for any player; you just do not get those extras.

### VLC

VLC does not tell Windows what it plays, so the app reads VLC's web interface. In VLC: Tools → Preferences → Show settings: All →
Interface → Main interfaces: tick **Web**; then Main interfaces → Lua: set a **Lua HTTP password**. Put the same password in
`config.json` (`vlcPassword`, and `vlcPort` if not 8080), then restart VLC and the app. For a video file the app serves only the file
VLC currently has open, to its own window.

## Keys

`Space` play/pause · `S` sources and settings menu · `,` settings window · `L` lyrics manager · `T` translate · `[` `]` lyrics
earlier/later · `0` reset that · `F` fullscreen · click a line to seek · `Esc` closes the menu. Move the mouse over the cover for the
controls and the timeline.

## Pictures

Settings → Pictures (also in the S menu): Animated album covers, Spotify Canvas, Live video background (a VLC video), Covers for
video songs, Keep video aspect ratio, Background blur, Video sync.

## How it works

A Bun server reads what is playing, finds the song, asks every source and serves a page; an Electron window shows the page. The page is
a copy of Spicy Lyrics' renderer with a few Spotify-specific modules replaced. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

To update the renderer after Spicy Lyrics changes: copy its `src` over `ui/spicy`, run `bun ui/build.ts`, and fix any module the shims
no longer fit (`ui/build.ts` lists the replaced ones).

## Known limits

- Spicy Lyrics only has songs that are on Spotify (it needs a Spotify id); other sources cover the rest.
- Canvas, heart, shuffle, repeat, volume and the Spotify quality line only work with Spotify's debugger port open.
- Apple animated covers exist only for some albums.
- The old Windows Media Player and apps that do not register with Windows' media controls are not detected.
- Showing a VLC video has had limited testing.

## Licence

[GNU Affero General Public License v3.0](LICENSE). Spicy Lyrics' code in `ui/spicy` and `src/utils` is by [Spikerko](https://github.com/spikerko/spicy-lyrics)
and is under the same licence. See [NOTICE.md](NOTICE.md).
