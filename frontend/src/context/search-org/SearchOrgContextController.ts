import { ContextProvider } from "@lit/context";
import { Task } from "@lit/task";
import { type ReactiveController } from "lit";

import { connectFuse } from "./connectFuse";
import {
  searchOrgContext,
  searchOrgInitialValue,
  type SearchOrgContext,
} from "./search-org";
import { type SearchOrgKey, type SearchQuery } from "./types";

import type { BtrixElement } from "@/classes/BtrixElement";
import type { CollectionSearchValues } from "@/types/collection";

/**
 * Provides org-wide search data to all descendents of a component.
 *
 * @example Usage:
 * ```ts
 * class Component extends BtrixElement {
 *   readonly [searchOrgContextKey] = new SearchOrgContextController(this);
 * }
 * ```
 */
export class SearchOrgContextController implements ReactiveController {
  readonly #host: BtrixElement;
  readonly #context: ContextProvider<{ __context__: SearchOrgContext }>;
  readonly #tasks = new Map<SearchOrgKey, Task>();

  constructor(host: BtrixElement) {
    this.#host = host;
    this.#context = new ContextProvider(this.#host, {
      context: searchOrgContext,
      initialValue: searchOrgInitialValue,
    });

    this.addTask("collections", this.getCollectionsSearchValues);

    host.addController(this);
  }

  hostConnected(): void {}
  hostDisconnected(): void {}

  public async refresh(key?: SearchOrgKey) {
    if (key) {
      void this.#tasks.get(key)?.run();
    } else {
      for (const [_key, task] of this.#tasks) {
        void task.run();
      }
    }
  }

  private addTask(
    key: SearchOrgKey,
    request: (orgId: string, signal: AbortSignal) => Promise<SearchQuery[]>,
  ) {
    this.#tasks.set(
      key,
      new Task(this.#host, {
        task: async ([orgId], { signal }) => {
          if (!orgId) return null;

          const values = await request(orgId, signal);

          if (signal.aborted) return;

          this.#context.setValue({
            ...this.#context.value,
            [key]: connectFuse(values),
          });
        },
        args: () => [this.#host.appState.orgId] as const,
      }),
    );
  }

  private readonly getCollectionsSearchValues = async (
    orgId: string,
    signal: AbortSignal,
  ) => {
    try {
      const { names } = await this.#host.api.fetch<CollectionSearchValues>(
        `/orgs/${orgId}/collections/search-values`,
        { signal },
      );

      return names.map((name) => ({ name }));
    } catch (err) {
      console.debug(err);
    }

    return [];
  };
}
