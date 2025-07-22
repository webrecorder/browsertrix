import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { noData } from "@/strings/ui";
import { CrawlLogContext, CrawlLogLevel, type CrawlLog } from "@/types/crawler";
import { truncate } from "@/utils/css";
import { stopProp } from "@/utils/events";
import { tw } from "@/utils/tailwind";

const labelFor: Record<CrawlLogContext, string> = {
  [CrawlLogContext.General]: msg("General"),
  [CrawlLogContext.Behavior]: msg("Page Behavior"),
  [CrawlLogContext.BehaviorScript]: msg("Built-in Behavior"),
  [CrawlLogContext.BehaviorScriptCustom]: msg("Custom Behavior Script"),
};

const contextLevelFor: Record<CrawlLogContext, number> = {
  [CrawlLogContext.Behavior]: 1,
  [CrawlLogContext.BehaviorScript]: 2,
  [CrawlLogContext.General]: 3,
  [CrawlLogContext.BehaviorScriptCustom]: 4,
};
// Minimum context level to highlight
const MIN_CONTEXT_LEVEL = 3;

/**
 * Displays crawl logs as tabular data.
 * Clicking a row reveals log details in a dialog.
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
  offset = 0;

  @state()
  private selectedLog:
    | (CrawlLog & {
        index: number;
      })
    | null = null;

  render() {
    if (!this.logs) return;

    const rowClasses = tw`grid grid-cols-[5rem_2.5rem_20rem_1fr] leading-[1.3]`;

    return html`<btrix-numbered-list class="text-xs">
        <btrix-numbered-list-header slot="header">
          <div class=${rowClasses}>
            <div class="px-2">${msg("Timestamp")}</div>
            <div class="text-center">${msg("Level")}</div>
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
              <div
                class=${clsx(
                  rowClasses,
                  (contextLevelFor[log.context as unknown as CrawlLogContext] ||
                    0) < MIN_CONTEXT_LEVEL
                    ? tw`text-stone-400`
                    : tw`text-stone-800`,
                  tw`group-hover:text-inherit`,
                )}
              >
                <div>
                  <sl-tooltip
                    placement="bottom"
                    @sl-hide=${stopProp}
                    @sl-after-hide=${stopProp}
                  >
                    <btrix-format-date
                      date=${log.timestamp}
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
                    @sl-hide=${stopProp}
                    @sl-after-hide=${stopProp}
                  >
                    ${this.renderLevel(log)}
                  </sl-tooltip>
                </div>
                <div class="whitespace-pre-wrap">${log.message}</div>
                ${log.details.page
                  ? html`
                      <div class="truncate" title="${log.details.page}">
                        ${log.details.page}
                      </div>
                    `
                  : html`<div class="text-neutral-400 group-hover:text-inherit">
                      ${noData}
                    </div>`}
              </div>
            </btrix-numbered-list-item>
          `;
        })}
      </btrix-numbered-list>

      <btrix-dialog
        .label=${msg("Log Details")}
        .open=${!!this.selectedLog}
        class="[--width:40rem]"
        @sl-show=${stopProp}
        @sl-after-show=${stopProp}
        @sl-hide=${stopProp}
        @sl-after-hide=${(e: CustomEvent) => {
          stopProp(e);
          this.selectedLog = null;
        }}
        >${this.renderLogDetails()}</btrix-dialog
      > `;
  }

  private renderLevel(log: CrawlLog) {
    const logLevel = log.logLevel;
    const contextLevel =
      contextLevelFor[log.context as unknown as CrawlLogContext] || 0;
    const baseClasses = tw`size-4 group-hover:text-inherit`;

    switch (logLevel) {
      case CrawlLogLevel.Fatal:
        return html`
          <sl-icon
            name="exclamation-octagon-fill"
            class=${clsx(tw`text-danger-500`, baseClasses)}
          ></sl-icon>
        `;
      case CrawlLogLevel.Error:
        return html`
          <sl-icon
            name="exclamation-triangle-fill"
            class=${clsx(tw`text-danger-500`, baseClasses)}
          ></sl-icon>
        `;
      case CrawlLogLevel.Warning:
        return html`
          <sl-icon
            name="exclamation-diamond-fill"
            class=${clsx(tw`text-warning-500`, baseClasses)}
          ></sl-icon>
        `;
      case CrawlLogLevel.Info:
        return html`
          <sl-icon
            name="info-circle-fill"
            class=${clsx(
              tw`text-neutral-400`,
              contextLevel < MIN_CONTEXT_LEVEL && tw`opacity-30`,
              baseClasses,
            )}
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
    const { context, details } = this.selectedLog;
    const { page, stack, ...unknownDetails } = details;

    return html`
      <btrix-desc-list>
        <btrix-desc-list-item label=${msg("TIMESTAMP")}>
          ${this.selectedLog.timestamp}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("CONTEXT")}>
          ${Object.values(CrawlLogContext).includes(
            context as unknown as CrawlLogContext,
          )
            ? labelFor[context as CrawlLogContext]
            : html`<span class="capitalize">${context}</span>`}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("MESSAGE")}>
          ${this.selectedLog.message}
        </btrix-desc-list-item>
        ${page
          ? html`<btrix-desc-list-item label=${msg("PAGE")}>
              ${this.renderPage(page)}
            </btrix-desc-list-item>`
          : nothing}
        ${stack
          ? html`<btrix-desc-list-item label=${msg("STACK")}>
              ${this.renderPre(stack)}
            </btrix-desc-list-item>`
          : nothing}
        ${Object.entries(unknownDetails).map(
          ([key, value]) => html`
            <btrix-desc-list-item label=${key.toUpperCase()}>
              ${typeof value !== "string" && typeof value !== "number"
                ? this.renderPre(value)
                : value
                  ? html`<span class="break-all">${value}</span>`
                  : noData}
            </btrix-desc-list-item>
          `,
        )}
      </btrix-desc-list>
    `;
  }

  private renderPage(page: string) {
    return html`
      <sl-tooltip
        content=${msg("Open live page in new tab")}
        @sl-hide=${stopProp}
        @sl-after-hide=${stopProp}
      >
        <a
          class="break-all text-blue-500 hover:text-blue-400"
          href=${page}
          target="_blank"
          rel="noopener noreferrer nofollow"
          >${page}</a
        >
      </sl-tooltip>
    `;
  }

  private renderPre(value: unknown) {
    let str = value;
    if (typeof value !== "string") {
      str = JSON.stringify(value, null, 2);
    }
    return html`<pre
      class="overflow-auto whitespace-pre"
    ><code>${str}</code></pre>`;
  }
}
