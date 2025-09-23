import { localized } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import isEqual from "lodash/fp/isEqual";

import type { CollectionLikeItem } from "./linked-collections-list";

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

  @property({ type: Boolean })
  removable?: boolean;

  // Use a custom abort controller rather than the one provided by `Task`
  // to only abort on disconnect
  private collectionsTaskController = new AbortController();

  private readonly collectionsMap = new Map<
    string,
    Promise<CollectionLikeItem>
  >();

  disconnectedCallback(): void {
    this.collectionsTaskController.abort();
    super.disconnectedCallback();
  }

  connectedCallback(): void {
    this.collectionsTaskController = new AbortController();
    super.connectedCallback();
  }

  private readonly collectionsTask = new Task(this, {
    task: async ([ids]) => {
      // The API doesn't currently support getting collections by a list of IDs
      const requests: Promise<CollectionLikeItem>[] = [];

      ids.forEach(async (id) => {
        let request = this.collectionsMap.get(id);

        if (!request) {
          request = this.fetchCollection(
            id,
            this.collectionsTaskController.signal,
          );

          this.collectionsMap.set(id, request);
        }

        requests.push(request);
      });

      return await Promise.all(requests);
    },
    args: () => [this.collectionIds] as const,
  });

  render() {
    const collections =
      this.collectionsTask.value || this.collectionIds.map((id) => ({ id }));

    return html`<btrix-linked-collections-list
      .collections=${collections}
      baseUrl="${this.navigate.orgBasePath}/collections/view"
      ?removable=${this.removable}
    ></btrix-linked-collections-list>`;
  }

  private async fetchCollection(id: string, signal: AbortSignal) {
    try {
      return await this.api.fetch<Collection>(
        `/orgs/${this.orgId}/collections/${id}`,
        { signal },
      );
    } catch {
      return { id };
    }
  }
}
