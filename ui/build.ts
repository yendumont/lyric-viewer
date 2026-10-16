// Builds the page: bundles ui/main.ts with Spicy Lyrics' own renderer (copied into ui/spicy) and the
// few stand-in modules in ui/shims, and joins its stylesheets. Run by start.cmd before the server starts.
import { compile } from "sass";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const spicy = join(root, "ui", "spicy");
const out = join(root, "public", "dist");
mkdirSync(out, { recursive: true });

// Spicy Lyrics modules that are replaced here, by their path under ui/spicy.
const REPLACED: Record<string, string> = {
  "components/Global/SpotifyPlayer.ts": "SpotifyPlayer.ts",
  "utils/Gets/GetProgress.ts": "GetProgress.ts",
  "components/Pages/PageView.ts": "PageView.ts",
  "utils/Lyrics/fetchLyrics.ts": "fetchLyrics.ts",
  "components/Utils/PopupLyrics.ts": "PopupLyrics.ts",
  "components/Utils/CompactMode.ts": "CompactMode.ts",
  "utils/Lyrics/providers/Resolve.ts": "Resolve.ts",
    "utils/AnimatedCover/AnimatedCover.ts": "AnimatedCover.ts",
    "utils/AnimatedCover/LiveBackground.ts": "LiveBackground.ts",
    "components/DynamicBG/CanvasVideo.ts": "CanvasVideo.ts",
    "components/ReactComponents/LyricsManager/utils/getTracks.ts": "getTracks.ts",
};

const swap = {
  name: "swap-spicy-modules",
  setup(build: any) {
    build.onResolve({ filter: /^\.{1,2}\// }, (args: any) => {
      if (!args.importer.replaceAll("\\", "/").includes("/ui/spicy/")) return undefined;
      const target = resolve(dirname(args.importer), args.path).replaceAll("\\", "/");
      const relative = target.slice(spicy.replaceAll("\\", "/").length + 1);
      const shim = REPLACED[relative] ?? REPLACED[`${relative}.ts`];
      return shim ? { path: join(root, "ui", "shims", shim) } : undefined;
    });
  },
};

const result = await Bun.build({
  entrypoints: [join(root, "ui", "main.ts")],
  outdir: out,
  target: "browser",
  format: "esm",
  sourcemap: "none",
  minify: false,
  plugins: [swap],
  define: { "process.env.NODE_ENV": '"production"' },
});
if (!result.success) {
  for (const log of result.logs) console.error(String(log));
  process.exit(1);
}

// Spicy Lyrics' stylesheets, in the order it loads them.
const css = (file: string) => readFileSync(join(spicy, "css", file), "utf8");
const sheets = [
  "tokens.css",
  "primitives.css",
  "default.css",
  "Simplebar.css",
  "ContentBox.css",
  "DynamicBG/spicy-dynamic-bg.css",
  "Lyrics/main.css",
  "Lyrics/Mixed.css",
  "Lyrics/Extras.css",
  "Loaders/DotLoader.css",
  "Loaders/LoaderContainer.css",
  "Loaders/LyricsSkeleton.css",
  "font-pack/font-pack.css",
  "NoticeDialog.css",
  "settings-panel.css",
  "polyfills/generic-modal-polyfill.css",
  "polyfills/sonner-polyfill.css",
].map((file) => `/* ${file} */\n${css(file)}`);
sheets.push(`/* LyricsManager/styles.css */\n${readFileSync(join(spicy, "components", "ReactComponents", "LyricsManager", "styles.css"), "utf8")}`);
sheets.splice(3, 0, `/* default.scss */\n${compile(join(spicy, "css", "default.scss")).css}`);
writeFileSync(join(out, "spicy.css"), sheets.join("\n"));

console.log(`Built ${result.outputs.length} file(s) into public/dist`);
