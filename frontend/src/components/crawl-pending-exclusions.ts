import { property, state } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";
import type { AuthState } from "../utils/AuthService";

type URLs = string[];

type ResponseData = {
  total: number;
  matched: URLs;
};

/**
 * Show pending exclusions in crawl queue
 *
 * Usage example:
 * ```ts
 * <btrix-crawl-pending-exclusions
 *   archiveId=${this.crawl.aid}
 *   crawlId=${this.crawl.id}
 *   .authState=${this.authState}
 *   regex=${this.regex}
 * ></btrix-crawl-pending-exclusions>
 * ```
 */
@localized()
export class CrawlPendingExclusions extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  crawlId?: string;

  @property({ type: String })
  regex: string = "";

  @state()
  private results: URLs = [];

  @state()
  private isLoading = false;

  @state()
  private page: number = 1;

  @state()
  private pageSize: number = 30;

  @state()
  private total?: number;

  @state()
  private isOpen: boolean = false;

  private get pageResults(): URLs {
    return this.results.slice(
      (this.page - 1) * this.pageSize,
      this.page * this.pageSize
    );
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("authState") ||
      changedProperties.has("archiveId") ||
      changedProperties.has("crawlId") ||
      changedProperties.has("regex")
    ) {
      this.fetchQueueMatches();
    }
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
        <div slot="summary-description">
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
    if (!this.regex) return "";

    let content = msg("No matches");
    let className = "";

    if (this.total) {
      if (this.total > 1) {
        content = msg(str`${this.total.toLocaleString()} URLs`);
      } else {
        content = msg(str`1 URL`);
      }

      if (this.isLoading) {
        className = "opacity-80";
      }
    } else {
      if (this.isLoading) {
        className = "opacity-0";
      }
    }

    return html`
      <btrix-badge
        type=${this.total ? "danger" : "neutral"}
        class="ml-1 transition-opacity ${className}"
      >
        ${content}
      </btrix-badge>
    `;
  }

  private renderContent() {
    if (!this.total) {
      if (this.isLoading) {
        return html`
          <div class="flex items-center justify-center my-9 text-xl">
            <sl-spinner></sl-spinner>
          </div>
        `;
      }

      return html`<p class="px-5 text-sm text-neutral-400">
        ${this.regex
          ? msg("No matching URLs found in queue.")
          : msg(
              "Start typing an exclusion to view matching URLs in the queue."
            )}
      </p>`;
    }

    return html`
      <btrix-numbered-list
        class="text-xs break-all transition-opacity${this.isLoading
          ? " opacity-60"
          : ""}"
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

  private async fetchQueueMatches() {
    if (!this.regex) {
      this.total = 0;
      this.results = [];
      return;
    }

    this.isLoading = true;

    try {
      const { matched } = await this.getQueueMatches();

      this.total = matched.length;
      this.results = matched;
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't fetch pending exclusions at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isLoading = false;
  }

  private async getQueueMatches(): Promise<ResponseData> {
    const data: ResponseData = await this.apiFetch(
      `/archives/${this.archiveId}/crawls/${this.crawlId}/queueMatchAll?regex=${this.regex}`,
      this.authState!
    );

    return data;
  }
}
