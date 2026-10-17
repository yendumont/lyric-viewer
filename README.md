<p align="center"><img src="assets/logo.png" alt="Lyrics Viewer (#Hype)" width="160"></p>

# Lyrics Viewer (#Hype)

A lyrics window for Windows that follows whatever is playing (Spotify, VLC, a browser tab, any app that shows in Windows' media
controls), finds its lyrics in every lyrics source it knows, and shows them with [Spicy Lyrics](https://github.com/spikerko/spicy-lyrics)'
own renderer: word-by-word fill, letter effects, scrolling, backing vocals, duets, interlude dots, translation, line meanings and the
animated background.

> **Unofficial.** Lyrics Viewer (#Hype) is an independent app, not made or supported by Spicy Lyrics, Spotify, Apple or VLC. See [NOTICE.md](NOTICE.md).

> **Status:** a personal project, looked after when time allows, so fixes may be slow. If something breaks, see [MAINTENANCE.md](MAINTENANCE.md) for the usual
> causes, and [SECURITY.md](SECURITY.md) to report a security problem privately.

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
`bun install` fetches the app's packages, and the first start of the app downloads Electron (about 100 MB) for you.

**The quick way:** download and extract the files (step 1 below), then **double-click `Setup.cmd`**. It offers to install Bun if you do not have it, installs the packages, downloads
Electron, builds the page, creates your `config.json` and puts a **Lyrics Viewer** shortcut on your desktop. Use that shortcut from then on. Setup is safe to run again.
If you prefer to do it by hand, or something goes wrong, the steps are below.

1. **Get the files.** Either click the green **Code** button on this page → **Download ZIP**, and extract it somewhere you will keep it
   (for example `C:\Apps`). The ZIP extracts to a folder called `lyric-viewer-main`, so you get `C:\Apps\lyric-viewer-main`. Or, if you have
   Git: `git clone https://github.com/yendumont/lyric-viewer.git` (that makes a folder called `lyric-viewer` instead).

2. **Install Bun** (once). Open PowerShell and run:

   ```powershell
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

   Then **close that window and open a new PowerShell** so it can find `bun`.

3. **Install the app's packages.** In PowerShell, go to the folder from step 1 and run:

   ```powershell
   cd C:\Apps\lyric-viewer-main
   bun install
   copy config.example.json config.json
   ```

   (Use your own folder in the `cd` line; it must be the folder that contains `start.cmd`. Tip: in File Explorer, open that folder, click the
   address bar, type `powershell` and press Enter.)

4. **Start it** by double-clicking `start.cmd` in that folder. The very first start downloads Electron (about 100 MB) and builds the page, which takes a minute before the window appears. Later starts are quick. It opens its own window; closing the window stops everything. To get a shortcut: right-click `start.cmd` → Show more
   options → Send to → Desktop (create shortcut), and pin that if you like.

It works straight away with no keys: it finds lyrics from the free sources. Add your keys and other settings afterwards (next section).

**If the window says it could not start:** check that Bun is installed (open a new PowerShell and run `bun --version`), and run
`bun install` again. To see the error, run `bun run src/server.ts` in the app folder and read what it prints.

## Updating

1. **Close the app.**
2. **Get the new files.** Download the ZIP again (Code → Download ZIP) and extract it somewhere temporary. If you installed with Git, run
   `git pull` in the app folder instead and skip to step 4.
3. **Copy them over your old folder.** Select everything inside the new `lyric-viewer-main` folder and paste it into your existing app
   folder, choosing "Replace the files in the destination". Your `config.json` (your keys) and `data` folder (caches, saved lyrics and
   your picture settings) are not in the ZIP, so they are kept.
4. **Rebuild: double-click `Setup.cmd` again.** It is safe to run again: it reinstalls the packages, downloads a newer Electron if the version changed, rebuilds
   the page and keeps your `config.json` and `data`. It also refreshes the desktop shortcut.

   Or by hand, in PowerShell in the app folder (File Explorer → click the address bar → type `powershell` → Enter):

   ```powershell
   bun install
   bun ui/build.ts
   ```

   The rebuild matters: the page is only built automatically the first time, so without it you would keep seeing the old version.
5. **Start it** from your desktop shortcut or with `start.cmd`. If the update changed Electron's version, `start.cmd` downloads the new one by itself first.

You do **not** need to run `Setup.cmd` again unless you are updating, moved the app folder (the shortcut then points at the old place), or something broke.

Files that were removed in a newer version are not deleted by copying over. That is harmless; if something acts oddly after a big update,
extract the ZIP into a fresh folder, copy only your `config.json` and `data` folder into it, and run `Setup.cmd` there.

## Setting it up

Open the settings window with the comma key (or the S menu → Settings). Everything below is also in `config.json`, which holds your
keys: never share or commit it (it is in `.gitignore`).

- **Spicy Lyrics key** (`spicyApiKey`): for Spicy Lyrics' own lyrics. Go to the [Spicy Lyrics developer dashboard](https://developers.spicylyrics.org/dashboard),
  create an application there, and copy its secret key into the settings window (Keys and tokens) or into `config.json`. The key is
  only ever sent to Spicy Lyrics' API. Without it that source is skipped and the other sources still work.
- **Musixmatch token** (`musixmatchToken`): your own; without it Musixmatch is skipped.
- **Gemini key** (`geminiApiKey`, `translateTo`, `geminiModel`): for translation. The lyrics of the song on screen are sent to Google's
  Gemini API with your key, nothing else is. The key stays in your config.json: the app's page never receives it, and translation requests go through the local server, which adds it.
- **Spotify app** (`spotifyClientId`, `spotifyClientSecret`, optional): Spicy Lyrics is looked up by Spotify song id. Without an app of
  your own, and with Spotify open with its debugger port (see below), Spotify itself searches for the song, using your own login and no app or key. Failing that the app asks ListenBrainz's public lookup (artist, album, title to Spotify ids), which covers released songs. With your
  own app (or one a friend lets you use; it is only used to search the public catalogue) its search is used first.
- **Source order and switches**: settings window → Lyrics sources.
- **Music folders** (`musicFolders`): extra folders to search for the playing song's file. Files anywhere Windows has indexed are found
  without this.

### Spotify extras (optional)

The exact song, Canvas, heart/shuffle/repeat/volume and the quality line come from Spotify's player state, read over Chromium's debugger
port, so Spotify has to be started with `--remote-debugging-port=8088`. **That port can be used by any program on your PC**, so leave it off
if you do not want that. Without it the app still works for any player; you just do not get those extras.
`tools/undo-spotify-debug.ps1` puts Spotify's launch back as it was.

With [Spicetify](https://spicetify.app):

1. Spicetify's own command, `spicetify config spotify_launch_flags "--remote-debugging-port=8088"`, often does **not** save the value
   (it treats the `--` as an option). Check with `spicetify config spotify_launch_flags`: if that prints nothing, edit the file by hand.
2. Press Win+R, run `notepad %APPDATA%\spicetify\config-xpui.ini`, and set the line to
   `spotify_launch_flags = --remote-debugging-port=8088` (no quotes; add it under `[Setting]` if there is no such line). Save it.
3. Run `spicetify apply`. Spotify restarts.
4. Check: with Spotify running, open `http://127.0.0.1:8088/json` in a browser. If you see text, the port is open.

The flag only applies when **Spicetify** starts Spotify (`spicetify apply`, `spicetify watch`). If you open Spotify from the Start menu,
the taskbar or at startup, it starts without it. To fix that, right-click your Spotify shortcut → Properties and add a space and
`--remote-debugging-port=8088` to the end of **Target** (unpin and re-pin the taskbar one afterwards).

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
- **A frozen Canvas** usually means Windows animations are off: Settings → Ease of Access → Display → "Show animations in Windows" must be On (Battery saver can also turn it off). Spicy Lyrics' Canvas code stops when Windows asks for reduced motion, in Spotify and in this app.
- The page can only be opened on the same PC (`http://127.0.0.1:3838`), not from other devices.

## Licence

[GNU Affero General Public License v3.0](LICENSE). Spicy Lyrics' code in `ui/spicy` and `src/utils` is by [Spikerko](https://github.com/spikerko/spicy-lyrics)
and is under the same licence. See [NOTICE.md](NOTICE.md).
