import { Task } from "@lit/task";
import { type ReactiveController } from "lit";
import queryString from "query-string";

import { type Workflow } from "./types";

import { type WorkflowsList } from "@/pages/org/workflows-list";
import { type APIPaginatedList } from "@/types/api";
import { type UserInfo } from "@/types/user";

const stringifyQuery = (query: {}) =>
  queryString.stringify(query, {
    arrayFormat: "comma",
  });

export class ClockController implements ReactiveController {
  host: WorkflowsList;

  private readonly POLL_INTERVAL_SECONDS;
  private runningIntervalId?: number;
  private allIntervalId?: number;

  readonly task;

  constructor(
    host: WorkflowsList,
    INITIAL_PAGE_SIZE = 10,
    POLL_INTERVAL_SECONDS = 10,
    userInfo: () => UserInfo | undefined,
  ) {
    (this.host = host).addController(this);
    this.POLL_INTERVAL_SECONDS = POLL_INTERVAL_SECONDS;
    this.task = new Task(this.host, {
      task: async (
        [showRunningFirst, filterBy, orderBy, page, filterByCurrentUser],
        { signal },
      ) => {
        if (!showRunningFirst) {
          return;
        }
        const queryParams = {
          ...filterBy,
          page: page || 1,
          pageSize: this.task.value?.pageSize || INITIAL_PAGE_SIZE,
          userid: filterByCurrentUser ? userInfo()?.id : undefined,
          sortBy: orderBy.field,
          sortDirection: orderBy.direction === "desc" ? -1 : 1,
          running: true,
        } as const;

        const query = stringifyQuery(queryParams);

        const workflows = await this.host.api.fetch<APIPaginatedList<Workflow>>(
          `/orgs/${this.host.orgId}/crawlconfigs?${query}`,
          {
            signal: signal,
          },
        );

        signal.addEventListener("abort", () => {
          clearTimeout(this.runningIntervalId);
          this.runningIntervalId = undefined;
        });

        clearTimeout(this.allIntervalId);

        this.runningIntervalId = window.setTimeout(() => {
          void this.task.run();
        }, 1000 * POLL_INTERVAL_SECONDS);

        return workflows;
      },
      args: () =>
        [
          this.host.showRunningFirst,
          this.host.filterBy,
          this.host.orderBy,
          this.host.page[WorkflowGroup.RUNNING],
          this.host.filterByCurrentUser,
        ] as const,
    });
  }
  hostConnected() {}
  hostDisconnected() {}
}
