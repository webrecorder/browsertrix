import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";
import { getLocale } from "@/utils/localization";
import type { OrgData, YearMonth } from "@/utils/orgs";

@localized()
@customElement("btrix-usage-history-table")
export class UsageHistoryTable extends TailwindElement {
  @property({ type: Object })
  org: OrgData | null = null;

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

    const usageTableCols = [
      msg("Month"),
      html`
        ${msg("Elapsed Time")}
        <sl-tooltip>
          <div slot="content" style="text-transform: initial">
            ${msg("Total time elapsed between when crawls started and ended")}
          </div>
          <sl-icon name="info-circle" style="vertical-align: -.175em"></sl-icon>
        </sl-tooltip>
      `,
      html`
        ${msg("Total Execution Time")}
        <sl-tooltip>
          <div slot="content" style="text-transform: initial">
            ${msg(
              "Total billable time of all crawler instances this used month",
            )}
          </div>
          <sl-icon name="info-circle" style="vertical-align: -.175em"></sl-icon>
        </sl-tooltip>
      `,
    ];

    if (this.hasMonthlyTime()) {
      usageTableCols.push(
        html`${msg("Execution: Monthly")}
          <sl-tooltip>
            <div slot="content" style="text-transform: initial">
              ${msg("Billable time used, included with monthly plan")}
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
        html`${msg("Execution: Extra")}
          <sl-tooltip>
            <div slot="content" style="text-transform: initial">
              ${msg(
                "Additional units of billable time used, any extra minutes will roll over to next month",
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
        html`${msg("Execution: Gifted")}
          <sl-tooltip>
            <div slot="content" style="text-transform: initial">
              ${msg(
                "Usage of execution time added to your account free of charge",
              )}
            </div>
            <sl-icon
              name="info-circle"
              style="vertical-align: -.175em"
            ></sl-icon>
          </sl-tooltip>`,
      );
    }

    const rows = (Object.entries(this.org.usage || {}) as [YearMonth, number][])
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
              lang=${getLocale()}
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
