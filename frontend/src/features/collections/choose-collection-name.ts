import { localized, msg } from "@lit/localize";
import type Fuse from "fuse.js";
import type { PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import queryString from "query-string";

import {
  SearchCombobox,
  type BtrixSearchComboboxSelectEvent,
} from "@/components/ui/search-combobox";
import type { SearchOrgContext } from "@/context/search-org";
import { searchQueryKeys, type SearchQuery } from "@/context/search-org/types";
import { WithSearchOrgContext } from "@/context/search-org/WithSearchOrgContext";
import { APIController } from "@/controllers/api";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import { FormControl } from "@/mixins/FormControl";
import { validationMessageFor } from "@/strings/validation";
import type { APIPaginatedList } from "@/types/api";
import type { Collection } from "@/types/collection";
import appState from "@/utils/state";

export type BtrixChooseCollectionNameChangeEvent = BtrixChangeEvent<{
  id: string | null;
  name: string;
}>;

/**
 * @attr required
 * @attr label
 * @attr placeholder
 * @attr size
 */
@customElement("btrix-choose-collection-name")
@localized()
export class ChooseCollectionName extends WithSearchOrgContext(
  FormControl(SearchCombobox<SearchQuery>),
) {
  /**
   * Collection ID
   */
  @property({ type: String })
  value = "";

  placeholder = msg("Enter existing or new collection name");
  searchKeys = searchQueryKeys;
  createNew = true;

  private collection?: Collection;

  readonly api = new APIController(this);

  protected get orgId() {
    return appState.orgId;
  }

  connectedCallback(): void {
    super.connectedCallback();

    this.addEventListener("btrix-select", this.onSelect);
    this.addEventListener("btrix-clear", this.onClear);
  }

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("value") && this.value) {
      if (this.value !== this.collection?.id) {
        void this.fetchCollection();
      }
    }
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("value")) {
      this.setFormValue(this.value);
    }

    if (changedProperties.has("value") || changedProperties.has("required")) {
      if (this.required && !this.value) {
        this.setValidity(
          { valueMissing: true },
          validationMessageFor.valueMissing,
        );
      } else {
        this.setValidity({ valueMissing: false });
      }
    }
  }

  private readonly onSelect = async (e: BtrixSearchComboboxSelectEvent) => {
    e.stopPropagation();

    const { key, value } = e.detail.item;

    if (!value) return;

    if (!key || key === "name") {
      this.disableSearch = true;

      if (key === "name") {
        this.collection = await this.getCollectionByName(value);
      }

      await this.updateComplete;

      this.dispatchEvent(
        new CustomEvent<BtrixChooseCollectionNameChangeEvent["detail"]>(
          "btrix-change",
          {
            detail: {
              value: {
                id: this.collection?.id || null,
                name: value,
              },
            },
          },
        ),
      );
    } else {
      console.debug("unknown key for choosing collection:", key);
    }
  };

  private readonly onClear = () => {
    this.disableSearch = false;
  };

  searchOrgContextUpdated = async (context: SearchOrgContext) => {
    if (context.collections) {
      await this.updateComplete;
      this.fuse = context.collections;

      // Handle orgs without any collections
      if (
        (
          context.collections.getIndex() as Fuse.FuseIndex<unknown> & {
            // FIXME Investigate why FuseIndex type doesn't return size method
            size: () => number;
          }
        ).size() === 0
      ) {
        this.disableSearch = true;
        this.placeholder = msg("Enter new collection name");
      }
    }
  };

  private async fetchCollection() {
    this.disabled = true;

    try {
      this.collection = await this.getCollectionById(this.value);

      if (this.collection) {
        this.searchByValue = this.collection.name;
      }
    } catch (err) {
      console.debug(err);
    }

    this.disabled = false;
  }

  private async getCollectionById(id: string, signal?: AbortSignal) {
    const data = await this.api.fetch<Collection | undefined>(
      `/orgs/${this.orgId}/collections/${id}`,
      { signal },
    );

    return data;
  }

  private async getCollectionByName(name: string, signal?: AbortSignal) {
    const query = queryString.stringify({ name, page: 1, pageSize: 1 });
    const data = await this.api.fetch<APIPaginatedList<Collection | undefined>>(
      `/orgs/${this.orgId}/collections?${query}`,
      { signal },
    );

    return data.items[0];
  }
}
