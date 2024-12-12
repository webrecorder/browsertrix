/**
 * @TODO Import from replaywebpage once https://github.com/webrecorder/replayweb.page/issues/376 is addressed
 *
 * @attr {String} source
 * @attr {String} coll
 * @attr {String} config
 * @attr {String} replayBase
 * @attr {String} noSandbox
 * @attr {String} noCache
 * @attr {String} url
 * @attr {String} ts}
 *
 * @fires rwp-url-change
 * @fires rwp-page-loading
 */
class ReplayWebPage extends HTMLElement {
  fullReload(): void {}
}

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
