import { localized } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import type {
  BtrixLoadedLinkedCollectionEvent,
  CollectionLikeItem,
} from "./types";
import { isActualCollection } from "./utils";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Collection } from "@/types/collection";
import { isNotEqual } from "@/utils/is-not-equal";

/**
 * Display list of collections that are linked to a workflow or archived item by ID.
 *
 * @fires btrix-loaded
 */
@customElement("btrix-linked-collections")
@localized()
export class LinkedCollections extends BtrixElement {
  /**
   * List of collection IDs, checked against values so collection data is not
   * unnecessarily fetched if IDs have not changed
   */
  @property({ type: Array, hasChanged: isNotEqual })
  collections: (string | CollectionLikeItem)[] = [];

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
    task: async ([collections]) => {
      // The API doesn't currently support getting collections by a list of IDs
      const collectionsWithRequest: (
        | {
            id: string;
            request: Promise<CollectionLikeItem>;
          }
        | CollectionLikeItem
      )[] = [];

      collections.forEach(async (collOrId) => {
        const idIsString = typeof collOrId === "string";

        if (idIsString || !isActualCollection(collOrId)) {
          const id = idIsString ? collOrId : collOrId.id;

          // Render async list that requests collection data
          let request = this.collectionsMap.get(id);

          if (!request) {
            request = this.fetchCollection(
              id,
              this.collectionsTaskController.signal,
            );

            this.collectionsMap.set(id, request);
          }

          collectionsWithRequest.push({ id, request });

          void request.then((item) => {
            this.dispatchEvent(
              new CustomEvent<BtrixLoadedLinkedCollectionEvent["detail"]>(
                "btrix-loaded",
                {
                  detail: { item },
                },
              ),
            );
          });
        } else {
          collectionsWithRequest.push(collOrId);
        }
      });

      return collectionsWithRequest;
    },
    args: () => [this.collections] as const,
  });

  render() {
    const collections =
      this.collectionsTask.value ||
      this.collections.map((collOrId) =>
        typeof collOrId === "string" ? { id: collOrId } : collOrId,
      );

    return html`<btrix-linked-collections-list
      aria-live="polite"
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
