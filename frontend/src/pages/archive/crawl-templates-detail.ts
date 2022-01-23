import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { CrawlTemplate } from "./types";

const SEED_URLS_MAX = 3;

/**
 * Usage:
 * ```ts
 * <btrix-crawl-templates-detail></btrix-crawl-templates-detail>
 * ```
 */
@localized()
export class CrawlTemplatesDetail extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: String })
  crawlConfigId!: string;

  @state()
  private crawlTemplate?: CrawlTemplate;

  @state()
  private showAllSeedURLs: boolean = false;

  async firstUpdated() {
    try {
      this.crawlTemplate = await this.getCrawlTemplate();
    } catch {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl template at this time."),
        type: "danger",
        icon: "exclamation-octagon",
        duration: 10000,
      });
    }
  }

  render() {
    if (!this.crawlTemplate) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-4xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    return html`
      <h2 class="text-xl font-bold mb-3">${this.crawlTemplate.name}</h2>

      <main class="border rounded-lg">
        <section class="md:grid grid-cols-3">
          <div class="col-span-1 p-4 md:p-8 md:border-b">
            <h3 class="font-medium">${msg("Configuration")}</h3>
          </div>
          <div class="col-span-2 p-4 md:p-8 border-b grid gap-5">
            <dl class="grid gap-5">
              <div>
                <dt class="text-sm text-0-600">${msg("Seed URLs")}</dt>
                <dd>
                  <ul>
                    ${this.crawlTemplate.config.seeds
                      .slice(
                        0,
                        this.showAllSeedURLs ? undefined : SEED_URLS_MAX
                      )
                      .map((seed) => html`<li>${seed}</li>`)}
                  </ul>

                  ${this.crawlTemplate.config.seeds.length > SEED_URLS_MAX
                    ? html`<div
                        class="inline-block font-medium text-primary text-sm mt-1"
                        role="button"
                        @click=${() =>
                          (this.showAllSeedURLs = !this.showAllSeedURLs)}
                      >
                        ${this.showAllSeedURLs
                          ? msg("Show less")
                          : msg(str`Show
                    ${this.crawlTemplate.config.seeds.length - SEED_URLS_MAX}
                    more`)}
                      </div>`
                    : ""}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-0-600">${msg("Scope type")}</dt>
                <dd>${this.crawlTemplate.config.scopeType}</dd>
              </div>
              <div>
                <dt class="text-sm text-0-600">${msg("Page limit")}</dt>
                <dd>${this.crawlTemplate.config.limit}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section class="md:grid grid-cols-3">
          <div class="col-span-1 p-4 md:p-8 md:border-b">
            <h3 class="font-medium">${msg("Schedule")}</h3>
          </div>
          <div class="col-span-2 p-4 md:p-8 border-b grid gap-5">
            <dl class="grid gap-5">
              <div>
                <dt class="text-sm text-0-600">${msg("Schedule")}</dt>
                <dd>${this.crawlTemplate.schedule}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section class="md:grid grid-cols-3">
          <div class="col-span-1 p-4 md:p-8 md:border-b">
            <h3 class="font-medium">${msg("Crawls")}</h3>
          </div>
          <div class="col-span-2 p-4 md:p-8 border-b grid gap-5">
            <dl class="grid gap-5">
              <div>
                <dt class="text-sm text-0-600">${msg("Last Crawl Time")}</dt>
                <dd>${this.crawlTemplate.lastCrawlTime}</dd>
              </div>
              <div>
                <dt class="text-sm text-0-600">${msg("Last Crawl ID")}</dt>
                <dd>${this.crawlTemplate.lastCrawlId}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section class="p-4 md:p-8 border-b">
          <dl class="grid grid-cols-2">
            <div>
              <dt class="text-sm text-0-600">${msg("Created by")}</dt>
              <dd>${this.crawlTemplate.user}</dd>
            </div>
          </dl>
        </section>
      </main>
    `;
  }

  async getCrawlTemplate(): Promise<CrawlTemplate> {
    const data = await this.apiFetch(
      `/archives/${this.archiveId}/crawlconfigs/${this.crawlConfigId}`,
      this.authState!
    );

    console.log(data);
    return data;
  }
}

customElements.define("btrix-crawl-templates-detail", CrawlTemplatesDetail);
