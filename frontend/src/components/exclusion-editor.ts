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
 *   archiveId=${this.crawl.aid}
 *   crawlId=${this.crawl.id}
 *   .config=${this.crawlTemplate.config}
 *   .authState=${this.authState}
 *   ?isActiveCrawl=${isActive}
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
  isActiveCrawl = false;

  @state()
  private pendingURLs: string[] = [];

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
      ${this.renderTable()}
      ${this.isActiveCrawl
        ? html`
            <section class="mt-5">${this.renderPending()}</section>

            <section class="mt-5">${this.renderQueue()}</section>
          `
        : ""}
    `;
  }

  private renderTable() {
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
        ${this.isActiveCrawl
          ? html`<btrix-queue-exclusion-form @on-regex=${this.handleRegex}>
            </btrix-queue-exclusion-form>`
          : ""}
      </btrix-details>
    `;
  }

  private renderPending() {
    return html`<btrix-details open disabled>
      <h4 slot="title">${msg("Pending Exclusions")}</h4>

      <btrix-numbered-list
        class="text-xs break-all"
        .items=${this.pendingURLs.map((url, idx) => ({
          content: html`<a
            href=${url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            >${url}</a
          >`,
        }))}
        aria-live="polite"
      ></btrix-numbered-list>
    </btrix-details>`;
  }

  private renderQueue() {
    return html`<btrix-crawl-queue
      archiveId=${this.archiveId!}
      crawlId=${this.crawlId!}
      .authState=${this.authState}
    ></btrix-crawl-queue>`;
  }

  private handleRegex(e: CustomEvent) {
    console.log(e.detail);
  }
}
