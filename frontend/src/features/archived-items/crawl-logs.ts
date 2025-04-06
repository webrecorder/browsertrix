import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import clsx from "clsx";
import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { emptyMessage } from "@/layouts/emptyMessage";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import { type CrawlLog } from "@/types/crawler";
import { stopProp } from "@/utils/events";
import { tw } from "@/utils/tailwind";

enum LogType {
  Error = "error",
  Behavior = "behavior",
}

const DEFAULT_PAGE_PARAMS: Required<APIPaginationQuery> = {
  page: 1,
  pageSize: 50,
} as const;

const queryFor =
  (logs?: APIPaginatedList<CrawlLog>) => (params?: APIPaginationQuery) => {
    return queryString.stringify({
      page: params?.page ?? logs?.page ?? DEFAULT_PAGE_PARAMS.page,
      pageSize:
        params?.pageSize ?? logs?.pageSize ?? DEFAULT_PAGE_PARAMS.pageSize,
    });
  };

const labelFor: Record<LogType, string> = {
  [LogType.Error]: msg("Errors"),
  [LogType.Behavior]: msg("Behaviors"),
};

const emptyMessageFor: Record<LogType, string> = {
  [LogType.Error]: msg("No errors logged."),
  [LogType.Behavior]: msg("No behaviors logged."),
};

/**
 * Logs and associated controls in workflow "Watch Crawl"/"Logs"
 * and archived item "Logs" tabs.
 *
 * To render "live" workflow logs, pass in a changing value as `liveKey`
 */
@customElement("btrix-crawl-logs")
@localized()
export class CrawlLogs extends BtrixElement {
  @property({ type: String })
  crawlId?: string;

  @property({ type: Boolean })
  collapsible = false;

  @property({ type: Number })
  pageSize = DEFAULT_PAGE_PARAMS.pageSize;

  @property({ type: String })
  liveKey?: string;

  @state()
  private filter = LogType.Error;

  @state()
  private open = false;

  private page = DEFAULT_PAGE_PARAMS.page;

  // TODO Check if API can provide this value
  public get errorLogsTotal() {
    return this.errorLogs.value?.total;
  }

  public get behaviorLogsTotal() {
    return this.behaviorLogs.value?.total;
  }

  private readonly errorLogs = new Task(this, {
    task: async ([crawlId], { signal }) => {
      if (!crawlId) return;

      const errorLogs = await this.getErrorLogs(
        { crawlId, page: this.page, pageSize: this.pageSize },
        signal,
      );
      return errorLogs;
    },
    args: () => [this.crawlId, this.liveKey] as const,
  });

  private readonly behaviorLogs = new Task(this, {
    task: async ([crawlId], { signal }) => {
      if (!crawlId) return;

      const behaviorLogs = await this.getBehaviorLogs(
        { crawlId, page: this.page, pageSize: this.pageSize },
        signal,
      );
      return behaviorLogs;
    },
    args: () => [this.crawlId, this.liveKey] as const,
  });

  render() {
    const logs = (
      this.filter === LogType.Error ? this.errorLogs : this.behaviorLogs
    ).value;

    if (this.collapsible) {
      return html`
        <sl-details
          class="part-[content]:pt-0"
          ?open=${this.open}
          @sl-show=${() => (this.open = true)}
          @sl-hide=${() => (this.open = false)}
        >
          <h3
            slot="summary"
            class="text flex flex-1 items-center justify-between gap-2 font-semibold leading-none"
          >
            ${msg("Logs")} ${this.renderBadges()}
          </h3>

          ${logs ? this.renderLogs(logs) : nothing}
        </sl-details>
      `;
    }

    if (!logs) return;

    return this.renderLogs(logs);
  }

  private renderBadges() {
    return html`
      <div
        class=${clsx(
          tw`mx-3 transition-opacity`,
          this.open ? tw`opacity-0` : tw`opacity-100`,
        )}
      >
        ${when(
          this.errorLogs.value?.total,
          (total) => html`
            <btrix-badge variant=${"danger"}
              >${this.localize.number(total)}
              ${labelFor[LogType.Error]}</btrix-badge
            >
          `,
        )}
        ${when(
          this.behaviorLogs.value?.total,
          (total) => html`
            <btrix-badge variant="blue"
              >${this.localize.number(total)}
              ${labelFor[LogType.Behavior]}</btrix-badge
            >
          `,
        )}
      </div>
    `;
  }

  private renderLogs(logs: APIPaginatedList<CrawlLog>) {
    return html`${this.renderControls(logs)}
    ${when(
      logs.total,
      () => html`
        <btrix-crawl-log-table
          .logs=${logs.items}
          offset=${(logs.page - 1) * logs.pageSize}
        ></btrix-crawl-log-table>

        <footer class="my-4 flex justify-center">
          <btrix-pagination
            page=${logs.page}
            totalCount=${logs.total}
            size=${logs.pageSize}
            @page-change=${(e: PageChangeEvent) => {
              this.page = e.detail.page;

              void (this.filter === LogType.Error
                ? this.errorLogs.run()
                : this.behaviorLogs.run());

              this.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
          </btrix-pagination>
        </footer>
      `,
      () => emptyMessage({ message: emptyMessageFor[this.filter] }),
    )} `;
  }

  private renderControls(logs: APIPaginatedList<CrawlLog>) {
    const displayCount = logs.items.length || 0;
    const totalCount =
      (this.errorLogs.value?.total || 0) +
      (this.behaviorLogs.value?.total || 0);

    return html`
      <div
        class="mb-3 flex items-center justify-between gap-3 rounded-lg border bg-neutral-50 p-3"
      >
        <p class="text-neutral-500">
          ${msg(
            str`Viewing ${displayCount} of ${totalCount} most relevant logs`,
          )}
          <sl-tooltip
            placement="right"
            content=${msg(
              "This is a selection of the most relevant behaviors and errors logged during the crawl. Download all logs to view additional warning, info, and debug logs.",
            )}
            @sl-show=${stopProp}
            @sl-after-show=${stopProp}
            @sl-hide=${stopProp}
            @sl-after-hide=${stopProp}
          >
            <sl-icon
              class="mx-0.5 align-[-.175em]"
              name="info-circle"
            ></sl-icon>
          </sl-tooltip>
        </p>
        <div class="flex items-center gap-2">
          <div class="text-neutral-500">${msg("View:")}</div>
          <sl-button-group>
            ${Object.values(LogType).map(this.renderFilter)}
          </sl-button-group>
        </div>
      </div>
    `;
  }

  private readonly renderFilter = (logType: LogType) => {
    const logs = logType === LogType.Error ? this.errorLogs : this.behaviorLogs;
    const total = logs.value?.total || 0;
    const selected = this.filter === logType;

    return html`
      <sl-button
        variant=${ifDefined(selected ? "neutral" : undefined)}
        size="small"
        pill
        @click=${() => (this.filter = logType)}
      >
        ${labelFor[logType]}
        <btrix-badge
          slot="suffix"
          variant=${selected || !total
            ? "neutral"
            : logType === LogType.Error
              ? "danger"
              : "blue"}
        >
          ${this.localize.number(total)}
        </btrix-badge>
      </sl-button>
    `;
  };

  private async getErrorLogs(
    { crawlId, ...params }: { crawlId: string } & Partial<APIPaginationQuery>,
    signal?: AbortSignal,
  ): Promise<APIPaginatedList<CrawlLog>> {
    const query = queryFor(this.errorLogs.value)(params);

    const data = await this.api.fetch<APIPaginatedList<CrawlLog>>(
      `/orgs/${this.orgId}/crawls/${crawlId}/errors?${query}`,
      { signal },
    );

    return data;
  }

  private async getBehaviorLogs(
    { crawlId, ...params }: { crawlId: string } & Partial<APIPaginationQuery>,
    signal?: AbortSignal,
  ): Promise<APIPaginatedList<CrawlLog>> {
    const query = queryFor(this.behaviorLogs.value)(params);

    const data = await this.api.fetch<APIPaginatedList<CrawlLog>>(
      `/orgs/${this.orgId}/crawls/${crawlId}/behaviorLogs?${query}`,
      { signal },
    );

    return data;
  }
}
