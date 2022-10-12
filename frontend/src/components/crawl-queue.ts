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
 *   regex="skip-me"
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

  @property({ type: String })
  /** `new RegExp` constructor string */
  regex: string = "";

  @state()
  private queue?: ResponseData;

  @state()
  private isLoading = false;

  @state()
  private page: number = 1;

  @state()
  private pageSize: number = 30;

  @state()
  private isOpen: boolean = true;

  private timerId?: number;

  disconnectedCallback() {
    window.clearInterval(this.timerId);
    super.disconnectedCallback();
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("authState") ||
      changedProperties.has("archiveId") ||
      changedProperties.has("crawlId") ||
      changedProperties.has("page") ||
      changedProperties.has("regex")
    ) {
      this.fetchOnUpdate();
    }
  }

  render() {
    return html`
      <btrix-details
        ?open=${this.isOpen}
        @on-toggle=${(e: CustomEvent) => (this.isOpen = e.detail.open)}
      >
        <span slot="title">
          ${msg("Crawl Queue")}
          <btrix-badge class="ml-1">
            ${msg(str`${this.queue?.total || "0"} URLs`)}
          </btrix-badge>
        </span>
        <div slot="summary-description">
          ${this.isOpen && this.queue?.total && this.queue.total > this.pageSize
            ? html`<btrix-pagination
                size=${this.pageSize}
                totalCount=${this.queue.total}
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

  private renderContent() {
    if (!this.queue?.total) {
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

    const excludedURLStyles = [
      "--marker-color: var(--sl-color-danger-500)",
      "--link-color: var(--sl-color-danger-500)",
      "--link-hover-color: var(--sl-color-danger-400)",
    ].join(";");

    return html`
      <btrix-numbered-list
        class="text-xs break-all transition-opacity${this.isLoading
          ? " opacity-60"
          : ""}"
        .items=${this.queue?.results.map((url, idx) => ({
          order: idx + 1 + (this.page - 1) * this.pageSize,
          style: this.queue?.matched.some((v) => v === url)
            ? excludedURLStyles
            : "",
          content: html`<a
            href=${url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            >${url}</a
          >`,
        }))}
        aria-live="polite"
      ></btrix-numbered-list>

      <footer class="text-center">
        <span class="text-xs text-neutral-400" aria-live="polite">
          ${msg(
            str`${((this.page - 1) * this.pageSize + 1).toLocaleString()}⁠–⁠${(
              this.page * this.pageSize
            ).toLocaleString()} of ${this.queue.total.toLocaleString()} URLs`
          )}
        </span>
      </footer>
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
      this.queue = await this.getQueue();
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
      }&count=${this.page * this.pageSize - 1}&regex=${this.regex}`,
      this.authState!
    );

    return data;
  }
}
