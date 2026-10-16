// Spicy Lyrics' PageView builds its page inside Spotify's main view. Here the page is built by
// ui/page.ts, which hands its root element over through setPage().
export let PageContainer: HTMLElement | null = null;
export let IsCardMode = false;

export function setPage(element: HTMLElement | null): void {
  PageContainer = element;
}

export const Tooltips: Record<string, null> = {};
export const GetPageRoot = () => PageContainer?.parentElement ?? null;
export const isSizeReadyToBeCompacted = () => window.matchMedia("(max-width: 70.812rem)").matches;
export function Compactify(): void {}

const PageView = {
  Open: async () => {},
  Destroy: () => {},
  AppendViewControls: () => {},
  IsOpened: true,
  IsTippyCapable: false,
};

export default PageView;
