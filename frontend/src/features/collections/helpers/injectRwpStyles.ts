import type { ReplayWebPage } from "replaywebpage";

import replayStylesheet from "../styles/replay.stylesheet.css";

export function injectRwpStyles(replayEmbed: ReplayWebPage | null | undefined) {
  if (!replayEmbed) {
    console.debug("no replayEmbed");
    return;
  }

  const iframe = replayEmbed.shadowRoot?.querySelector("iframe");

  if (!iframe) {
    console.debug("no replayEmbed iframe");
    return;
  }

  const appendStyles = () => {
    const iframeDoc =
      replayEmbed.shadowRoot?.querySelector("iframe")?.contentDocument;

    if (!iframeDoc) {
      console.debug("no iframeDoc");
      return;
    }

    const style = iframeDoc.createElement("style");
    style.textContent = replayStylesheet;
    iframeDoc.body.appendChild(style);
  };

  // TODO Refactor how styles are injected
  // https://github.com/webrecorder/replayweb.page/issues/553
  const injectStyles = () => {
    appendStyles();

    iframe.contentWindow?.addEventListener(
      "beforeunload",
      () => {
        iframe.addEventListener(
          "load",
          () => {
            injectStyles();
          },
          { once: true },
        );
      },
      { once: true },
    );
  };

  injectStyles();
}
