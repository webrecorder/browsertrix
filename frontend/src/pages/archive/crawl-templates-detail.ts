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

      ${this.crawlTemplate.currCrawlId
        ? html`
            <a
              class="flex items-center justify-between my-5 px-3 py-2 border rounded-lg bg-purple-50 border-purple-200 hover:border-purple-500 shadow shadow-purple-200 text-purple-800 transition-colors"
              href=${`/archives/${this.archiveId}/crawls/${this.crawlTemplate.currCrawlId}`}
              @click=${this.navLink}
            >
              <span>${msg("View currently running crawl")}</span>
              <sl-icon name="arrow-right"></sl-icon>
            </a>
          `
        : ""}

      <main class="border rounded-lg">
        <section class="p-4  border-b text-sm">
          <dl class="grid grid-cols-2">
            <div>
              <dt class="text-xs text-0-600">${msg("Created by")}</dt>
              <dd>${this.crawlTemplate.user}</dd>
            </div>
          </dl>

          <!-- TODO created at? -->
        </section>

        <section class="md:grid grid-cols-4">
          <div class="col-span-1 p-4 md:p-8 md:border-b">
            <h3 class="font-medium">${msg("Configuration")}</h3>
          </div>
          <div class="col-span-3 p-4 md:p-8 border-b grid gap-5">
            <div role="table">
              <div class="grid grid-cols-3" role="row">
                <span class="text-sm text-0-600" role="columnheader"
                  >${msg("Seed URL")}</span
                >
                <span class="text-sm text-0-600" role="columnheader"
                  >${msg("Scope Type")}</span
                >
                <span class="text-sm text-0-600" role="columnheader"
                  >${msg("Page Limit")}</span
                >
              </div>
              <ul role="rowgroup">
                ${this.crawlTemplate.config.seeds
                  .slice(0, this.showAllSeedURLs ? undefined : SEED_URLS_MAX)
                  .map(
                    (seed) =>
                      html`<li
                        class="grid grid-cols-3 items-baseline"
                        role="row"
                      >
                        <span role="cell">${seed.url}</span>
                        <span class="uppercase text-0-500 text-xs" role="cell"
                          >${seed.scopeType ||
                          this.crawlTemplate?.config.scopeType}</span
                        >
                        <span
                          class="uppercase text-0-500 text-xs font-mono"
                          role="cell"
                          >${seed.limit ||
                          this.crawlTemplate?.config.limit}</span
                        >
                      </li>`
                  )}
              </ul>

              ${this.crawlTemplate.config.seeds.length > SEED_URLS_MAX
                ? html`<sl-button
                    class="mt-2"
                    type="neutral"
                    size="small"
                    @click=${() =>
                      (this.showAllSeedURLs = !this.showAllSeedURLs)}
                  >
                    <span class="text-sm">
                      ${this.showAllSeedURLs
                        ? msg("Show less")
                        : msg(str`Show
                    ${this.crawlTemplate.config.seeds.length - SEED_URLS_MAX}
                    more`)}
                    </span>
                  </sl-button>`
                : ""}
            </div>
          </div>
        </section>

        <section class="md:grid grid-cols-4">
          <div class="col-span-1 p-4 md:p-8 md:border-b">
            <h3 class="font-medium">${msg("Schedule")}</h3>
          </div>
          <div class="col-span-3 p-4 md:p-8 border-b grid gap-5">
            <dl class="grid gap-5">
              <div>
                <dt class="text-sm text-0-600">${msg("Schedule")}</dt>
                <dd>
                  ${this.crawlTemplate.schedule ||
                  html`<span class="text-0-400">${msg("None")}</span>`}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section class="md:grid grid-cols-4">
          <div class="col-span-1 p-4 md:p-8">
            <h3 class="font-medium">${msg("Crawls")}</h3>
          </div>
          <div class="col-span-3 p-4 md:p-8 grid gap-5">
            <dl class="grid gap-5">
              <div>
                <dt class="text-sm text-0-600">${msg("# of Crawls")}</dt>
                <dd class="font-mono">
                  ${(this.crawlTemplate.crawlCount || 0).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-0-600">
                  ${msg("Currently Running Crawl")}
                </dt>
                <dd
                  class="flex items-center justify-between border rounded p-1 mt-1"
                >
                  ${this.crawlTemplate.currCrawlId
                    ? html`<a
                        class="text-primary font-medium hover:underline text-sm p-1"
                        href=${`/archives/${this.archiveId}/crawls/${this.crawlTemplate.currCrawlId}`}
                        @click=${this.navLink}
                        >${msg("View crawl")}</a
                      >`
                    : html`<span class="text-0-400 text-sm p-1"
                        >${msg("None")}</span
                      >`}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-0-600">${msg("Latest Crawl")}</dt>
                <dd
                  class="flex items-center justify-between border rounded p-1 mt-1"
                >
                  ${this.crawlTemplate.lastCrawlId
                    ? html`<a
                          class="text-primary font-medium hover:underline text-sm p-1"
                          href=${`/archives/${this.archiveId}/crawls/${this.crawlTemplate.lastCrawlId}`}
                          @click=${this.navLink}
                          >${msg("View crawl")}</a
                        >
                        <sl-format-date
                          date=${
                            `${this.crawlTemplate.lastCrawlTime}Z` /** Z for UTC */
                          }
                          month="2-digit"
                          day="2-digit"
                          year="2-digit"
                          hour="numeric"
                          minute="numeric"
                          time-zone-name="short"
                        ></sl-format-date>`
                    : html`<span class="text-0-400 text-sm p-1"
                        >${msg("None")}</span
                      >`}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </main>
    `;
  }

  async getCrawlTemplate(): Promise<CrawlTemplate> {
    const data: CrawlTemplate = await this.apiFetch(
      `/archives/${this.archiveId}/crawlconfigs/${this.crawlConfigId}`,
      this.authState!
    );

    const { config, ...template } = data;

    return {
      ...template,
      config: {
        ...config,
        // Normalize seed format
        seeds: config.seeds.map((seed) =>
          typeof seed === "string"
            ? {
                url: seed,
              }
            : seed
        ),
      },
    };
  }
}

customElements.define("btrix-crawl-templates-detail", CrawlTemplatesDetail);
