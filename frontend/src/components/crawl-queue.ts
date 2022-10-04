import { property, state } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";
import type { AuthState } from "../utils/AuthService";

type Pages = string[];
type ResponseData = {
  total: number;
  results: Pages;
  matched: Pages;
};

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
  private pageSize: number = 10;

  @state()
  private total?: number;

  private timerId?: number;

  disconnectedCallback() {
    window.clearInterval(this.timerId);
    super.disconnectedCallback();
  }

  async firstUpdated() {
    await this.performUpdate;
    this.fetchQueue();
  }

  async updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("page")) {
      await this.performUpdate;
      this.fetchQueue();
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
      <header class="flex justify-end">
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
        class="text-xs transition-opacity${this.isLoading ? " opacity-60" : ""}"
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

  private async fetchQueue() {
    this.isLoading = true;

    try {
      const { total, results } = await this.getQueue();

      this.total = total;
      this.results = results;
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't fetch crawl queue at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isLoading = false;
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
