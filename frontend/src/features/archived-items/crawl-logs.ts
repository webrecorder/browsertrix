import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { APIPaginatedList } from "@/types/api";
import { truncate } from "@/utils/css";
import { tw } from "@/utils/tailwind";

enum LogLevel {
  Error = "error",
}

export type CrawlLog = {
  timestamp: string;
  logLevel: LogLevel;
  details: Record<string, unknown>;
  context: string;
  message: string;
};

@customElement("btrix-crawl-logs")
@localized()
export class CrawlLogs extends TailwindElement {
  static styles = [
    truncate,
    css`
      pre {
        white-space: pre-wrap;
        font-family: var(--sl-font-mono);
        font-size: var(--sl-font-size-x-small);
        margin: 0;
        padding: var(--sl-spacing-small);
        border: 1px solid var(--sl-panel-border-color);
        border-radius: var(--sl-border-radius-medium);
      }
    `,
  ];

  @property({ type: Object })
  logs?: APIPaginatedList<CrawlLog>;

  @property({ type: Boolean })
  paginate = false;

  @state()
  private selectedLog:
    | (CrawlLog & {
        index: number;
      })
    | null = null;

  render() {
    if (!this.logs) return;

    const rowClasses = tw`grid grid-cols-[10rem_4rem_20rem_1fr] leading-[1.3]`;

    return html`<btrix-numbered-list class="le text-xs">
        <btrix-numbered-list-header slot="header">
          <div class=${rowClasses}>
            <div class="px-2">${msg("Timestamp")}</div>
            <div class="px-2">${msg("Severity")}</div>
            <div class="px-2">${msg("Message")}</div>
            <div class="px-2">${msg("Page URL")}</div>
          </div>
        </btrix-numbered-list-header>
        ${this.logs.items.map((log: CrawlLog, idx) => {
          const selected = this.selectedLog?.index === idx;
          return html`
            <btrix-numbered-list-item
              hoverable
              ?selected=${selected}
              aria-selected="${selected}"
              @click=${() => {
                this.selectedLog = {
                  index: idx,
                  ...log,
                };
              }}
            >
              <div slot="marker">${idx + 1}.</div>
              <div class=${rowClasses}>
                <div>
                  <btrix-format-date
                    date=${log.timestamp}
                    month="2-digit"
                    day="2-digit"
                    year="numeric"
                    hour="2-digit"
                    minute="2-digit"
                    second="2-digit"
                    hour-format="24"
                  >
                  </btrix-format-date>
                </div>
                <div>${this.renderSeverity(log.logLevel)}</div>
                <div class="whitespace-pre-wrap">${log.message}</div>
                <div class="truncate" title="${log.details.page as string}">
                  <a target="_blank" href="${log.details.page as string}"
                    >${log.details.page}</a
                  >
                </div>
              </div>
            </btrix-numbered-list-item>
          `;
        })}
      </btrix-numbered-list>
      ${this.paginate
        ? html`<footer class="my-4 flex justify-center">
            <btrix-pagination
              page=${this.logs.page}
              totalCount=${this.logs.total}
              size=${this.logs.pageSize}
            >
            </btrix-pagination>
          </footer>`
        : ""}

      <btrix-dialog
        .label=${msg("Log Details")}
        .open=${!!this.selectedLog}
        style="--width: 40rem"
        @sl-after-hide=${() => (this.selectedLog = null)}
        >${this.renderLogDetails()}</btrix-dialog
      > `;
  }

  private renderSeverity(level: LogLevel) {
    const baseClasses = tw`size-4`;
    switch (level) {
      case LogLevel.Error:
        return html`
          <sl-icon
            name="exclamation-triangle-fill"
            class=${clsx(tw`text-danger-500`, baseClasses)}
          ></sl-icon>
        `;
      default:
        break;
    }
  }

  private renderLogDetails() {
    if (!this.selectedLog) return;
    const { details } = this.selectedLog;
    return html`
      <btrix-desc-list>
        <btrix-desc-list-item label=${msg("Timestamp").toUpperCase()}>
          ${this.selectedLog.timestamp}
        </btrix-desc-list-item>
        ${Object.entries(details).map(
          ([key, value]) => html`
            <btrix-desc-list-item label=${key.toUpperCase()}>
              ${key === "stack" ||
              (typeof value !== "string" && typeof value !== "number")
                ? this.renderPre(value)
                : value || "--"}
            </btrix-desc-list-item>
          `,
        )}
      </btrix-desc-list>
    `;
  }

  private renderPre(value: unknown) {
    let str = value;
    if (typeof value !== "string") {
      str = JSON.stringify(value, null, 2);
    }
    return html`<pre><code>${str}</code></pre>`;
  }
}
