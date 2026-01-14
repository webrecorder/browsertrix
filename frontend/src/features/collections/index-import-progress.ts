import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Collection } from "@/types/collection";

const getPollInterval = (crawlCount: number) =>
  crawlCount < 10 ? 5 : crawlCount < 100 ? 10 : crawlCount < 1000 ? 30 : 60;

/**
 * Live progress of deduplication index import
 */
@customElement("btrix-index-import-progress")
@localized()
export class IndexImportProgress extends BtrixElement {
  @property({ type: String })
  collectionId = "";

  @property({ type: Number })
  initialValue?: number;

  private pollInterval = 5;

  private readonly progressTask = new Task(this, {
    task: async ([collectionId], { signal }) => {
      const collection = await this.getCollection(collectionId, signal);

      this.pollInterval = getPollInterval(collection.crawlCount);

      console.log("this.pollInterval:", this.pollInterval);

      return collection.indexStats?.updateProgress || 0;
    },
    args: () => [this.collectionId] as const,
  });

  private readonly pollTask = new Task(this, {
    task: async () => {
      window.clearTimeout(this.pollTask.value);

      return window.setTimeout(() => {
        void this.progressTask.run();
      }, this.pollInterval * 1000);
    },
    args: () => [this.progressTask.value] as const,
  });

  disconnectedCallback(): void {
    super.disconnectedCallback();

    window.clearTimeout(this.pollTask.value);
  }

  render() {
    return this.progressTask.render({
      initial: () => this.renderBar(this.initialValue),
      pending: () =>
        this.renderBar(this.initialValue || this.progressTask.value),
      complete: this.renderBar,
    });
  }

  private readonly renderBar = (value?: number) => {
    const noValue = value === undefined;

    return html`
      <sl-tooltip
        content=${!noValue && `${value.toFixed(0)}%`}
        ?disabled=${noValue}
      >
        <sl-progress-bar
          class="mb-0.5 mt-1.5"
          value=${ifDefined(noValue ? undefined : value * 100)}
          label=${msg("Index Import Progress")}
          ?indeterminate=${noValue}
        ></sl-progress-bar>
      </sl-tooltip>
    `;
  };

  private async getCollection(collectionId: string, signal: AbortSignal) {
    return this.api.fetch<Collection>(
      `/orgs/${this.orgId}/collections/${collectionId}`,
      { signal },
    );
  }
}
