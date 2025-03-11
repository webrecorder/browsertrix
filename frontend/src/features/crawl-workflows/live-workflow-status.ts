import { localized } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Workflow } from "@/types/crawler";

export type CrawlStatusChangedEventDetail = {
  isCrawlRunning: Workflow["isCrawlRunning"];
  state: Workflow["lastCrawlState"];
};

const POLL_INTERVAL_SECONDS = 5;

/**
 * Current workflow status, displayed "live" by polling
 *
 * @fires btrix-crawl-status-changed
 */
@customElement("btrix-live-workflow-status")
@localized()
export class LiveWorkflowStatus extends BtrixElement {
  @property({ type: String })
  workflowId = "";

  private readonly workflowTask = new Task(this, {
    task: async ([workflowId], { signal }) => {
      if (!workflowId) throw new Error("required `workflowId` missing");

      try {
        const workflow = await this.getWorkflow(workflowId, signal);

        if (this.workflowTask.value) {
          if (
            this.workflowTask.value.lastCrawlState !== workflow.lastCrawlState
          ) {
            this.dispatchEvent(
              new CustomEvent<CrawlStatusChangedEventDetail>(
                "btrix-crawl-status-changed",
                {
                  detail: {
                    isCrawlRunning: workflow.isCrawlRunning,
                    state: workflow.lastCrawlState,
                  },
                },
              ),
            );
          }
        }

        return workflow;
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          console.debug("Fetch archived items aborted to throttle");
        } else {
          console.debug(e);
        }
        throw e;
      }
    },
    args: () => [this.workflowId] as const,
  });

  private readonly pollTask = new Task(this, {
    task: async ([workflow]) => {
      if (!workflow) return;

      return window.setTimeout(() => {
        void this.workflowTask.run();
      }, POLL_INTERVAL_SECONDS * 1000);
    },
    args: () => [this.workflowTask.value] as const,
  });

  disconnectedCallback(): void {
    super.disconnectedCallback();

    if (this.pollTask.value) {
      window.clearTimeout(this.pollTask.value);
    }
  }

  render() {
    const workflow = this.workflowTask.value;
    const lastCrawlState = workflow?.lastCrawlState;

    if (!workflow?.isCrawlRunning || !lastCrawlState) return;

    return guard([lastCrawlState], () => {
      return html`
        <btrix-crawl-status
          class="block"
          state=${lastCrawlState}
        ></btrix-crawl-status>
      `;
    });
  }

  private async getWorkflow(
    workflowId: string,
    signal: AbortSignal,
  ): Promise<Workflow> {
    const data: Workflow = await this.api.fetch(
      `/orgs/${this.orgId}/crawlconfigs/${workflowId}`,
      { signal },
    );
    return data;
  }
}
