import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { CrawlTemplate } from "./types";

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

  @state()
  private serverError?: string;

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
      <div class="text-center">
        <sl-button
          @click=${() =>
            this.navTo(`/archives/${this.archiveId}/crawl-templates/new`)}
        >
          <sl-icon slot="prefix" name="plus-square-dotted"></sl-icon>
          ${msg("Create new crawl template")}
        </sl-button>
      </div>

      <div>
        ${this.crawlTemplates?.map(
          (template) => html`<div>${template.id}</div>`
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
