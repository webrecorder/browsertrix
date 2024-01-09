import { html, css, type PropertyValues } from "lit";
import { state, property, query, customElement } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import queryString from "query-string";

import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { type AuthState } from "@/utils/AuthService";
import type { CrawlState, ArchivedItem } from "@/types/crawler";
import { finishedCrawlStates } from "@/utils/crawler";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import { type SelectEvent } from "@/components/ui/search-combobox";
import { merge, remove } from "immutable";

export type FilterChangeEventDetail = Partial<ArchivedItem>;
type SearchFields = "itemName" | "workflowName" | "firstSeed";
type SortField = "finished" | "fileSize";
type SortDirection = "asc" | "desc";
type SearchValues = {
  names: string[];
  firstSeeds: string[];
  descriptions: string[];
};

const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  finished: {
    label: msg("Date Created"),
    defaultDirection: "desc",
  },
  fileSize: {
    label: msg("Size"),
    defaultDirection: "desc",
  },
};

/**
 * @fires btrix-filter-change
 */
@localized()
@customElement("btrix-item-list-controls")
export class ItemListControls extends TailwindElement {
  static styles = css``;

  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  itemType: ArchivedItem["type"] = null;

  @state()
  private searchOptions: Partial<Record<SearchFields, string>>[] = [];

  @state()
  private orderBy: {
    field: SortField;
    direction: SortDirection;
  } = {
    field: "finished",
    direction: sortableFields["finished"].defaultDirection!,
  };

  @state()
  filterBy: Partial<ArchivedItem> = {};

  private api = new APIController(this);

  // For fuzzy search:
  private readonly searchKeys: SearchFields[] = [
    "itemName",
    "workflowName",
    "firstSeed",
  ];

  private readonly fieldLabels: Record<SearchFields, string> = {
    itemName: msg("Item Name"),
    workflowName: msg("Workflow Name"),
    firstSeed: msg("Crawl Start URL"),
  };

  private get selectedSearchFilterKey() {
    return this.searchKeys.find((key) => Boolean((this.filterBy as any)[key]));
  }

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("orgId") || changedProperties.has("itemType")) {
      this.fetchSearchValues();
    }
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("filterBy")) {
      this.dispatchEvent(
        new CustomEvent<FilterChangeEventDetail>("btrix-filter-change", {
          detail: this.filterBy,
          composed: true,
        })
      );
    }
  }

  render() {
    return html`
      <div
        @sl-hide=${(e: CustomEvent) => {
          // Prevent closing dialogs when dropdowns close
          e.stopPropagation();
        }}
      >
        <div class="flex flex-wrap items-center md:justify-end gap-x-5 gap-y-3">
          <div class="flex-1">${this.renderSearch()}</div>
          ${this.renderStatusFilter()}
        </div>
        <div
          class="flex flex-wrap items-center md:justify-between gap-x-5 gap-y-3 mt-3"
        >
          ${this.renderSort()}
          <div class="flex gap-x-5 gap-y-3">
            ${this.renderCollectionToggle()} ${this.renderMineToggle()}
          </div>
        </div>
      </div>
    `;
  }

  private renderSearch() {
    const placeholder =
      this.itemType === "crawl"
        ? msg("Start typing to search crawls or workflows")
        : msg("Start typing to search uploads");
    return html`
      <btrix-search-combobox
        .searchKeys=${this.searchKeys}
        .searchOptions=${this.searchOptions}
        .keyLabels=${this.fieldLabels}
        selectedKey=${ifDefined(this.selectedSearchFilterKey)}
        placeholder=${placeholder}
        @btrix-select=${(e: SelectEvent<string>) => {
          const { key, value } = e.detail;
          if (key) {
            this.filterBy = merge(this.filterBy, { [key]: value });
          }
        }}
        @btrix-clear=${() => {
          this.filterBy = {};
        }}
      >
      </btrix-search-combobox>
    `;
  }

  private renderStatusFilter() {
    const viewOptions = finishedCrawlStates.map((state) => {
      const { icon, label } = CrawlStatus.getContent(state);
      return html`<sl-option value=${state}>${icon}${label}</sl-option>`;
    });

    return html`
      <div class="flex items-center gap-2">
        <div class="text-neutral-500">${msg("Status:")}</div>
        <sl-select
          class="flex-1 md:min-w-[15rem]"
          size="small"
          pill
          multiple
          placeholder=${msg("Any")}
          @sl-change=${async (e: CustomEvent) => {}}
        >
          ${viewOptions}
        </sl-select>
      </div>
    `;
  }

  private renderSort() {
    const options = Object.entries(sortableFields).map(
      ([value, { label }]) => html`
        <sl-option value=${value}>${label}</sl-option>
      `
    );

    return html`
      <div class="flex items-center gap-2">
        <div class="whitespace-nowrap text-neutral-500">${msg("Sort by:")}</div>
        <div class="grow flex">
          <sl-select
            class="flex-1"
            size="small"
            pill
            value=${this.orderBy.field}
            @sl-change=${async (e: CustomEvent) => {}}
          >
            ${options}
          </sl-select>
          <sl-icon-button
            name="arrow-down-up"
            label=${msg("Reverse sort")}
            @click=${() => {}}
          ></sl-icon-button>
        </div>
      </div>
    `;
  }

  private renderCollectionToggle() {
    return html`
      <label class="flex items-center gap-2">
        <div class="text-neutral-500">${msg("Show only in Collection")}</div>
        <sl-switch
          class="flex"
          size="small"
          @sl-change=${(e: CustomEvent) => {}}
        ></sl-switch>
      </label>
    `;
  }

  private renderMineToggle() {
    return html`
      <label class="flex items-center gap-2">
        <div class="text-neutral-500">${msg("Only mine")}</div>
        <sl-switch
          class="flex"
          size="small"
          @sl-change=${(e: CustomEvent) => {}}
        ></sl-switch>
      </label>
    `;
  }

  private async fetchSearchValues() {
    try {
      const query = queryString.stringify({
        crawlType: this.itemType,
      });
      const [itemsValues, workflowsValues] = await Promise.all<
        Promise<SearchValues>[]
      >([
        this.api.fetch(
          `/orgs/${this.orgId}/all-crawls/search-values?${query}`,
          this.authState!
        ),
        this.api.fetch(
          `/orgs/${this.orgId}/crawlconfigs/search-values?${query}`,
          this.authState!
        ),
      ]);

      // Update search/filter collection
      const toSearchItem = (key: SearchFields) => (value: string) => ({
        [key]: value,
      });
      this.searchOptions = [
        ...itemsValues.names.map(toSearchItem("itemName")),
        ...workflowsValues.names.map(toSearchItem("workflowName")),
        ...itemsValues.firstSeeds.map(toSearchItem("firstSeed")),
      ];
    } catch (e) {
      console.debug(e);
    }
  }
}
