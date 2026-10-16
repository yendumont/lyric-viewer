// Spicy Lyrics' live background plays the album's Apple animated cover behind the lyrics. Not wanted here: an animated
// cover only ever plays in the cover spot. What remains of the feature is the blur setting, which the video backgrounds
// the viewer does have (VLC's video, a Canvas next to an animated cover) are styled with (--LiveBackgroundBlur).
import { PageContainer } from "./PageView.ts";
import { $experimentSlider } from "../spicy/utils/experiments.ts";

const applyBlur = (blur: number): void => {
  const value = `${blur}px`;
  document.documentElement.style.setProperty("--LiveBackgroundBlur", value);
  PageContainer?.style.setProperty("--LiveBackgroundBlur", value);
};

let started = false;

export function initLiveBackground(): void {
  if (started) return;
  started = true;
  const blur = $experimentSlider("liveBackground");
  applyBlur(blur.get());
  blur.listen(applyBlur);
}
