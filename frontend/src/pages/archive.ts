import { LiteElement, html } from "../utils";

export class Archive extends LiteElement {
  aid?: string;
  tab?: string;

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
    const tab = this.tab || "running";
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
              .archive=${this}
            ></btrix-archive-configs>`
          : ""}
      </div>
    `;
  }
}
