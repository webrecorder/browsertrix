import type { Embed as ReplayWebPage } from "replaywebpage";

declare global {
  interface HTMLElementTagNameMap {
    "replay-web-page": ReplayWebPage;
  }
}
