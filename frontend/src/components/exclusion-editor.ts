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
      ${this.config
        ? html`<btrix-queue-exclusion-table .config=${this.config}>
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
