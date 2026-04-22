import { localized, msg } from "@lit/localize";
import { customElement, property } from "lit/decorators.js";

import { SearchCombobox } from "@/components/ui/search-combobox";

export type SearchFields = "id" | "name" | "firstSeed";

@customElement("btrix-workflow-search")
@localized()
export class WorkflowSearch extends SearchCombobox<{ [x: string]: string }> {
  static FieldLabels: Record<SearchFields, string> = {
    id: msg("ID"),
    name: msg("Name"),
    firstSeed: msg("Crawl Start URL"),
  };

  @property({ type: Array })
  searchOptions: { [x: string]: string }[] = [];

  @property({ type: String })
  selectedKey?: string;

  readonly searchKeys = ["id", "name", "firstSeed"];
  readonly keyLabels = WorkflowSearch.FieldLabels;

  placeholder = msg("Search by workflow name or crawl start URL");
}
