import { localized } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import PollTask from "@/controllers/poll";
import { type RunningWorkflowCounts } from "@/types/workflow";

const POLL_INTERVAL_SECONDS = 30;

@customElement("btrix-active-crawls-badge")
@localized()
export class ActiveCrawlsBadge extends BtrixElement {
  readonly #poll = new PollTask(this, {
    task: async (_args, { signal }) => {
      return await this.getActiveCrawlsTotal(signal);
    },
    args: () => [] as const,
    timeoutSeconds: POLL_INTERVAL_SECONDS,
  });

  render() {
    return this.#poll.render(({ totalRunningPausedWaiting }) =>
      totalRunningPausedWaiting
        ? html`<btrix-badge variant="primary">
            ${this.localize.number(totalRunningPausedWaiting)}
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
