import { localized } from "@lit/localize";
// import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { SearchCombobox } from "@/components/ui/search-combobox";
import type { SearchOrgContext } from "@/context/search-org";
import { searchQueryKeys, type SearchQuery } from "@/context/search-org/types";
import { WithSearchOrgContext } from "@/context/search-org/WithSearchOrgContext";

@customElement("btrix-choose-collection-name")
@localized()
export class ChooseCollectionName extends WithSearchOrgContext(
  SearchCombobox<SearchQuery>,
) {
  searchKeys = searchQueryKeys;

  searchOrgContextUpdated = async (value: SearchOrgContext) => {
    if (value.collections) {
      await this.updateComplete;
      this.fuse = value.collections;
    }
  };
}
