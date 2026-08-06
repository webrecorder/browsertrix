import { localized, msg } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import queryString from "query-string";
import { type ArrayValues } from "type-fest";

import { CrawlStatus } from "../archived-items/crawl-status";

import { BtrixElement } from "@/classes/BtrixElement";
import PollTask from "@/controllers/poll";
import { pluralOfActiveCrawls } from "@/plurals/active-crawls";
import { OrgTab, WorkflowTab } from "@/routes";
import {
  PAUSED_STATES,
  RUNNING_STATES,
  WAITING_NOT_PAUSED_STATES,
} from "@/types/crawlState";
import { type RunningWorkflowCounts } from "@/types/workflow";
import { activeCrawlStates } from "@/utils/crawler";

const POLL_INTERVAL_SECONDS = 60;
const RUNNING_POLL_INTERVAL_SECONDS = 30;

type TotalsDetail = {
  key: keyof RunningWorkflowCounts;
  states: readonly ArrayValues<typeof activeCrawlStates>[];
  label: string;
};
const totalsByStatus = [
  { key: "totalRunning", states: RUNNING_STATES, label: msg("Running") },
  { key: "totalPaused", states: PAUSED_STATES, label: msg("Paused") },
  {
    key: "totalWaiting",
    states: WAITING_NOT_PAUSED_STATES,
    label: msg("Waiting"),
  },
] satisfies TotalsDetail[];

@customElement("btrix-org-active-crawls-status")
@localized()
export class OrgActiveCrawlsStatus extends BtrixElement {
  readonly #lastUpdated?: Date;

  readonly #poll = new PollTask(this, {
    task: async (_args, { signal }) => {
      try {
        const data = await this.api.fetch<RunningWorkflowCounts>(
          `/orgs/${this.orgId}/crawlconfigs/running`,
          { signal, priority: "low" },
        );

        if (data.totalWaiting || data.totalRunning) {
          // Poll more often
          this.#poll.setOptions({
            timeoutSeconds: RUNNING_POLL_INTERVAL_SECONDS,
          });
        } else {
          this.#poll.setOptions({ timeoutSeconds: POLL_INTERVAL_SECONDS });
        }

        this.#lastUpdated = new Date();

        return data;
      } catch (err) {
        console.debug(err);

        if (!signal.aborted) {
          throw err;
        }
      }
    },
    args: () => [this.orgId] as const,
    timeoutSeconds: POLL_INTERVAL_SECONDS,
  });

  render() {
    if (!(this.#poll.value || this.#poll.previousValue) && this.#poll.error) {
      return html`<btrix-popover
        content=${msg(
          "Could not retrieve number of active crawls at this time.",
        )}
      >
        <sl-icon
          name="exclamation-diamond"
          class="text-base text-neutral-500"
        ></sl-icon>
      </btrix-popover>`;
    }

    const href = this.getLink(activeCrawlStates);

    return this.#poll.render((value) =>
      value?.totalRunningPausedWaiting
        ? html`
            <btrix-popover-menu>
              <sl-button
                slot="trigger"
                size="small"
                class="part-[base]:border-success-300 part-[base]:bg-gradient-to-br part-[base]:from-success-100 part-[base]:to-success-50 part-[label]:font-medium part-[label]:text-success-700 part-[prefix]:text-success-500 hover:part-[base]:border-success-200 hover:part-[label]:text-success-600"
                href=${href}
                @click=${this.navigate.link}
              >
                <sl-icon slot="prefix" name="dot" library="app"></sl-icon>
                <span class="hidden md:inline"
                  >${pluralOfActiveCrawls(
                    value.totalRunningPausedWaiting,
                  )}</span
                >
                <span class="md:hidden"
                  >${this.localize.number(value.totalRunningPausedWaiting, {
                    notation: "compact",
                  })}</span
                >
              </sl-button>
              ${this.renderMenu(value)}
            </btrix-popover-menu>
          `
        : nothing,
    );
  }

  private getLink(states: readonly ArrayValues<typeof activeCrawlStates>[]) {
    const query = queryString.stringify({
      // TODO Replace with grouped status
      // https://github.com/webrecorder/browsertrix/issues/3540
      status: states,
    });
    return `${
      this.navigate.orgBasePath
    }/${OrgTab.Workflows}/${WorkflowTab.Crawls}?${query}`;
  }

  private renderMenu(counts: RunningWorkflowCounts) {
    const row = ({ key, states, label }: TotalsDetail) => {
      const value = counts[key];

      if (!value) return;

      const detail = CrawlStatus.getContent({ state: states[0] });
      const link = this.getLink(states);

      return html`<btrix-menu-item-link
        class="part-[checked-icon]:w-2 part-[submenu-icon]:w-2"
        href=${link}
      >
        <sl-icon
          slot="prefix"
          name="dot"
          library="app"
          style=${styleMap({
            color: detail.cssColor,
          })}
        ></sl-icon>
        <div class="min-w-[10ch]">${label}</div>
        <span slot="suffix" class="flex items-center gap-2">
          <span>${this.localize.number(value)}</span>
          <sl-icon name="arrow-right-short" class="text-neutral-500"></sl-icon>
        </span>
      </btrix-menu-item-link>`;
    };

    return html`<sl-menu>
      ${totalsByStatus.map(row)}
      ${this.#poll.render({
        error: () =>
          html`<sl-divider></sl-divider>
            <sl-menu-label
              class="part-[base]:px-3.5 part-[base]:text-xs part-[base]:font-normal"
            >
              ${this.#lastUpdated
                ? `${msg("Last updated:")} ${this.localize.date(this.#lastUpdated, { timeStyle: "long" })}`
                : msg("Counts may be out of date")}
            </sl-menu-label> `,
      })}
    </sl-menu>`;
  }
}
