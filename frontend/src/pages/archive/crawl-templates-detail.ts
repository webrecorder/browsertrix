import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { CrawlTemplate } from "./types";

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
  crawlTemplate?: CrawlTemplate;

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
        <section class="p-4 md:p-8 border-b">
          <dl>
            <div>
              <dt class="text-sm text-0-500">${msg("Seed URLs")}</dt>
              <dd>${this.crawlTemplate.config.seeds}</dd>
            </div>
            <div>
              <dt class="text-sm text-0-500">${msg("Schedule")}</dt>
              <dd>${this.crawlTemplate.schedule}</dd>
            </div>
          </dl>
        </section>

        <div class="md:grid grid-cols-4">
          <div class="col-span-1 p-4 md:p-8 md:border-b">
            <h3 class="font-medium">${msg("Crawls")}</h3>
          </div>
          <section class="col-span-3 p-4 md:p-8 border-b grid gap-5">
            TODO list
          </section>
        </div>
      </main>
    `;
  }

  async getCrawlTemplate(): Promise<CrawlTemplate> {
    const data = await this.apiFetch(
      `/archives/${this.archiveId}/crawlconfigs/${this.crawlConfigId}`,
      this.authState!
    );

    // TODO replace mock data
    return {
      id: this.crawlConfigId,
      name: "PLACEHOLDER",
      schedule: "PLACEHOLDER",
      user: "PLACEHOLDER",
      crawlCount: 1,
      lastCrawlId: "PLACEHOLDER",
      lastCrawlTime: "PLACEHOLDER",
      currCrawlId: "PLACEHOLDER",
      config: {
        seeds: ["https://example.com"],
      },
    };

    // return data
  }
}

customElements.define("btrix-crawl-templates-detail", CrawlTemplatesDetail);
