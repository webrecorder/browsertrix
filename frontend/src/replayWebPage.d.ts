import { type LitElement } from "lit";
import { type TemplateResult } from "lit-html";

class ReplayWebPage extends LitElement {
  source: string;
  coll: string;
  config: string;
  replayBase: string;
  noSandbox: string;
  noCache: string;
  render(): TemplateResult<1>;
}

declare global {
  interface HTMLElementTagNameMap {
    "replay-web-page": ReplayWebPage;
  }
}
