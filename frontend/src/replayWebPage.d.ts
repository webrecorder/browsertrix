/**
 * @attr {String} source
 * @attr {String} coll
 * @attr {String} config
 * @attr {String} replayBase
 * @attr {String} noSandbox
 * @attr {String} noCache
 */
class ReplayWebPage {}

declare global {
  interface HTMLElementTagNameMap {
    "replay-web-page": ReplayWebPage;
  }
}
