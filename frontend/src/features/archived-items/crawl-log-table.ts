import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { CrawlLogLevel, type CrawlLog } from "@/types/crawler";
import { truncate } from "@/utils/css";
import { tw } from "@/utils/tailwind";

/**
 * Tabular list of logs
 */
@customElement("btrix-crawl-log-table")
@localized()
export class CrawlLogTable extends TailwindElement {
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

  @property({ type: Array })
  logs?: CrawlLog[];

  /**
   * Number to offset index by, e.g. for pagination
   */
  @property({ type: Number })
  offset = 1;

  @state()
  private selectedLog:
    | (CrawlLog & {
        index: number;
      })
    | null = null;

  render() {
    if (!this.logs) return;

    const rowClasses = tw`grid grid-cols-[9rem_3rem_20rem_1fr] leading-[1.3]`;

    return html`<btrix-numbered-list class="text-xs">
        <btrix-numbered-list-header slot="header">
          <div class=${rowClasses}>
            <div class="px-2">${msg("Timestamp")}</div>
            <div>${msg("Severity")}</div>
            <div class="px-2">${msg("Message")}</div>
            <div class="px-2">${msg("Page URL")}</div>
          </div>
        </btrix-numbered-list-header>
        ${this.logs.map((log: CrawlLog, idx) => {
          const selected = this.selectedLog?.index === idx;
          return html`
            <btrix-numbered-list-item
              class="group"
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
              <div slot="marker" class="min-w-[3ch]">
                ${idx + 1 + this.offset}.
              </div>
              <div class=${rowClasses}>
                <div>
                  <sl-tooltip placement="bottom">
                    <btrix-format-date
                      date=${log.timestamp}
                      month="2-digit"
                      day="2-digit"
                      year="2-digit"
                      hour="2-digit"
                      minute="2-digit"
                      second="2-digit"
                      hour-format="24"
                    >
                    </btrix-format-date>
                    <btrix-format-date
                      slot="content"
                      date=${log.timestamp}
                      month="long"
                      day="numeric"
                      year="numeric"
                      hour="numeric"
                      minute="numeric"
                      second="numeric"
                      time-zone-name="short"
                    >
                    </btrix-format-date>
                  </sl-tooltip>
                </div>
                <div class="pr-4 text-center">
                  <sl-tooltip
                    class="capitalize"
                    content=${log.logLevel}
                    placement="bottom"
                  >
                    ${this.renderSeverity(log.logLevel)}
                  </sl-tooltip>
                </div>
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

      <btrix-dialog
        .label=${msg("Log Details")}
        .open=${!!this.selectedLog}
        style="--width: 40rem"
        @sl-after-hide=${() => (this.selectedLog = null)}
        >${this.renderLogDetails()}</btrix-dialog
      > `;
  }

  private renderSeverity(level: CrawlLogLevel) {
    const baseClasses = tw`size-4 group-hover:text-inherit`;
    switch (level) {
      case CrawlLogLevel.Fatal:
        return html`
          <sl-icon
            name="exclamation-octagon"
            class=${clsx(tw`text-danger-500`, baseClasses)}
          ></sl-icon>
        `;
      case CrawlLogLevel.Error:
        return html`
          <sl-icon
            name="exclamation-triangle"
            class=${clsx(tw`text-danger-500`, baseClasses)}
          ></sl-icon>
        `;
      case CrawlLogLevel.Warning:
        return html`
          <sl-icon
            name="exclamation-square"
            class=${clsx(tw`text-warning-500`, baseClasses)}
          ></sl-icon>
        `;
      case CrawlLogLevel.Info:
        return html`
          <sl-icon
            name="info-square"
            class=${clsx(tw`text-blue-500`, baseClasses)}
          ></sl-icon>
        `;
      case CrawlLogLevel.Debug:
        return html`
          <sl-icon
            name="bug"
            class=${clsx(tw`text-neutral-400`, baseClasses)}
          ></sl-icon>
        `;
      default:
        return html`
          <sl-icon
            name="question-lg"
            class=${clsx(tw`text-neutral-300`, baseClasses)}
          ></sl-icon>
        `;
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
        <btrix-desc-list-item label=${msg("Message").toUpperCase()}>
          ${this.selectedLog.message}
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
