import { Task } from "@lit/task";
import { type ReactiveController } from "lit";

import { type WorkflowsList } from "@/pages/org/workflows-list";

export class ClockController implements ReactiveController {
  host: WorkflowsList;

  timeout: number;
  private _timerID?: number;

  readonly task;

  constructor(host: WorkflowsList, timeout = 1000, INITIAL_PAGE_SIZE = 10) {
    (this.host = host).addController(this);
    this.timeout = timeout;
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
          userid: filterByCurrentUser ? this.host.userInfo?.id : undefined,
          sortBy: orderBy.field,
          sortDirection: orderBy.direction === "desc" ? -1 : 1,
          running: true,
        };

        const query = stringifyQuery(queryParams);

        const workflows = await this.api.fetch<APIPaginatedList<Workflow>>(
          `/orgs/${this.orgId}/crawlconfigs?${query}`,
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
          void this.runningWorkflowsTask.run();
        }, 1000 * POLL_INTERVAL_SECONDS);

        return workflows;
      },
      args: () =>
        [
          this.showRunningFirst,
          this.filterBy,
          this.orderBy,
          this.page[WorkflowGroup.RUNNING],
          this.filterByCurrentUser,
        ] as const,
    });
  }
  hostConnected() {
    // Start a timer when the host is connected
    this._timerID = setInterval(() => {
      this.value = new Date();
      // Update the host with new value
      this.host.requestUpdate();
    }, this.timeout);
  }
  hostDisconnected() {
    // Clear the timer when the host is disconnected
    clearInterval(this._timerID);
    this._timerID = undefined;
  }
}
