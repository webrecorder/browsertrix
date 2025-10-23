import { localized, msg } from "@lit/localize";
import { customElement, property } from "lit/decorators.js";

import { SearchCombobox } from "@/components/ui/search-combobox";

export type SearchFields = "name" | "firstSeed";

@customElement("btrix-workflow-search")
@localized()
export class WorkflowSearch extends SearchCombobox<{ [x: string]: string }> {
  static FieldLabels: Record<SearchFields, string> = {
    name: msg("Name"),
    firstSeed: msg("Crawl Start URL"),
  };

  @property({ type: Array })
  searchOptions: { [x: string]: string }[] = [];

  @property({ type: String })
  selectedKey?: string;

  readonly searchKeys = ["name", "firstSeed"];
  readonly keyLabels = WorkflowSearch.FieldLabels;

  placeholder = msg("Search by workflow name or crawl start URL");
}
