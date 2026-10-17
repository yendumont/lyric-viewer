# Security policy

## Reporting a problem

If you find a security problem, please report it **privately** through GitHub: open this repository's **Security** tab and choose **Report a vulnerability**.
Please do not post details in a public issue. Include what you did, what happened, and which version you used.

This is a personal project maintained in spare time, so replies can be slow. Reports are read and taken seriously.

## What is and is not covered

- **Supported:** the latest version on the `main` branch.
- **How the app is built to stay safe:** the local server only listens on `127.0.0.1` and refuses requests with another `Host` or `Origin`; the window only shows the app's own
  page (other links open in your browser); the Gemini key, Spicy Lyrics key, Musixmatch token and VLC password stay on the server and are never sent to the page.
- **Good to know:** the optional Spotify features use Spotify's debugger port (`--remote-debugging-port=8088`), which any program on your PC can use while it is on.
  Leave it off if you do not want that (the README explains how).

## For people using the app

- Keep your keys in `config.json` only, and never share that file or post it anywhere.
- Keep the app up to date (see the Updating section of the README) so you get the latest Electron and package fixes.
