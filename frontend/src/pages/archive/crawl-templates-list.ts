import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

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
    return html`
      <div class="text-center"></div>

      <div class="grid grid-cols-3 gap-4 mb-4">
        <div
          class="col-span-1 border rounded p-4"
          @click=${() =>
            this.navTo(`/archives/${this.archiveId}/crawl-templates/new`)}
          role="button"
        >
          <sl-icon name="plus-square-dotted"></sl-icon> ${msg(
            "Create new crawl template"
          )}
        </div>
      </div>

      <div class="grid grid-cols-3 gap-4">
        ${this.crawlTemplates?.map(
          (t) =>
            html`<div
              class="col-span-1 border rounded shadow hover:shadow-sm p-4"
              role="button"
              aria-label=${t.name}
            >
              <div
                class="font-medium overflow-hidden whitespace-nowrap truncate mb-1"
                title=${t.name}
              >
                ${t.name || "?"}
              </div>
              <div class="grid gap-1 text-sm">
                <div>
                  ${t.config.seeds.length === 1
                    ? msg(str`${t.config.seeds.length} seed URL`)
                    : msg(str`${t.config.seeds.length} seed URLs`)}
                </div>
                <div>
                  ${t.crawlCount === 1
                    ? msg(str`${t.crawlCount} crawl`)
                    : msg(str`${t.crawlCount || 0} crawls`)}
                </div>
                <div class="flex justify-between">
                  <span
                    >${t.schedule
                      ? msg("Scheduled crawls")
                      : msg("No schedule")}</span
                  >
                  <sl-button size="small">${msg("Run now")}</sl-button>
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
