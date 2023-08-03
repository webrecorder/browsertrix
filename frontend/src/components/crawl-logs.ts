import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";

import { truncate } from "../utils/css";
import type { APIPaginatedList } from "../types/api";

type CrawlLog = {
  timestamp: string;
  logLevel: "error";
  details: Record<string, any>;
  context: string;
  message: string;
};

@localized()
export class CrawlLogs extends LitElement {
  static styles = [
    truncate,
    css`
      btrix-numbered-list {
        font-size: var(--sl-font-size-x-small);
      }

      .row {
        display: grid;
        grid-template-columns: 9rem 4rem 14rem 1fr;
        line-height: 1.3;
        max-width: 800px;
      }

      .cell {
        padding-left: var(--sl-spacing-x-small);
        padding-right: var(--sl-spacing-x-small);
      }

      .tag {
        display: inline-block;
        border-radius: var(--sl-border-radius-small);
        padding: var(--sl-spacing-3x-small) var(--sl-spacing-2x-small);
        text-transform: capitalize;
        /* TODO handle non-errors */
        background-color: var(--danger);
        color: var(--sl-color-neutral-0);
      }

      footer {
        display: flex;
        justify-content: center;
        margin-top: var(--sl-spacing-large);
        margin-bottom: var(--sl-spacing-x-large);
      }

      .message {
        white-space: pre-wrap;
      }

      .url {
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
      }
    `,
  ];

  @property({ type: Object })
  logs?: APIPaginatedList;

  render() {
    if (!this.logs) return;
    return html`<btrix-numbered-list>
        <btrix-numbered-list-header slot="header">
          <div class="row">
            <div class="cell">${msg("Date")}</div>
            <div class="cell">${msg("Level")}</div>
            <div class="cell">${msg("Error Message")}</div>
            <div class="cell">${msg("Page URL")}</div>
          </div>
        </btrix-numbered-list-header>
        ${this.logs.items.map(
          (log: CrawlLog, idx) => html`
            <btrix-numbered-list-item>
              <div class="row">
                <div>
                  <sl-format-date
                    date=${log.timestamp}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="2-digit"
                    minute="2-digit"
                    second="2-digit"
                    hour-format="24"
                  >
                  </sl-format-date>
                </div>
                <div>
                  <span class="tag">${log.logLevel}</span>
                </div>
                <div class="message">${log.message}</div>
                <div class="url" title="${log.details?.page}">
                  <a target="_blank" href="${log.details?.page}"
                    >${log.details?.page}</a
                  >
                </div>
              </div>
            </btrix-numbered-list-item>
          `
        )}
      </btrix-numbered-list>
      <footer>
        <btrix-pagination
          page=${this.logs.page}
          totalCount=${this.logs.total}
          size=${this.logs.pageSize}
        >
        </btrix-pagination>
      </footer> `;
  }
}
