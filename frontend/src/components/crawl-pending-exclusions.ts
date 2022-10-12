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
  private total?: number;

  @state()
  private isLoading = false;

  updated(changedProperties: Map<string, any>) {
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
      <btrix-details>
        <span slot="title">
          ${msg("Pending Exclusions")}
          <span class="ml-1 inline-block rounded-sm px-1 text-xs ${
            this.total
              ? "bg-rose-500 text-white"
              : "bg-slate-200 text-slate-600"
          }">${msg(str`${this.total ? `+${this.total}` : "0"} URLs`)}</span>
        </span>
        </div>
        ${this.renderContent()}
      </btrix-details>
    `;
  }

  private renderContent() {
    if (this.isLoading) {
      return html`
        <div class="flex items-center justify-center text-3xl">
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    if (!this.total) {
      return html`<p class="text-sm text-neutral-400">
        ${msg("No pending exclusions.")}
      </p>`;
    }

    return html`
      <btrix-numbered-list
        class="text-xs break-all transition-opacity${this.isLoading
          ? " opacity-60"
          : ""}"
        .items=${this.results.map((url, idx) => ({
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
  }

  private async getQueueMatches(): Promise<ResponseData> {
    const data: ResponseData = await this.apiFetch(
      `/archives/${this.archiveId}/crawls/${this.crawlId}/queueMatchAll?regex=${this.regex}`,
      this.authState!
    );

    return data;
  }
}
