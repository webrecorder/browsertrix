import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement } from "lit/decorators.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import PollTask from "@/controllers/poll";
import type { APIPaginatedList } from "@/types/api";
import type { Crawl } from "@/types/crawler";

const POLL_INTERVAL_SECONDS = 30;

@customElement("btrix-active-crawls-badge")
@localized()
export class ActiveCrawlsBadge extends BtrixElement {
  readonly #poll = new PollTask(
    this,
    {
      task: async (_args, { signal }) => {
        return await this.getActiveCrawlsTotal(signal);
      },
      args: () => [] as const,
    },
    {
      timeoutSeconds: POLL_INTERVAL_SECONDS,
    },
  );

  render() {
    return this.#poll.render({
      whenValue: ({ total }) =>
        html`<btrix-badge variant=${total > 0 ? "primary" : "blue"}>
          ${this.localize.number(total)}
        </btrix-badge>`,
    });
  }

  private async getActiveCrawlsTotal(signal: AbortSignal) {
    const query = queryString.stringify({
      pageSize: 1,
    });

    const data = await this.api.fetch<APIPaginatedList<Crawl>>(
      `/orgs/all/crawls?${query}`,
      { signal, priority: "low" },
    );

    return data;
  }
}
