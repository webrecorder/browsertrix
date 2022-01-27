import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

type Crawl = {
  id: string;
  user: string;
  aid: string;
  cid: string;
  schedule: string;
  manual: boolean;
  started: string; // UTC ISO date
  finished: string; // UTC ISO date
  state: string;
  scale: number;
  completions: number;
  stats: null;
  files: { filename: string; hash: string; size: number }[];
};

/**
 * Usage:
 * ```ts
 * <btrix-crawls-list></btrix-crawls-list>
 * ```
 */
@localized()
export class CrawlsList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @state()
  private lastFetched?: number;

  @state()
  private runningCrawls?: Crawl[];

  @state()
  private finishedCrawls?: Crawl[];

  async firstUpdated() {
    try {
      const { running, finished } = await this.getCrawls();

      this.runningCrawls = running;
      this.finishedCrawls = finished;
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawls at this time."),
        type: "danger",
        icon: "exclamation-octagon",
        duration: 10000,
      });
    }
  }

  render() {
    if (!this.runningCrawls || !this.finishedCrawls) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-4xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    return html`
      <main class="md:grid grid-cols-5 gap-5">
        <header class="col-span-5 flex justify-between">
          <div><sl-button>${msg("New Crawl")}</sl-button></div>
          <div>[Sort by]</div>
        </header>

        <section class="col-span-1">[Filters]</section>

        <section class="col-span-4 grid gap-5">
          <ul class="border rounded">
            ${this.runningCrawls.map(this.renderCrawlItem)}
            ${this.finishedCrawls.map(this.renderCrawlItem)}
          </ul>
        </section>
      </main>
      <footer>${this.lastFetched}</footer>
    `;
  }

  private renderCrawlItem = (crawl: Crawl, idx: number) => {
    return html`<li class="grid grid-cols-8${idx ? " border-t" : ""}">
      <div>
        <div class="font-medium whitespace-nowrap truncate">${crawl.id}</div>
        <div class="text-0-500 whitespace-nowrap truncate">
          <a
            href=${`/archives/${crawl.aid}/crawl-templates/${crawl.cid}`}
            @click=${this.navLink}
            >${crawl.cid}</a
          >
        </div>
      </div>
      <div>[start, end]</div>
      <div>[state]</div>
      <div>[manual start]</div>
    </li>`;
  };

  private async getCrawls(): Promise<{ running: Crawl[]; finished: Crawl[] }> {
    // TODO remove mock
    return import("../../__mocks__/api/archives/[id]/crawls").then(
      (module) => module.default
    );

    // const data = await this.apiFetch(
    //   `/archives/${this.archiveId}/crawls`,
    //   this.authState!
    // );

    // this.lastFetched = Date.now();

    // return data;
  }
}

customElements.define("btrix-crawls-list", CrawlsList);
