// No Picture-in-Picture popup in this app.
export const IsPIP = false;
export const _IsPIP_after = false;
export async function ClosePopupLyrics(): Promise<void> {}
export async function OpenPopupLyrics(): Promise<void> {}
export function GetPopupDocument(): Document {
  return document;
}
