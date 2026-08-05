import { localized } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement } from "lit/decorators.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import PollController from "@/controllers/poll";
import type { APIPaginatedList } from "@/types/api";
import type { Crawl } from "@/types/crawler";

const POLL_INTERVAL_SECONDS = 30;

@customElement("btrix-active-crawls-badge")
@localized()
export class ActiveCrawlsBadge extends BtrixElement {
  private readonly activeCrawlsTotalTask = new Task(this, {
    task: async () => {
      return await this.getActiveCrawlsTotal();
    },
    args: () => [] as const,
  });

  readonly #poll: PollController<typeof this.activeCrawlsTotalTask> =
    new PollController(this, this.activeCrawlsTotalTask, {
      timeoutSeconds: POLL_INTERVAL_SECONDS,
    });

  render() {
    return this.#poll.renderComplete(
      ({ total }) =>
        html`<btrix-badge variant=${total > 0 ? "primary" : "blue"}>
          ${this.localize.number(total)}
        </btrix-badge>`,
    );
  }

  private async getActiveCrawlsTotal() {
    const query = queryString.stringify({
      pageSize: 1,
    });

    const data = await this.api.fetch<APIPaginatedList<Crawl>>(
      `/orgs/all/crawls?${query}`,
    );

    return data;
  }
}
