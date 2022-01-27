import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

type Crawl = {
  id: string;
}; // TODO

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
        <div class="col-span-5 flex justify-between">
          <div><sl-button>${msg("New Crawl")}</sl-button></div>
          <div>[Sort by]</div>
        </div>

        <div class="col-span-1">[Filters]</div>

        <div class="col-span-4 grid gap-5">
          <section>
            <h2>${msg("Running Crawls")}</h2>
            <div>
              <ul>
                ${this.runningCrawls.map((crawl) => html`<li>${crawl.id}</li>`)}
              </ul>
            </div>
          </section>

          <section>
            <h2>${msg("Finished Crawls")}</h2>
            <div>
              <ul>
                ${this.finishedCrawls.map(
                  (crawl) => html`<li>${crawl.id}</li>`
                )}
              </ul>
            </div>
          </section>
        </div>
      </main>
      <footer>${this.lastFetched}</footer>
    `;
  }

  private async getCrawls(): Promise<{ running: Crawl[]; finished: Crawl[] }> {
    const data = await this.apiFetch(
      `/archives/${this.archiveId}/crawls`,
      this.authState!
    );

    this.lastFetched = Date.now();

    return data;
  }
}

customElements.define("btrix-crawls-list", CrawlsList);
