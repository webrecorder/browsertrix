import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";

@localized()
@customElement("btrix-usage-history-table")
export class UsageHistoryTable extends BtrixElement {
  private readonly hasMonthlyTime = () =>
    this.org?.monthlyExecSeconds &&
    Object.keys(this.org.monthlyExecSeconds).length;

  private readonly hasExtraTime = () =>
    this.org?.extraExecSeconds && Object.keys(this.org.extraExecSeconds).length;

  private readonly hasGiftedTime = () =>
    this.org?.giftedExecSeconds &&
    Object.keys(this.org.giftedExecSeconds).length;

  render() {
    if (!this.org) return;

    if (this.org.usage && !Object.keys(this.org.usage).length) {
      return html`
        <p
          class="rounded border bg-neutral-50 p-3 text-center text-neutral-500"
        >
          ${msg("No usage history to show.")}
        </p>
      `;
    }

    const usageTableCols = [
      msg("Month"),
      html`
        ${msg("Elapsed Time")}
        <sl-tooltip>
          <div slot="content" style="text-transform: initial">
            ${msg(
              "Total duration of crawls and QA analysis runs, from start to finish",
            )}
          </div>
          <sl-icon name="info-circle" style="vertical-align: -.175em"></sl-icon>
        </sl-tooltip>
      `,
      html`
        ${msg("Execution Time")}
        <sl-tooltip>
          <div slot="content" style="text-transform: initial">
            ${msg(
              "Aggregated time across all browser windows that the crawler was actively executing a crawl or QA analysis run, i.e. not in a waiting state",
            )}
          </div>
          <sl-icon name="info-circle" style="vertical-align: -.175em"></sl-icon>
        </sl-tooltip>
      `,
    ];

    if (this.hasMonthlyTime()) {
      usageTableCols.push(
        html`${msg("Billable Execution Time")}
          <sl-tooltip>
            <div slot="content" style="text-transform: initial">
              ${msg(
                "Execution time used that is billable to the current month of the plan",
              )}
            </div>
            <sl-icon
              name="info-circle"
              style="vertical-align: -.175em"
            ></sl-icon>
          </sl-tooltip>`,
      );
    }
    if (this.hasExtraTime()) {
      usageTableCols.push(
        html`${msg("Rollover Execution Time")}
          <sl-tooltip>
            <div slot="content" style="text-transform: initial">
              ${msg(
                "Additional execution time used, of which any extra minutes will roll over to next month as billable time",
              )}
            </div>
            <sl-icon
              name="info-circle"
              style="vertical-align: -.175em"
            ></sl-icon>
          </sl-tooltip>`,
      );
    }
    if (this.hasGiftedTime()) {
      usageTableCols.push(
        html`${msg("Gifted Execution Time")}
          <sl-tooltip>
            <div slot="content" style="text-transform: initial">
              ${msg("Execution time used that is free of charge")}
            </div>
            <sl-icon
              name="info-circle"
              style="vertical-align: -.175em"
            ></sl-icon>
          </sl-tooltip>`,
      );
    }

    const rows = Object.entries(this.org.usage || {})
      // Sort latest
      .reverse()
      .map(([mY, crawlTime]) => {
        if (!this.org) return [];

        let monthlySecondsUsed = this.org.monthlyExecSeconds?.[mY] || 0;
        let maxMonthlySeconds = 0;
        if (this.org.quotas.maxExecMinutesPerMonth) {
          maxMonthlySeconds = this.org.quotas.maxExecMinutesPerMonth * 60;
        }
        if (monthlySecondsUsed > maxMonthlySeconds) {
          monthlySecondsUsed = maxMonthlySeconds;
        }

        let extraSecondsUsed = this.org.extraExecSeconds?.[mY] || 0;
        let maxExtraSeconds = 0;
        if (this.org.quotas.extraExecMinutes) {
          maxExtraSeconds = this.org.quotas.extraExecMinutes * 60;
        }
        if (extraSecondsUsed > maxExtraSeconds) {
          extraSecondsUsed = maxExtraSeconds;
        }

        let giftedSecondsUsed = this.org.giftedExecSeconds?.[mY] || 0;
        let maxGiftedSeconds = 0;
        if (this.org.quotas.giftedExecMinutes) {
          maxGiftedSeconds = this.org.quotas.giftedExecMinutes * 60;
        }
        if (giftedSecondsUsed > maxGiftedSeconds) {
          giftedSecondsUsed = maxGiftedSeconds;
        }

        let totalSecondsUsed = this.org.crawlExecSeconds?.[mY] || 0;
        const totalMaxQuota =
          maxMonthlySeconds + maxExtraSeconds + maxGiftedSeconds;
        if (totalSecondsUsed > totalMaxQuota) {
          totalSecondsUsed = totalMaxQuota;
        }

        const tableRows = [
          html`
            <sl-format-date
              lang=${this.localize.activeLanguage}
              date="${mY}-15T00:00:00.000Z"
              time-zone="utc"
              month="long"
              year="numeric"
            >
            </sl-format-date>
          `,
          humanizeExecutionSeconds(crawlTime || 0),
          totalSecondsUsed ? humanizeExecutionSeconds(totalSecondsUsed) : "--",
        ];
        if (this.hasMonthlyTime()) {
          tableRows.push(
            monthlySecondsUsed
              ? humanizeExecutionSeconds(monthlySecondsUsed)
              : "--",
          );
        }
        if (this.hasExtraTime()) {
          tableRows.push(
            extraSecondsUsed
              ? humanizeExecutionSeconds(extraSecondsUsed)
              : "--",
          );
        }
        if (this.hasGiftedTime()) {
          tableRows.push(
            giftedSecondsUsed
              ? humanizeExecutionSeconds(giftedSecondsUsed)
              : "--",
          );
        }
        return tableRows;
      });
    return html`
      <btrix-data-table
        .columns=${usageTableCols}
        .rows=${rows}
      ></btrix-data-table>
    `;
  }
}
