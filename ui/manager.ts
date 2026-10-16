// Spicy Lyrics'' lyrics manager (the Local Lyrics DB: saved TTML per song, upload, download, delete), unchanged, in a
// popup. Entries live in this app''s own IndexedDB (nothing is sent anywhere).
import React from "react";
import ReactDOM from "react-dom/client";
import SLToaster from "./spicy/components/ReactComponents/SLToaster.tsx";
import { OpenLyricsDBPanel } from "./spicy/utils/openLyricsDBPanel.tsx";

let toaster = false;

export function openLyricsManager(): void {
  if (!toaster) {
    toaster = true;
    const div = document.createElement("div");
    div.classList.add("sltoaster");
    ReactDOM.createRoot(div).render(React.createElement(SLToaster));
    document.body.appendChild(div);
  }
  OpenLyricsDBPanel();
}
