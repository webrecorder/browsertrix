import type { Embed as ReplayWebPage } from "replaywebpage";

type RwpUrlChangeEvent = CustomEvent<{
  type: "urlchange";
  view: "pages" | "replay";
  replayNotFoundError: boolean;
  title?: string;
  ts?: string;
  url?: string;
}>;

declare global {
  interface HTMLElementTagNameMap {
    "replay-web-page": ReplayWebPage;
  }
}
