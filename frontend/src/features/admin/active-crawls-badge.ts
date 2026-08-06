import { consume } from "@lit/context";
import { localized } from "@lit/localize";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";

import { BtrixElement } from "@/classes/BtrixElement";
import {
  activeCrawlsCountContext,
  type ActiveCrawlsCountContext,
} from "@/context/active-crawls-count";
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
    task: async (_args, { signal }) => {
      try {
        const data = await this.getActiveCrawlsTotal(signal);

        if (data.totalRunningPausedWaiting !== this.activeCrawlsCount) {
          this.dispatchEvent(
            new CustomEvent("btrix-update-active-crawls-count", {
              detail: data.totalRunningPausedWaiting,
              bubbles: true,
              composed: true,
            }),
          );
        }

        return data;
      } catch (err) {
        console.debug(err);
      }
    },
    args: () => [] as const,
    timeoutSeconds: POLL_INTERVAL_SECONDS,
  });

  render() {
    // Render value from context instead of task so that
    // it's synced to the active crawls page
    return guard([this.activeCrawlsCount], () =>
      this.activeCrawlsCount
        ? html`<btrix-badge variant="primary">
            ${this.localize.number(this.activeCrawlsCount)}
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
