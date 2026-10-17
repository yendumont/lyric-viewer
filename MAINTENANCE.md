# Maintenance guide

For whoever looks after this project, with or without an AI helper. It says what to do when something needs updating or stops
working, in plain steps. For how the code is put together, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## The rules that keep it safe

- **Never put secrets on GitHub.** `config.json` (your keys), the `data` folder and `node_modules` are listed in `.gitignore`. Before every
  commit in GitHub Desktop, read the file list: if you see `config`, `.env`, a log, or anything you do not recognise, do not commit it.
- **Use the no-reply email** for commits (GitHub Desktop → File → Options → Git), never your real one.
- **Never paste a key, token or password** into a chat, an issue, a commit message or a file in this repository.
- **Test before you push.** Open the app with `start.cmd`, check that the window opens and shows lyrics, then commit and push.

## Things that need doing now and then

### Update Electron (the window the app runs in)
Electron only gets security fixes for its newest few versions, so check every few months, or when GitHub's Dependabot alert appears.

1. In the app folder, in PowerShell: `bun outdated` (shows what is old).
2. `bun add electron@latest`, then `bun node_modules/electron/install.js` (downloads the new program), then `bun ui/build.ts`.
3. Start it with `start.cmd` and check: the window opens, lyrics and the cover show, Settings opens (comma key), and, if you use them, a Spotify Canvas, a VLC video and a translation.
4. If it works, commit `package.json` and `bun.lock` and push. If something broke, go back with `git checkout package.json bun.lock`, run `bun install`, and ask an AI for help with the error.

### Update the other packages
`bun update`, then `bun audit` (it should say no vulnerabilities), then test as above.

### Update the copy of Spicy Lyrics' renderer (`ui/spicy`)
Only when Spicy Lyrics or your fork changes something you want. Copy the fork's `src` folder over `ui/spicy`, run `bun ui/build.ts`, and fix what the
build complains about. The shims in `ui/shims` replace the few parts that only work inside Spotify; `ui/build.ts` lists them. See ARCHITECTURE.md.

### Publish a new version
1. Commit and push in GitHub Desktop.
2. On GitHub: the repo → **Releases** → **Draft a new release** → type a new tag such as `v1.0.1` → write two lines about what changed → **Publish**.

## When something stops working

| What you see | What to check |
|---|---|
| Spicy Lyrics row in the S menu says the key was refused | Open `developers.spicylyrics.org/dashboard`, check the application is still there, rotate the key, paste the new one in Settings → Keys and tokens. |
| No Canvas, heart or volume buttons from Spotify | Spotify must be started with `--remote-debugging-port=8088` (see the README). After a Spotify or Spicetify update run `spicetify apply` again. With Spotify open, `http://127.0.0.1:8088/json` in a browser must show text. |
| Canvas is frozen | Windows animations are off: Settings → Ease of Access → Display → "Show animations in Windows" must be On (and Battery saver off). |
| One lyrics source always shows an error | Sources change their websites. Switch it off in Settings → Lyrics sources. Its code is `src/utils/Lyrics/providers/<name>.ts`; give that file and the error to an AI. |
| VLC does nothing | VLC's web interface must be on with a password, the same one as `vlcPassword` in `config.json` (see the README). |
| "Could not start" | Run `bun install` again, then `bun run src/server.ts` and read the error. |
| The app opens but shows nothing | Close it, run `bun run src/server.ts` in a terminal, open `http://127.0.0.1:3838` in a normal browser and press F12 to read the errors in its console. |

## Asking an AI for help

Give it the file `docs/ARCHITECTURE.md` first (it explains the project), then the exact error text and the one or two files involved. Ask it to
explain a change before making it, and to test in a separate copy of the folder, not in your working one. Do not give it your `config.json`.

## The Spotify extension fork

The fork has its own notes: `README.md` (install and update), `RUNBOOK.md` (build, release, merging Spicy Lyrics' changes) and `FORK_NOTES.md`
(how it works). In short: `scripts\update-fork.ps1` pulls Spicy Lyrics' latest changes into the code, then you commit, push and publish a release with the built file
`spicy-lyrics-hype.providers.js` attached.

## If you stop maintaining it

Say so in the README ("no longer maintained") and, if you like, archive the repository: **Settings → General → Danger Zone → Archive this repository**. It stays
readable, and anyone can still copy it.
