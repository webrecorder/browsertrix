import { consume } from "@lit/context";
import { localized } from "@lit/localize";
import { Task } from "@lit/task";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";

import { BtrixElement } from "@/classes/BtrixElement";
import {
  activeCrawlsCountContext,
  type ActiveCrawlsCountContext,
} from "@/context/active-crawls-count/active-crawls-count";
import { makeUpdateActiveCrawlsCountEvent } from "@/context/active-crawls-count/events";
import { viewStateContext, type ViewStateContext } from "@/context/view-state";
import PollTask from "@/controllers/poll";
import { type RunningWorkflowCounts } from "@/types/workflow";
import { urlForName } from "@/utils/router";

const POLL_INTERVAL_SECONDS = 30;

/**
 * @fires btrix-update-active-crawls-count
 */
@customElement("btrix-active-crawls-badge")
@localized()
export class ActiveCrawlsBadge extends BtrixElement {
  @consume({ context: activeCrawlsCountContext, subscribe: true })
  @state()
  activeCrawlsCount?: ActiveCrawlsCountContext;

  @consume({ context: viewStateContext, subscribe: true })
  @state()
  viewState?: ViewStateContext;

  private get isCrawlsPageVisible() {
    return this.viewState?.pathname === urlForName("adminCrawls");
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("viewState") && this.viewState) {
      // Use most updated totals from crawls page poll instead
      if (this.isCrawlsPageVisible) {
        this.#poll.pause();
      } else if (this.#poll.paused) {
        void this.#poll.start();
      }
    }
  }

  readonly #poll = new PollTask(this, {
    task: async ([isSuperAdmin], { signal }) => {
      if (!isSuperAdmin) return;

      try {
        const data = await this.getActiveCrawlsTotal(signal);

        return data;
      } catch (err) {
        console.debug(err);
      }
    },
    args: () => [this.userInfo?.isSuperAdmin, this.orgId] as const,
    timeoutSeconds: POLL_INTERVAL_SECONDS,
  });

  constructor() {
    super();

    // Update context on poll value change
    new Task(this, {
      task: ([total]) => {
        if (total === undefined) return;

        this.dispatchEvent(
          makeUpdateActiveCrawlsCountEvent({
            allOrgs: total,
          }),
        );
      },
      args: () => [this.#poll.value?.totalRunningPausedWaiting] as const,
    });
  }

  render() {
    // Render value from context instead of task so that
    // it's synced to the active crawls page
    return guard([this.activeCrawlsCount?.allOrgs], () =>
      this.activeCrawlsCount?.allOrgs
        ? html`<btrix-badge variant="primary">
            ${this.localize.number(this.activeCrawlsCount.allOrgs)}
          </btrix-badge>`
        : nothing,
    );
  }

  private async getActiveCrawlsTotal(signal: AbortSignal) {
    const data = await this.api.fetch<RunningWorkflowCounts>(
      `/orgs/all/crawlconfigs/running`,
      { signal, priority: "low" },
    );

    return data;
  }
}
