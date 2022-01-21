import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import cronParser from "cron-parser";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { CrawlConfig } from "./types";

type CrawlTemplate = {
  id: string;
  name: string;
  schedule: string;
  user: string;
  crawlCount: number;
  lastCrawlId: string;
  lastCrawlTime: string;
  config: CrawlConfig;
};

/**
 * Usage:
 * ```ts
 * <btrix-crawl-templates-list></btrix-crawl-templates-list>
 * ```
 */
@localized()
export class CrawlTemplatesList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @state()
  crawlTemplates?: CrawlTemplate[];

  private get timeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  async firstUpdated() {
    try {
      this.crawlTemplates = await this.getCrawlTemplates();
      if (!this.crawlTemplates.length) {
        this.navTo(`/archives/${this.archiveId}/crawl-templates/new`);
      }
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl templates at this time."),
        type: "danger",
        icon: "exclamation-octagon",
        duration: 10000,
      });
    }
  }

  render() {
    if (!this.crawlTemplates) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-4xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    return html`
      <div class="text-center"></div>

      <div
        class=${this.crawlTemplates.length
          ? "grid sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4"
          : "flex justify-center"}
      >
        <div
          class="col-span-1 bg-slate-50 border border-dotted border-primary text-primary rounded px-6 py-4 flex items-center justify-center"
          @click=${() =>
            this.navTo(`/archives/${this.archiveId}/crawl-templates/new`)}
          role="button"
        >
          <sl-icon class="mr-2" name="plus-square-dotted"></sl-icon>
          <span
            class="mr-2 ${this.crawlTemplates.length
              ? "text-sm"
              : "font-medium"}"
            >${msg("Create New Crawl Template")}</span
          >
        </div>
      </div>

      <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        ${this.crawlTemplates.map(
          (t) =>
            html`<div
              class="col-span-1 border border-purple-100 hover:border-purple-300 rounded shadow hover:shadow-sm shadow-purple-200 transition-all p-4 text-sm"
              role="button"
              aria-label=${t.name}
            >
              <div
                class="font-medium whitespace-nowrap truncate mb-1"
                title=${t.name}
              >
                ${t.name || "?"}
              </div>
              <div class="flex justify-between items-end">
                <div class="grid gap-1 text-xs">
                  <div
                    class="font-mono whitespace-nowrap truncate text-gray-500"
                    title=${t.config.seeds.join(", ")}
                  >
                    ${t.config.seeds.join(", ")}
                  </div>
                  <div class="font-mono text-purple-500">
                    ${t.crawlCount === 1
                      ? msg(str`${t.crawlCount} crawl`)
                      : msg(
                          str`${(t.crawlCount || 0).toLocaleString()} crawls`
                        )}
                  </div>
                  <div class="text-gray-500">
                    ${t.schedule
                      ? msg(html`Next run:
                          <span
                            ><sl-format-date
                              date="${cronParser
                                .parseExpression(t.schedule, {
                                  utc: true,
                                })
                                .next()
                                .toString()}"
                              month="2-digit"
                              day="2-digit"
                              year="2-digit"
                              hour="numeric"
                              time-zone=${this.timeZone}
                            ></sl-format-date
                          ></span>`)
                      : html`<span class="text-gray-400"
                          >${msg("No schedule")}</span
                        >`}
                  </div>
                </div>
                <div>
                  <button
                    class="text-xs border rounded-sm px-2 py-1 border-purple-200 hover:border-purple-500 text-purple-600 transition-colors"
                  >
                    ${msg("Run now")}
                  </button>
                </div>
              </div>
            </div>`
        )}
      </div>
    `;
  }

  private async getCrawlTemplates(): Promise<CrawlTemplate[]> {
    const data = await this.apiFetch(
      `/archives/${this.archiveId}/crawlconfigs`,
      this.authState!
    );

    return data.crawl_configs;
  }
}

customElements.define("btrix-crawl-templates-list", CrawlTemplatesList);
