import { property, state } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { CrawlConfig } from "../pages/archive/types";
import LiteElement, { html } from "../utils/LiteElement";
import type { AuthState } from "../utils/AuthService";

/**
 * Crawl queue exclusion editor
 *
 * Usage example:
 * ```ts
 * <btrix-exclusion-editor
 *   .exclude=${this.crawlTemplate?.config?.exclude}
 *   ?readOnly=${!isActiveCrawl}
 * >
 * </btrix-exclusion-editor>
 * ```
 */
@localized()
export class ExclusionEditor extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  crawlId?: string;

  @property({ type: Array })
  config?: CrawlConfig;

  @property({ type: Boolean })
  readOnly = false;

  @state()
  private results: CrawlConfig["exclude"] = [];

  @state()
  private page: number = 1;

  @state()
  private pageSize: number = 5;

  @state()
  private total?: number;

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("config") && this.config?.exclude) {
      this.total = this.config.exclude.length;
      this.updatePageResults();
    } else if (changedProperties.has("page")) {
      this.updatePageResults();
    }
  }

  private updatePageResults() {
    if (!this.config?.exclude) return;

    this.results = this.config.exclude.slice(
      (this.page - 1) * this.pageSize,
      this.page * this.pageSize
    );
  }

  render() {
    return html`
      <btrix-details open disabled>
        <h4 slot="title">${msg("Exclusion Table")}</h4>
        <div slot="summary-description">
          ${this.total && this.total > this.pageSize
            ? html`<btrix-pagination
                size=${this.pageSize}
                totalCount=${this.total}
                @page-change=${(e: CustomEvent) => {
                  this.page = e.detail.page;
                }}
              >
              </btrix-pagination>`
            : ""}
        </div>

        ${this.config
          ? html`<btrix-queue-exclusion-table .exclude=${this.results}>
            </btrix-queue-exclusion-table>`
          : html`
              <div class="flex items-center justify-center my-9 text-xl">
                <sl-spinner></sl-spinner>
              </div>
            `}
        ${!this.readOnly
          ? html`<btrix-queue-exclusion-form> </btrix-queue-exclusion-form>`
          : ""}
      </btrix-details>
    `;
  }
}
