import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import isEqual from "lodash/fp/isEqual";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Collection } from "@/types/collection";
import { pluralOf } from "@/utils/pluralize";

/**
 * Display list of collections that are linked to a workflow or archived item by ID.
 */
@customElement("btrix-linked-collections-list")
@localized()
export class LinkedCollectionsList extends BtrixElement {
  /**
   * List of collection IDs, checked against values so collection data is not
   * unnecessarily fetched if IDs have not changed
   */
  @property({ type: Array, hasChanged: (a, b) => !isEqual(a, b) })
  collectionIds: string[] = [];

  private readonly collectionsTask = new Task(this, {
    task: async ([ids], { signal }) => {
      return Promise.all(ids.map(async (id) => this.getCollection(id, signal)));
    },
    args: () => [this.collectionIds] as const,
  });

  render() {
    return this.collectionsTask.render({
      complete: this.renderList,
    });
  }

  private readonly renderList = (items: (Collection | undefined)[]) => {
    const collections = items.filter((v): v is Collection => v !== undefined);

    if (!collections.length) {
      return;
    }

    return html`<ul class="divide-y rounded border">
      ${collections.map(
        (col) =>
          html`<li class="flex items-center">
            <div class="flex-1 p-1.5 leading-none">${col.name}</div>
            <div class="flex-none">
              <btrix-badge pill variant="cyan"
                >${col.crawlCount}
                ${pluralOf("items", col.crawlCount)}</btrix-badge
              >
            </div>
            <div class="flex-none">
              <sl-tooltip placement="right" content=${msg("Open in New Tab")}>
                <sl-icon-button
                  name="arrow-up-right"
                  href="${this.navigate.orgBasePath}/collections/view/${col.id}"
                  target="_blank"
                >
                </sl-icon-button>
              </sl-tooltip>
            </div>
          </li>`,
      )}
    </ul>`;
  };

  private async getCollection(id: string, signal: AbortSignal) {
    return this.api.fetch<Collection | undefined>(
      `/orgs/${this.orgId}/collections/${id}`,
      { signal },
    );
  }
}
