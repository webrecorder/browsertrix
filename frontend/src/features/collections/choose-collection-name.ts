import { localized } from "@lit/localize";
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
  @property({ type: String })
  value = "";

  searchKeys = searchQueryKeys;
  createNew = true;

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
    if (changedProperties.has("value")) {
      this.setFormValue(this.value);
    }
  }

  protected updated(changedProperties: PropertyValues<this>): void {
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
      this.iconName = "check-lg";

      let collection: Collection | undefined = undefined;

      if (key === "name") {
        collection = await this.getCollectionByName(value);
      }

      this.dispatchEvent(
        new CustomEvent<BtrixChooseCollectionNameChangeEvent["detail"]>(
          "btrix-change",
          {
            detail: {
              value: {
                id: collection?.id || null,
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
    this.iconName = undefined;
  };

  searchOrgContextUpdated = async (value: SearchOrgContext) => {
    if (value.collections) {
      await this.updateComplete;
      this.fuse = value.collections;
    }
  };

  private async getCollectionByName(name: string, signal?: AbortSignal) {
    const query = queryString.stringify({ name, page: 1, pageSize: 1 });
    const data = await this.api.fetch<APIPaginatedList<Collection | undefined>>(
      `/orgs/${this.orgId}/collections?${query}`,
      { signal },
    );

    return data.items[0];
  }
}
