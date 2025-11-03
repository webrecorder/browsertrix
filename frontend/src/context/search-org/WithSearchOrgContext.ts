import { ContextConsumer, type ContextCallback } from "@lit/context";
import type { LitElement } from "lit";
import type { Constructor } from "type-fest";

import {
  searchOrgContext,
  searchOrgInitialValue,
  type SearchOrgContext,
} from "./search-org";
import type { SearchOrgKey } from "./types";

/**
 * Consume search data.
 *
 * @example Usage:
 * ```ts
 * class Component extends WithSearchOrgContext(BtrixElement) {}
 * ```
 */
export const WithSearchOrgContext = <T extends Constructor<LitElement>>(
  superClass: T,
) =>
  class extends superClass {
    protected searchOrgContextUpdated: ContextCallback<SearchOrgContext> =
      () => {};

    readonly #searchOrg = new ContextConsumer(this, {
      context: searchOrgContext,
      callback: (value) => {
        this.searchOrgContextUpdated(value);
      },
      subscribe: true,
    });

    public get searchOrg() {
      return this.#searchOrg.value || searchOrgInitialValue;
    }

    public listSearchValuesFor(key: SearchOrgKey) {
      return this.searchOrg[key]?.getIndex().toJSON().records || null;
    }
  };
