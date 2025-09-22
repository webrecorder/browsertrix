import { localized } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import isEqual from "lodash/fp/isEqual";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Collection } from "@/types/collection";

import "./linked-collections-list";

/**
 * Display list of collections that are linked to a workflow or archived item by ID.
 */
@customElement("btrix-linked-collections")
@localized()
export class LinkedCollections extends BtrixElement {
  /**
   * List of collection IDs, checked against values so collection data is not
   * unnecessarily fetched if IDs have not changed
   */
  @property({ type: Array, hasChanged: (a, b) => !isEqual(a, b) })
  collectionIds: string[] = [];

  private readonly collectionsTask = new Task(this, {
    task: async ([ids], { signal }) => {
      // The API doesn't currently support getting collections by a list of IDs
      return Promise.all(ids.map(async (id) => this.getCollection(id, signal)));
    },
    args: () => [this.collectionIds] as const,
  });

  render() {
    return this.collectionsTask.render({
      complete: (items) => {
        const collections = items.filter(
          (v): v is Collection => v !== undefined,
        );

        if (!collections.length) {
          return;
        }

        return html`<btrix-linked-collections-list
          .collections=${collections}
          baseUrl="${this.navigate.orgBasePath}/collections/view"
        ></btrix-linked-collections-list>`;
      },
    });
  }

  private async getCollection(id: string, signal: AbortSignal) {
    return this.api.fetch<Collection | undefined>(
      `/orgs/${this.orgId}/collections/${id}`,
      { signal },
    );
  }
}
