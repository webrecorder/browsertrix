import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { emptyMessage } from "@/layouts/emptyMessage";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import { type CrawlLog } from "@/types/crawler";

enum LogType {
  Error = "error",
  Behavior = "behavior",
}

const DEFAULT_PAGE_PARAMS: Partial<APIPaginationQuery> = {
  page: 1,
  pageSize: 50,
} as const;

const queryFor =
  (logs?: APIPaginatedList<CrawlLog>) =>
  (params?: Partial<APIPaginationQuery>) => {
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
 * Logs and associated controls in workflow and archived item "Logs" tab
 */
@customElement("btrix-crawl-logs")
@localized()
export class CrawlLogs extends BtrixElement {
  @property({ type: String })
  crawlId?: string;

  @state()
  private filter = LogType.Error;

  private page = DEFAULT_PAGE_PARAMS.page;

  private readonly errorLogs = new Task(this, {
    task: async ([crawlId], { signal }) => {
      if (!crawlId) return;
      const errorLogs = await this.getErrorLogs(
        { crawlId, page: this.page },
        signal,
      );
      return errorLogs;
    },
    args: () => [this.crawlId] as const,
  });

  private readonly behaviorLogs = new Task(this, {
    task: async ([crawlId], { signal }) => {
      if (!crawlId) return;
      const behaviorLogs = await this.getBehaviorLogs(
        { crawlId, page: this.page },
        signal,
      );
      return behaviorLogs;
    },
    args: () => [this.crawlId] as const,
  });

  render() {
    const logs = (
      this.filter === LogType.Error ? this.errorLogs : this.behaviorLogs
    ).value;

    if (!logs) return;

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

    return html`
      <sl-button
        variant=${ifDefined(this.filter === logType ? "neutral" : undefined)}
        size="small"
        pill
        @click=${() => (this.filter = logType)}
      >
        ${labelFor[logType]}
        <btrix-badge slot="suffix">
          ${this.localize.number(logs.value?.total || 0)}
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
