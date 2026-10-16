// Lyrics Viewer (#Hype) as an app: its own window, taskbar icon and name. It starts the viewer's server (Bun) in
// the background, shows the page in a window of its own, and stops the server when the window closes.
const { app, BrowserWindow, Menu, shell, nativeTheme } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..");
const PORT = readPort();
const ADDRESS = `http://127.0.0.1:${PORT}`;

function readPort() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8").replace(/^﻿/, ""));
    return Number(config.port) || 3838;
  } catch {
    return 3838;
  }
}

app.setAppUserModelId("LyricViewer.App");
nativeTheme.themeSource = "dark";

// One copy only: opening it again brings the window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let server = null;
let window = null;

function buildPageIfNeeded() {
  // The page is built once and rebuilt when its sources are newer (a copy made without it works too).
  const built = path.join(ROOT, "public", "dist", "main.js");
  if (fs.existsSync(built)) return;
  spawnSync(findBun(), ["ui/build.ts"], { cwd: ROOT, windowsHide: true, stdio: "ignore" });
}

function findBun() {
  const candidates = ["bun", path.join(process.env.USERPROFILE || "", ".bun", "bin", "bun.exe")];
  return candidates.find((c) => c === "bun" || fs.existsSync(c));
}

function startServer() {
  buildPageIfNeeded();
  server = spawn(findBun(), ["run", "src/server.ts", "--no-window"], { cwd: ROOT, windowsHide: true, stdio: "ignore" });
  server.on("exit", () => {
    server = null;
  });
}

function waitForServer(done, tries = 80) {
  http
    .get(`${ADDRESS}/api/init`, (res) => {
      res.resume();
      done(true);
    })
    .on("error", () => {
      if (tries <= 0) return done(false);
      setTimeout(() => waitForServer(done, tries - 1), 250);
    });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 520,
    minHeight: 420,
    backgroundColor: "#0e0e12",
    title: "Lyrics Viewer (#Hype)",
    icon: path.join(__dirname, "icon.ico"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      // The lyrics keep animating when the window is covered or on another screen.
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);

  // The window shows the page and nothing else: links go to the default browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ADDRESS)) {
      event.preventDefault();
      if (/^https:\/\//.test(url)) shell.openExternal(url);
    }
  });
  // The page sets the title to the song; the window keeps it.
  window.on("page-title-updated", () => {});

  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    window = null;
    app.quit();
  });
  window.loadURL(ADDRESS);
}

app.on("second-instance", () => {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

app.on("before-quit", () => {
  if (server) {
    try {
      server.kill();
    } catch {
      // already gone
    }
  }
});

app.whenReady().then(() => {
  startServer();
  waitForServer((ok) => {
    if (!ok) {
      // The server did not come up: say why in the window instead of showing nothing.
      window = new BrowserWindow({ width: 640, height: 260, title: "Lyrics Viewer (#Hype)", backgroundColor: "#0e0e12", autoHideMenuBar: true });
      window.loadURL(
        "data:text/html," +
          encodeURIComponent(
            '<body style="font:16px Segoe UI;color:#fff;background:#0e0e12;padding:32px"><h3>Lyrics Viewer (#Hype) could not start</h3>Is Bun installed? Run start.cmd in the app folder to see the error.</body>'
          )
      );
      return;
    }
    createWindow();
  });
});

app.on("window-all-closed", () => app.quit());
