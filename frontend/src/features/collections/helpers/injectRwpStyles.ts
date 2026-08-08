import type { ReplayWebPage } from "replaywebpage";

import replayStylesheet from "../styles/replay.stylesheet.css";

export function injectRwpStyles(replayEmbed: ReplayWebPage | null | undefined) {
  if (!replayEmbed) {
    console.debug("no replayEmbed");
    return;
  }

  const iframeDoc =
    replayEmbed.shadowRoot?.querySelector("iframe")?.contentDocument;

  if (iframeDoc) {
    const style = iframeDoc.createElement("style");
    style.textContent = replayStylesheet;
    iframeDoc.head.appendChild(style);
  }
}
