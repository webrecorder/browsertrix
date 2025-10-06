import { ContextProvider } from "@lit/context";
import { Task } from "@lit/task";
import Fuse from "fuse.js";
import type { ReactiveController } from "lit";

import type { BtrixElement } from "@/classes/BtrixElement";
import {
  collectionQueryContext,
  type CollectionQueryContext,
} from "@/features/collections/context/collectionQuery";
import type { CollectionSearchValues } from "@/types/collection";

/**
 * Provide searchable client db of collections.
 * Currently only supports querying by name.
 */
export class CollectionQueryProvider implements ReactiveController {
  private readonly host: BtrixElement;
  readonly #searchValuesTask: Task;
  readonly #dbProvider: ContextProvider<
    { __context__: CollectionQueryContext },
    BtrixElement
  >;

  constructor(host: CollectionQueryProvider["host"]) {
    this.host = host;
    this.#searchValuesTask = new Task(this.host, {
      task: async (_args, { signal }) => {
        const { names } = await this.getSearchValues(signal);

        if (signal.aborted) return;

        const fuse = new Fuse(
          names.map((name) => ({ name })),
          {
            keys: ["name"],
            threshold: 0.4,
            minMatchCharLength: 2,
          },
        );

        this.#dbProvider.setValue(
          Object.assign(fuse, {
            get records() {
              return fuse.getIndex().toJSON().records;
            },
          }),
        );
      },
      args: () => [] as const,
    });
    this.#dbProvider = new ContextProvider(this.host, {
      context: collectionQueryContext,
    });

    host.addController(this);
  }

  hostConnected(): void {}
  hostDisconnected(): void {
    this.#searchValuesTask.abort();
  }

  public async refresh() {
    return this.#searchValuesTask.run();
  }

  private async getSearchValues(signal: AbortSignal) {
    return await this.host.api.fetch<CollectionSearchValues>(
      `/orgs/${this.host.appState.orgId}/collections/search-values`,
      { signal },
    );
  }
}
