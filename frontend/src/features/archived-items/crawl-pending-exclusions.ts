import { localized, msg, str } from "@lit/localize";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { type PageChangeEvent } from "@/components/ui/pagination";

type URLs = string[];

/**
 * Show pending exclusions in crawl queue
 *
 * Usage example:
 * ```ts
 * <btrix-crawl-pending-exclusions
 *   .matchedURLs=${this.matchedURLs}
 * ></btrix-crawl-pending-exclusions>
 * ```
 *
 * @cssPart heading
 */
@customElement("btrix-crawl-pending-exclusions")
@localized()
export class CrawlPendingExclusions extends BtrixElement {
  @property({ type: Array })
  matchedURLs: URLs | null = null;

  @property({ type: Boolean })
  loading?: boolean;

  @property({ type: String })
  errorMessage?: string;

  @state()
  private page = 1;

  private get pageSize() {
    return 10;
  }

  private get total(): number {
    return this.matchedURLs?.length || 0;
  }

  private get pageResults(): URLs {
    if (!this.matchedURLs) return [];

    return this.matchedURLs.slice(
      (this.page - 1) * this.pageSize,
      this.page * this.pageSize,
    );
  }

  render() {
    return html`
      <btrix-details
        class="[--margin-bottom:--sl-spacing-small]"
        exportparts="summary:heading"
        open
      >
        <div slot="title">
          ${msg("Pending Exclusions")} ${this.renderBadge()}
        </div>
        ${this.total && this.total > this.pageSize
          ? html`<btrix-pagination
              slot="summary-description"
              page=${this.page}
              size=${this.pageSize}
              totalCount=${this.total}
              compact
              disablePersist
              @page-change=${(e: PageChangeEvent) => {
                this.page = e.detail.page;
              }}
            >
            </btrix-pagination>`
          : ""}
        ${this.renderContent()}
      </btrix-details>
    `;
  }

  private renderBadge() {
    if (!this.matchedURLs) return "";

    return html`
      <btrix-badge variant=${this.total ? "danger" : "neutral"} class="ml-1">
        ${this.total
          ? this.total > 1
            ? msg(str`+${this.localize.number(this.total)} URLs`)
            : msg(str`+1 URL`)
          : msg("No matches")}
      </btrix-badge>
    `;
  }

  private renderContent() {
    if (this.errorMessage) {
      return html`<p class="pb-5 text-danger">${this.errorMessage}</p>`;
    }

    if (!this.loading && !this.total) {
      return html`<p class="pb-5 text-neutral-400">
        ${this.matchedURLs
          ? msg("No matching URLs found in queue.")
          : msg(
              "Start typing an exclusion to view matching URLs in the queue.",
            )}
      </p>`;
    }

    return html`
      <btrix-url-list
        .urls=${this.pageResults}
        offset=${1 + (this.page - 1) * this.pageSize}
        aria-live="polite"
        ordered
        border
        highlight
      ></btrix-url-list>
    `;
  }
}
