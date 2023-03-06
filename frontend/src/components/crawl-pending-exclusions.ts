import { property, state } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";

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
 */
@localized()
export class CrawlPendingExclusions extends LiteElement {
  @property({ type: Array })
  matchedURLs: URLs | null = null;

  @state()
  private page: number = 1;

  @state()
  private pageSize: number = 30;

  @state()
  private isOpen: boolean = false;

  private get total(): number {
    return this.matchedURLs?.length || 0;
  }

  private get pageResults(): URLs {
    if (!this.matchedURLs) return [];

    return this.matchedURLs.slice(
      (this.page - 1) * this.pageSize,
      this.page * this.pageSize
    );
  }

  render() {
    return html`
      <btrix-details
        ?open=${this.isOpen}
        @on-toggle=${(e: CustomEvent) => (this.isOpen = e.detail.open)}
      >
        <span slot="title">
          ${msg("Pending Exclusions")} ${this.renderBadge()}
        </span>
        <div
          slot="summary-description"
          @click=${(e: MouseEvent) => {
            // Prevent toggle when clicking pagination
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          ${this.isOpen && this.total && this.total > this.pageSize
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
            ? msg(str`+${this.total.toLocaleString()} URLs`)
            : msg(str`+1 URL`)
          : msg("No matches")}
      </btrix-badge>
    `;
  }

  private renderContent() {
    if (!this.total) {
      return html`<p class="px-5 text-sm text-neutral-400">
        ${this.matchedURLs
          ? msg("No matching URLs found in queue.")
          : msg(
              "Start typing an exclusion to view matching URLs in the queue."
            )}
      </p>`;
    }

    return html`
      <btrix-numbered-list
        class="text-xs break-all"
        .items=${this.pageResults.map((url, idx) => ({
          order: idx + 1 + (this.page - 1) * this.pageSize,
          content: html`<a
            href=${url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            >${url}</a
          >`,
        }))}
        aria-live="polite"
        style="--link-color: var(--sl-color-danger-600); --link-hover-color: var(--sl-color-danger-400);"
      ></btrix-numbered-list>
    `;
  }
}
