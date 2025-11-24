import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { GridColumn, GridItem } from "@/components/ui/data-grid/types";
import { noData } from "@/strings/ui";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";

enum Field {
  Month = "month",
  ElapsedTime = "elapsedTime",
  ExecutionTime = "executionTime",
  BillableExecutionTime = "billableExecutionTime",
  RolloverExecutionTime = "rolloverExecutionTime",
  GiftedExecutionTime = "giftedExecutionTime",
}

type Item = Record<`${Field}`, number>;

@customElement("btrix-usage-history-table")
@localized()
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

    const org = this.org;
    const usageEntries = Object.entries(org.usage || {});

    if (!usageEntries.length) {
      return html`
        <p
          class="rounded border bg-neutral-50 p-3 text-center text-neutral-500"
        >
          ${msg("No usage history to show.")}
        </p>
      `;
    }

    const cols: GridColumn<Item>[] = [
      {
        field: Field.Month,
        label: msg("Month"),
        renderCell({ item }) {
          return html`<btrix-format-date
            date="${item.month}-15T00:00:00.000Z"
            time-zone="utc"
            month="long"
            year="numeric"
          >
          </btrix-format-date>`;
        },
      },
      {
        field: Field.ElapsedTime,
        label: msg("Elapsed Time"),
        description: msg("Total duration of workflow and QA analysis runs."),
      },
      {
        field: Field.ExecutionTime,
        label: msg("Execution Time"),
        description: msg(
          "Aggregated time across all browser windows that the crawler was actively executing a crawl or QA analysis run, i.e. not waiting or paused.",
        ),
      },
    ];

    if (this.hasMonthlyTime()) {
      cols.push({
        field: Field.BillableExecutionTime,
        label: msg("Billable Execution Time"),
        description: msg(
          "Execution time used that is billable to the current month of the plan.",
        ),
      });
    }
    if (this.hasExtraTime()) {
      cols.push({
        field: Field.RolloverExecutionTime,
        label: msg("Rollover Execution Time"),
        description: msg(
          "Additional execution time used, of which any extra minutes will roll over to next month as billable time.",
        ),
      });
    }
    if (this.hasGiftedTime()) {
      cols.push({
        field: Field.GiftedExecutionTime,
        label: msg("Gifted Execution Time"),
        description: msg("Execution time used that is free of charge."),
      });
    }

    cols.forEach((col) => {
      if (!col.renderCell) {
        col.renderCell = this.renderSecondsForField(col.field);
      }
    });

    const items: GridItem[] = [];

    usageEntries.forEach(([mY, crawlTime]) => {
      let monthlySecondsUsed = org.monthlyExecSeconds?.[mY] || 0;
      let maxMonthlySeconds = 0;
      if (org.quotas.maxExecMinutesPerMonth) {
        maxMonthlySeconds = org.quotas.maxExecMinutesPerMonth * 60;
      }
      if (maxMonthlySeconds !== 0 && monthlySecondsUsed > maxMonthlySeconds) {
        monthlySecondsUsed = maxMonthlySeconds;
      }

      let extraSecondsUsed = org.extraExecSeconds?.[mY] || 0;
      let maxExtraSeconds = 0;
      if (org.quotas.extraExecMinutes) {
        maxExtraSeconds = org.quotas.extraExecMinutes * 60;
      }
      if (maxExtraSeconds !== 0 && extraSecondsUsed > maxExtraSeconds) {
        extraSecondsUsed = maxExtraSeconds;
      }

      let giftedSecondsUsed = org.giftedExecSeconds?.[mY] || 0;
      let maxGiftedSeconds = 0;
      if (org.quotas.giftedExecMinutes) {
        maxGiftedSeconds = org.quotas.giftedExecMinutes * 60;
      }
      if (maxGiftedSeconds !== 0 && giftedSecondsUsed > maxGiftedSeconds) {
        giftedSecondsUsed = maxGiftedSeconds;
      }

      let totalSecondsUsed = org.crawlExecSeconds?.[mY] || 0;
      const totalMaxQuota =
        maxMonthlySeconds !== 0
          ? maxMonthlySeconds + maxExtraSeconds + maxGiftedSeconds
          : 0;
      if (totalMaxQuota !== 0 && totalSecondsUsed > totalMaxQuota) {
        totalSecondsUsed = totalMaxQuota;
      }

      const item: Partial<GridItem<Field>> = {
        [Field.Month]: mY,
        [Field.ElapsedTime]: crawlTime || 0,
        [Field.ExecutionTime]: totalSecondsUsed,
        [Field.BillableExecutionTime]: monthlySecondsUsed,
        [Field.RolloverExecutionTime]: extraSecondsUsed,
        [Field.GiftedExecutionTime]: giftedSecondsUsed,
      };

      items.unshift(item);
    });

    return html`
      <btrix-data-grid
        .columns=${cols}
        .items=${items}
        stickyHeader="viewport"
      ></btrix-data-grid>
    `;
  }

  private readonly renderSecondsForField =
    (field: `${Field}`) =>
    ({ item }: { item: GridItem<Field> }) => html`
      ${item[field] ? humanizeExecutionSeconds(+item[field]) : noData}
    `;
}
