// Spicy Lyrics' compact mode (cover and title on top, lyrics below, for a narrow window), without its
// link to the Spotify-bound Now Bar module.
import { GetCurrentLyricsContainerInstance } from "../spicy/utils/Lyrics/Applyer/CreateLyricsContainer.ts";
import { SyncNoLyricsLayout } from "../spicy/utils/Lyrics/LyricsNotice.ts";
import { $lockedMediaBox } from "../spicy/utils/stores.ts";
import Global from "../spicy/components/Global/Global.ts";
import { PageContainer } from "./PageView.ts";

let CompactMode = false;

const nowBar = () => PageContainer?.querySelector<HTMLElement>(".ContentBox .NowBar") ?? null;

export const EnableCompactMode = () => {
  const page = PageContainer;
  if (!page) return;

  page.classList.add("CompactMode", "NowBarSide__Left");
  page.classList.remove("NowBarSide__Right");
  const bar = nowBar();
  if (!bar) return;
  bar.classList.add("LeftSide");
  bar.classList.remove("RightSide");
  bar.classList.toggle("LockedMediaBox", $lockedMediaBox.get());

  CompactMode = true;
  SyncNoLyricsLayout();
  GetCurrentLyricsContainerInstance()?.Resize();
  Global.Event.evoke("compact-mode:enable");
};

export const DisableCompactMode = () => {
  const page = PageContainer;
  if (!page) return;

  page.classList.remove("CompactMode");
  page.classList.add("NowBarSide__Left");
  page.classList.remove("NowBarSide__Right");
  const bar = nowBar();
  bar?.classList.add("LeftSide");
  bar?.classList.remove("RightSide", "LockedMediaBox");
  CompactMode = false;
  SyncNoLyricsLayout();
  GetCurrentLyricsContainerInstance()?.Resize();

  Global.Event.evoke("compact-mode:disable");
};

export const IsCompactMode = () => CompactMode;

export const ToggleCompactMode = () => {
  if (CompactMode) DisableCompactMode();
  else EnableCompactMode();
};
