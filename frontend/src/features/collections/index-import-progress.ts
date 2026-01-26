import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Collection } from "@/types/collection";
import { indexUpdating } from "@/utils/dedupe";

const getPollInterval = (crawlCount: number) =>
  crawlCount < 10 ? 5 : crawlCount < 100 ? 10 : crawlCount < 1000 ? 30 : 60;

/**
 * Live progress of deduplication index import
 *
 * @fires btrix-progress-complete
 */
@customElement("btrix-index-import-progress")
@localized()
export class IndexImportProgress extends BtrixElement {
  @property({ type: String })
  collectionId = "";

  @property({ type: Number })
  initialValue?: number;

  @property({ type: Boolean })
  live = false;

  private pollInterval = 5;

  private readonly progressTask = new Task(this, {
    task: async ([live, collectionId], { signal }) => {
      if (!live) return this.initialValue;

      const collection = await this.getCollection(collectionId, signal);

      this.pollInterval = getPollInterval(collection.crawlCount);

      return indexUpdating(collection.indexState)
        ? collection.indexStats?.updateProgress
        : undefined;
    },
    args: () => [this.live, this.collectionId] as const,
  });

  private readonly pollTask = new Task(this, {
    task: async ([live, progress]) => {
      window.clearTimeout(this.pollTask.value);

      if (!live) return;

      if (progress === 1) {
        this.dispatchEvent(new CustomEvent("btrix-progress-complete"));
        return;
      }

      return window.setTimeout(() => {
        void this.progressTask.run();
      }, this.pollInterval * 1000);
    },
    args: () => [this.live, this.progressTask.value] as const,
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
