import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { BtrixSelectRowEvent } from "@/components/ui/data-grid/events/btrix-select-row";
import type { GridColumn } from "@/components/ui/data-grid/types";
import { noData } from "@/strings/ui";
import { CrawlLogContext, CrawlLogLevel, type CrawlLog } from "@/types/crawler";
import { stopProp } from "@/utils/events";
import { tw } from "@/utils/tailwind";

const labelFor: Record<CrawlLogContext, string> = {
  [CrawlLogContext.General]: msg("General", {
    desc: "'General' crawl log context type",
  }),
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

enum Field {
  Timestamp = "timestamp",
  Level = "logLevel",
  Message = "message",
  PageURL = "details.page",
}

type CellRenderers = Pick<
  GridColumn<Field, CrawlLog>,
  "renderCell" | "renderCellTooltip"
>;

/**
 * Displays crawl logs as tabular data.
 * Clicking a row reveals log details in a dialog.
 */
@customElement("btrix-crawl-log-table")
@localized()
export class CrawlLogTable extends TailwindElement {
  static styles = [
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
  private selectedLog: CrawlLog | null = null;

  private get columns() {
    return [
      {
        field: Field.Level,
        label: msg("Level"),
        width: "max-content",
        align: "center",
        ...this.renderersForLevel(),
      },
      {
        field: Field.Timestamp,
        label: msg("Timestamp"),
        width: "max-content",
        ...this.renderersForTimestamp(),
      },
      {
        field: Field.Message,
        label: msg("Message"),
        width: "1fr",
        ...this.renderersForMessage(),
      },
      {
        field: Field.PageURL,
        label: msg("Page URL"),
        width: "50ch",
        ...this.renderersForPageUrl(),
      },
    ] satisfies GridColumn<Field, CrawlLog>[];
  }

  private readonly renderersForLevel = () =>
    ({
      renderCell: ({ item }) => this.renderLevelIcon(item),
      renderCellTooltip: ({ item }) =>
        html`<span class="capitalize">${item.logLevel}</span>`,
    }) satisfies CellRenderers;

  private readonly renderersForTimestamp = () =>
    ({
      renderCell: ({ item }) =>
        html`<btrix-format-date
          date=${item.timestamp}
          month="2-digit"
          day="2-digit"
          year="numeric"
          hour="2-digit"
          minute="2-digit"
          second="2-digit"
          hour-format="24"
        >
        </btrix-format-date>`,
      renderCellTooltip: ({ item }) =>
        html`<btrix-format-date
          date=${item.timestamp}
          month="long"
          day="numeric"
          year="numeric"
          hour="numeric"
          minute="numeric"
          second="numeric"
          time-zone-name="short"
        >
        </btrix-format-date>`,
    }) satisfies CellRenderers;

  private readonly renderersForMessage = () =>
    ({
      renderCell: ({ item }) =>
        html`<div>
          ${typeof item.message === "string"
            ? item.message
            : html`<code>${JSON.stringify(item.message, null, " ")}</code>`}
        </div>`,
    }) satisfies CellRenderers;

  private readonly renderersForPageUrl = () =>
    ({
      renderCell: ({ item }) =>
        html`<div class="truncate" title=${ifDefined(item.details.page)}>
          ${item.details.page || noData}
        </div>`,
    }) satisfies CellRenderers;

  render() {
    if (!this.logs) return;

    return html`
      <div class="px-1">
        <btrix-data-grid
          class="text-xs"
          .columns=${this.columns}
          .items=${this.logs}
          rowsSelectable
          stickyHeader="viewport"
          alignRows="start"
          @btrix-select-row=${(e: BtrixSelectRowEvent<CrawlLog>) => {
            this.selectedLog = e.detail.item;
          }}
        ></btrix-data-grid>
      </div>

      <sl-details
        class=${clsx(
          tw`sticky bottom-2 mt-3 part-[base]:shadow`,
          !this.selectedLog && tw`part-[base]:bg-slate-50`,
        )}
      >
        ${this.renderDetails()}
        <div slot="summary" class="flex items-center gap-2 text-neutral-600">
          ${this.selectedLog
            ? html`
                ${this.renderLevelIcon(this.selectedLog)}
                <span class="font-semibold capitalize">
                  ${this.selectedLog.logLevel}
                </span>
                <span class="font-semibold">
                  ${labelFor[this.selectedLog.context as CrawlLogContext]}</span
                >
              `
            : msg("Select a log to view details.")}
        </div>
      </sl-details>
    `;
  }

  private renderDetails() {
    return html`TODO`;
  }

  private readonly renderLevelIcon = (log: CrawlLog) => {
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
            name="info-circle"
            class=${clsx(
              tw`text-neutral-400`,
              contextLevel < MIN_CONTEXT_LEVEL && tw`opacity-50`,
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
  };

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
      class="whitespace-pre-wrap text-[0.95em]"
    ><code>${str}</code></pre>`;
  }
}
