// Covers: a picture found by search is used as it is. The player's own picture (a video frame from a
// browser, a thumbnail Windows has) often comes with plain bars at its sides or ends, or is not
// square; those bars are cut off and the rest is centred in a square, as a cover should be.

let lastObjectUrl = "";

const load = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("cover"));
    };
    image.src = url;
  });

/**
 * Whether a row or column of pixels is part of a bar: one flat colour, nearly black or white, or mostly
 * the colour of its own end with a little on it (Spotify's logo on its black or white band).
 */
function isBar(data: Uint8ClampedArray, width: number, height: number, index: number, vertical: boolean): boolean {
  const count = vertical ? height : width;
  const at = (k: number) => (vertical ? k * width + index : index * width + k) * 4;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  const first = at(0);
  let same = 0;
  let clear = 0;
  for (let k = 0; k < count; k += 2) {
    const i = at(k);
    if (data[i + 3] < 16) clear++;
    const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
    sum += v;
    sumSq += v * v;
    n++;
    if (Math.abs(data[i] - data[first]) < 14 && Math.abs(data[i + 1] - data[first + 1]) < 14 && Math.abs(data[i + 2] - data[first + 2]) < 14) same++;
  }
  // Spotify's thumbnail leaves the space around its square cover see-through, with its logo drawn in it.
  if (clear / n >= 0.5) return true;
  const mean = sum / n;
  const deviation = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  if (deviation < 9 || ((mean < 26 || mean > 235) && deviation < 22)) return true;
  return same / n >= 0.6 && (mean < 100 || mean > 160);
}
/** A row with nothing in it: see-through (Spotify's band) or one flat colour. */
function isGap(data: Uint8ClampedArray, width: number, y: number): boolean {
  let clear = 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let x = 0; x < width; x += 2) {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 16) clear++;
    const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
    sum += v;
    sumSq += v * v;
    n++;
  }
  const mean = sum / n;
  return clear / n >= 0.9 || Math.sqrt(Math.max(0, sumSq / n - mean * mean)) < 4;
}

export async function tidy(blob: Blob): Promise<Blob> {
  const image = await load(blob);
  const scale = Math.min(1, 720 / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  let left = 0;
  let right = w - 1;
  let top = 0;
  let bottom = h - 1;
  while (left < w * 0.45 && isBar(data, w, h, left, true)) left++;
  while (right > w * 0.55 && isBar(data, w, h, right, true)) right--;
  while (top < h * 0.45 && isBar(data, w, h, top, false)) top++;
  while (bottom > h * 0.55 && isBar(data, w, h, bottom, false)) bottom--;
  // A band with a logo in it (Spotify's) has rows that are not flat, so the walk above can stop inside it. The
  // first row below the picture that is completely empty (or completely flat) ends the picture, whatever follows.
  for (let y = Math.max(top + 1, Math.floor(h * 0.45)); y <= bottom; y++) {
    if (isGap(data, w, y)) {
      bottom = y - 1;
      break;
    }
  }
  // A soft edge beside a bar is part of it.
  const pad = (n: number) => Math.round(n * 1.04);
  left = left > 2 ? Math.min(pad(left), w * 0.45) : 0;
  top = top > 2 ? Math.min(pad(top), h * 0.45) : 0;
  right = right < w - 3 ? Math.max(w - pad(w - 1 - right) - 1, w * 0.55) : w - 1;
  bottom = bottom < h - 3 ? Math.max(h - pad(h - 1 - bottom) - 1, h * 0.55) : h - 1;

  const cw = right - left + 1;
  const ch = bottom - top + 1;
  const side = Math.min(cw, ch);
  const squareAlready = Math.abs(cw - ch) / Math.max(cw, ch) < 0.05;
  if (cw === w && ch === h && squareAlready) return blob;

  const out = document.createElement("canvas");
  out.width = out.height = Math.min(side, 640);
  out.getContext("2d")!.drawImage(canvas, left + (cw - side) / 2, top + (ch - side) / 2, side, side, 0, 0, out.width, out.height);
  return new Promise((resolve) => out.toBlob((b) => resolve(b ?? blob), "image/jpeg", 0.92));
}

/** The cover at `url` as an address the page can use, tidied when it is the player's own picture. */
export async function fetchCover(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    let blob = await res.blob();
    if (res.headers.get("X-Cover-Source") === "player") {
      try {
        blob = await tidy(blob);
      } catch {
        // use it as it is
      }
    }
    if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = URL.createObjectURL(blob);
    return lastObjectUrl;
  } catch {
    return null;
  }
}
