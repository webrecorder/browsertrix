import { localized } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement } from "lit/decorators.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
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

  private readonly pollTask = new Task(this, {
    task: async () => {
      window.clearTimeout(this.pollTask.value);

      return window.setTimeout(() => {
        void this.activeCrawlsTotalTask.run();
      }, POLL_INTERVAL_SECONDS * 1000);
    },
    args: () => [this.activeCrawlsTotalTask.value] as const,
  });

  disconnectedCallback(): void {
    super.disconnectedCallback();

    window.clearTimeout(this.pollTask.value);
  }

  render() {
    if (this.activeCrawlsTotalTask.value) {
      const { total } = this.activeCrawlsTotalTask.value;
      return html`<btrix-badge variant=${total > 0 ? "primary" : "blue"}>
        ${this.localize.number(total)}
      </btrix-badge>`;
    }
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
