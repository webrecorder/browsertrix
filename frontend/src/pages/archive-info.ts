import LiteElement, { html } from "../utils/LiteElement";
import type { Archive } from "../utils/archives";
import type { AuthState } from "../utils/auth";

export class ArchivePage extends LiteElement {
  authState: AuthState = null;
  aid?: Archive["aid"];
  // TODO common tab type
  tab: "running" | "finished" | "configs" = "running";

  static get properties() {
    return {
      authState: { type: Object },
      aid: { type: String },
      tab: { type: String },
      viewState: { type: Object },
    };
  }

  render() {
    const aid = this.aid;
    const tab = this.tab;
    return html`
      <div
        class="container bg-base-200 m-auto border shadow-xl rounded-lg px-8 py-8"
      >
        <div class="tabs tabs-boxed">
          <a
            href="/archive/${aid}/running"
            class="tab ${tab === "running" ? "tab-active" : ""}"
            @click="${this.navLink}"
            >Crawls Running</a
          >
          <a
            href="/archive/${aid}/finished"
            class="tab ${tab === "finished" ? "tab-active" : ""}"
            @click="${this.navLink}"
            >Finished</a
          >
          <a
            href="/archive/${aid}/configs"
            class="tab ${tab === "configs" ? "tab-active" : ""}"
            @click="${this.navLink}"
            >Crawl Configs</a
          >
        </div>
        ${tab === "configs"
          ? html`<btrix-archive-configs
              .archive=${{
                aid: this.aid!,
                authState: this.authState,
              }}
            ></btrix-archive-configs>`
          : ""}
      </div>
    `;
  }
}
