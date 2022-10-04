import { property, state } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";
import type { AuthState } from "../utils/AuthService";

type Pages = string[];
type ResponseData = {
  total: number;
  results: Pages;
  matched: Pages;
};

const POLL_INTERVAL_SECONDS = 5;

/**
 * Show real-time crawl queue results
 *
 * Usage example:
 * ```ts
 * <btrix-crawl-queue
 *   archiveId=${this.crawl.aid}
 *   crawlId=${this.crawl.id}
 *   .authState=${this.authState}
 * ></btrix-crawl-queue>
 * ```
 */
@localized()
export class CrawlQueue extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  crawlId?: string;

  @state()
  private results: Pages = [];

  @state()
  private isLoading = false;

  @state()
  private page: number = 1;

  @state()
  private pageSize: number = 30;

  @state()
  private total?: number;

  private timerId?: number;

  disconnectedCallback() {
    window.clearInterval(this.timerId);
    super.disconnectedCallback();
  }

  updated(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("authState") ||
      changedProperties.has("archiveId") ||
      changedProperties.has("crawlId") ||
      changedProperties.has("page")
    ) {
      this.fetchOnUpdate();
    }
  }

  render() {
    if (!this.total) {
      if (this.isLoading) {
        return html`
          <div class="flex items-center justify-center text-3xl">
            <sl-spinner></sl-spinner>
          </div>
        `;
      }

      return html`
        <p class="text-sm text-neutral-400">${msg("No pages queued.")}</p>
      `;
    }

    return html`
      <header class="flex items-center justify-end">
        <span class="text-neutral-500" aria-live="polite">
          ${msg(str`${this.total.toLocaleString()} URLs in queue`)}
        </span>
        <btrix-pagination
          size=${this.pageSize}
          totalCount=${this.total}
          @page-change=${(e: CustomEvent) => {
            this.page = e.detail.page;
          }}
        >
        </btrix-pagination>
      </header>

      <btrix-numbered-list
        class="text-xs break-all transition-opacity${this.isLoading
          ? " opacity-60"
          : ""}"
        .items=${this.results.map((url, idx) => ({
          order: idx + 1 + (this.page - 1) * this.pageSize,
          content: html`<a
            href=${url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            >${url}</a
          >`,
        }))}
        aria-live="polite"
      ></btrix-numbered-list>
    `;
  }

  private async fetchOnUpdate() {
    window.clearInterval(this.timerId);
    await this.performUpdate;
    this.isLoading = true;
    await this.fetchQueue();
    this.isLoading = false;
  }

  private async fetchQueue() {
    try {
      const { total, results } = await this.getQueue();

      this.total = total;
      this.results = results;

      this.timerId = window.setTimeout(() => {
        this.fetchQueue();
      }, POLL_INTERVAL_SECONDS * 1000);
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't fetch crawl queue at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getQueue(): Promise<ResponseData> {
    const data: ResponseData = await this.apiFetch(
      `/archives/${this.archiveId}/crawls/${this.crawlId}/queue?offset=${
        (this.page - 1) * this.pageSize
      }&count=${this.page * this.pageSize - 1}`,
      this.authState!
    );

    return data;
  }
}
