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
 */
class ReplayWebPage {
  fullReload(): void {}
}

declare global {
  interface HTMLElementTagNameMap {
    "replay-web-page": ReplayWebPage;
  }
}
