import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlSelect } from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { Crawl, Workflow } from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import {
  type BtrixFilterChipChangeEvent,
  type FilterChip,
} from "@/components/ui/filter-chip";
import {
  parsePage,
  type PageChangeEvent,
  type Pagination,
} from "@/components/ui/pagination";
import { ClipboardController } from "@/controllers/clipboard";
import { SearchParamsValue } from "@/controllers/searchParamsValue";
import { type BtrixChangeArchivedItemStateFilterEvent } from "@/features/archived-items/archived-item-state-filter";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import { OrgTab } from "@/routes";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { CrawlState } from "@/types/crawlState";
import { isApiError } from "@/utils/api";
import { isActive, isSuccessfullyFinished } from "@/utils/crawler";

type Crawls = APIPaginatedList<Crawl>;
type SearchFields = "name" | "firstSeed";
type SortField = "started" | "finished" | "fileSize";
const SORT_DIRECTIONS = ["asc", "desc"] as const;
type SortDirection = (typeof SORT_DIRECTIONS)[number];

type Keys<T> = (keyof T)[];

const POLL_INTERVAL_SECONDS = 5;
const INITIAL_PAGE_SIZE = 20;
const FILTER_BY_CURRENT_USER_STORAGE_KEY = "btrix.filterByCurrentUser.crawls";
const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  started: {
    label: msg("Date Started"),
    defaultDirection: "desc",
  },
  finished: {
    label: msg("Date Finished"),
    defaultDirection: "desc",
  },
  fileSize: {
    label: msg("Size"),
    defaultDirection: "desc",
  },
};

type SortBy = {
  field: SortField;
  direction: SortDirection;
};
const DEFAULT_SORT_BY: SortBy = {
  field: "started",
  direction: sortableFields["started"].defaultDirection!,
};

type FilterBy = {
  name?: string;
  firstSeed?: string;
  state?: CrawlState[];
};

@customElement("btrix-org-crawls")
@localized()
export class OrgCrawls extends BtrixElement {
  static FieldLabels: Record<SearchFields, string> = {
    name: msg("Name"),
    firstSeed: msg("Crawl Start URL"),
  };

  @property({ type: Boolean })
  isCrawler!: boolean;

  @property({ type: String })
  itemType: Crawl["type"] | null = null;

  @state()
  private pagination: Required<APIPaginationQuery> = {
    page: parsePage(new URLSearchParams(location.search).get("page")),
    pageSize: INITIAL_PAGE_SIZE,
  };

  @query("btrix-pagination")
  private readonly paginationElement?: Pagination;

  @state()
  private searchOptions: Record<string, string>[] = [];

  @state()
  private readonly orderBy = new SearchParamsValue<SortBy>(
    this,
    (value, params) => {
      if (value.field === DEFAULT_SORT_BY.field) {
        params.delete("sortBy");
      } else {
        params.set("sortBy", value.field);
      }
      if (value.direction === sortableFields[value.field].defaultDirection) {
        params.delete("sortDir");
      } else {
        params.set("sortDir", value.direction);
      }
      return params;
    },
    (params) => {
      const field = params.get("sortBy") as SortBy["field"] | null;
      if (!field) {
        return DEFAULT_SORT_BY;
      }
      let direction = params.get("sortDir");
      if (
        !direction ||
        (SORT_DIRECTIONS as readonly string[]).includes(direction)
      ) {
        direction =
          sortableFields[field].defaultDirection || DEFAULT_SORT_BY.direction;
      }
      return { field, direction: direction as SortDirection };
    },
  );
  private readonly filterByCurrentUser = new SearchParamsValue<boolean>(
    this,
    (value, params) => {
      if (value) {
        params.set("mine", "true");
      } else {
        params.delete("mine");
      }
      return params;
    },
    (params) => params.get("mine") === "true",
    {
      initial: (initialValue) =>
        window.sessionStorage.getItem(FILTER_BY_CURRENT_USER_STORAGE_KEY) ===
          "true" ||
        initialValue ||
        false,
    },
  );
  private readonly filterByTags = new SearchParamsValue<string[] | undefined>(
    this,
    (value, params) => {
      params.delete("tags");
      value?.forEach((v) => {
        params.append("tags", v);
      });
      return params;
    },
    (params) => params.getAll("tags"),
  );

  private readonly filterByTagsType = new SearchParamsValue<"and" | "or">(
    this,
    (value, params) => {
      if (value === "and") {
        params.set("tagsType", value);
      } else {
        params.delete("tagsType");
      }
      return params;
    },
    (params) => (params.get("tagsType") === "and" ? "and" : "or"),
  );

  private readonly filterBy = new SearchParamsValue<FilterBy>(
    this,
    (value, params) => {
      const keys = ["name", "firstSeed", "state"] as (keyof FilterBy)[];
      keys.forEach((key) => {
        if (value[key] == null) {
          params.delete(key);
        } else {
          switch (key) {
            case "firstSeed":
            case "name":
              params.set(key, value[key]);
              break;
            case "state":
              params.delete("status");
              value[key].forEach((state) => {
                params.append("status", state);
              });
              break;
          }
        }
      });
      return params;
    },
    (params) => {
      const state = params.getAll("status") as CrawlState[];

      return {
        name: params.get("name") ?? undefined,
        firstSeed: params.get("firstSeed") ?? undefined,
        state: state.length ? state : undefined,
      };
    },
  );

  @state()
  private itemToEdit: Crawl | null = null;

  @state()
  private isEditingItem = false;

  @state()
  private itemToDelete: Crawl | null = null;

  @state()
  private isDeletingItem = false;

  @query("#stateSelect")
  stateSelect?: SlSelect;

  private get hasFiltersSet() {
    return [
      this.filterBy.value.firstSeed,
      this.filterBy.value.name,
      this.filterBy.value.state?.length || undefined,
      this.filterByCurrentUser.value || undefined,
      this.filterByTags.value?.length || undefined,
    ].some((v) => v !== undefined);
  }

  private clearFilters() {
    this.filterBy.setValue({
      ...this.filterBy.value,
      firstSeed: undefined,
      name: undefined,
      state: undefined,
    });
    this.filterByCurrentUser.setValue(false);
    this.filterByTags.setValue(undefined);
  }

  private readonly archivedItemsTask = new Task(this, {
    task: async (
      [
        itemType,
        pagination,
        orderBy,
        filterBy,
        filterByCurrentUser,
        filterByTags,
        filterByTagsType,
      ],
      { signal },
    ) => {
      try {
        const data = await this.getArchivedItems(
          {
            itemType,
            pagination,
            orderBy,
            filterBy,
            filterByCurrentUser,
            filterByTags,
            filterByTagsType,
          },
          signal,
        );

        if (this.getArchivedItemsTimeout) {
          window.clearTimeout(this.getArchivedItemsTimeout);
        }

        this.getArchivedItemsTimeout = window.setTimeout(() => {
          void this.archivedItemsTask.run();
        }, POLL_INTERVAL_SECONDS * 1000);

        return data;
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          console.debug("Fetch crawls aborted to throttle");
        } else {
          this.notify.toast({
            message: msg("Sorry, couldn’t retrieve crawl runs at this time."),
            variant: "danger",
            icon: "exclamation-octagon",
            id: "archived-item-fetch-error",
          });
        }
        throw e;
      }
    },
    args: () =>
      // TODO consolidate filters into single fetch params
      [
        this.itemType,
        this.pagination,
        this.orderBy.value,
        this.filterBy.value,
        this.filterByCurrentUser.value,
        this.filterByTags.value,
        this.filterByTagsType.value,
      ] as const,
  });

  private getArchivedItemsTimeout?: number;

  // For fuzzy search:
  private readonly searchKeys = ["name", "firstSeed"];

  private get selectedSearchFilterKey() {
    return (
      Object.keys(OrgCrawls.FieldLabels) as Keys<typeof OrgCrawls.FieldLabels>
    ).find((key) => Boolean(this.filterBy.value[key]));
  }

  constructor() {
    super();
    this.filterByCurrentUser.setValue(
      window.sessionStorage.getItem(FILTER_BY_CURRENT_USER_STORAGE_KEY) ===
        "true",
    );
  }

  protected willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (
      changedProperties.has("filterByCurrentUser.value") ||
      changedProperties.has("filterBy.value") ||
      changedProperties.has("orderBy.value") ||
      changedProperties.has("itemType") ||
      changedProperties.has("filterByTags.value") ||
      changedProperties.has("filterByTagsType.value")
    ) {
      if (
        changedProperties.has("itemType") &&
        changedProperties.get("itemType")
      ) {
        this.filterBy.setValue({});
        this.orderBy.setValue({
          field: "finished",
          direction: sortableFields["finished"].defaultDirection!,
        });
      }
      this.paginationElement?.setPage(1, { dispatch: true, replace: true });

      if (changedProperties.has("filterByCurrentUser")) {
        window.sessionStorage.setItem(
          FILTER_BY_CURRENT_USER_STORAGE_KEY,
          this.filterByCurrentUser.value.toString(),
        );
      }
    }

    if (changedProperties.has("itemType")) {
      void this.fetchConfigSearchValues();
    }
  }

  disconnectedCallback(): void {
    window.clearTimeout(this.getArchivedItemsTimeout);
    super.disconnectedCallback();
  }

  render() {
    return html`
      <main>
        <div class="sticky top-2 z-10 mb-3 rounded-lg border bg-neutral-50 p-4">
          ${this.renderControls()}
        </div>

        ${this.archivedItemsTask.render({
          initial: () => html`
            <div class="my-12 flex w-full items-center justify-center text-2xl">
              <sl-spinner></sl-spinner>
            </div>
          `,
          pending: () =>
            // TODO differentiate between pending between poll and
            // pending from user action, in order to show loading indicator
            this.archivedItemsTask.value
              ? // Render previous value while latest is loading
                this.renderArchivedItems(this.archivedItemsTask.value)
              : nothing,
          complete: this.renderArchivedItems,
        })}
      </main>
    `;
  }

  private readonly renderArchivedItems = ({
    items,
    page,
    total,
    pageSize,
  }: APIPaginatedList<Crawl>) => html`
    <section class="mx-2">
      ${items.length
        ? html`
            <btrix-crawl-list>
              <btrix-table-header-cell slot="actionCell" class="p-0">
                <span class="sr-only">${msg("Row actions")}</span>
              </btrix-table-header-cell>
              ${repeat(items, ({ id }) => id, this.renderArchivedItem)}
            </btrix-crawl-list>
          `
        : this.renderEmptyState()}
    </section>
    ${when(
      total > pageSize,
      () => html`
        <footer class="mt-6 flex justify-center">
          <btrix-pagination
            page=${page}
            totalCount=${total}
            size=${pageSize}
            @page-change=${async (e: PageChangeEvent) => {
              this.pagination = {
                ...this.pagination,
                page: e.detail.page,
              };
              await this.updateComplete;

              // Scroll to top of list
              // TODO once deep-linking is implemented, scroll to top of pushstate
              this.scrollIntoView({ behavior: "smooth" });
            }}
          ></btrix-pagination>
        </footer>
      `,
    )}
    ${this.itemToEdit
      ? html`
          <btrix-item-metadata-editor
            .crawl=${this.itemToEdit}
            ?open=${this.isEditingItem}
            @request-close=${() => (this.isEditingItem = false)}
            @updated=${() => {
              /* TODO fetch current page or single crawl */
              void this.archivedItemsTask.run();
            }}
          ></btrix-item-metadata-editor>
        `
      : nothing}

    <btrix-dialog
      .label=${msg("Delete Archived Item?")}
      .open=${this.isDeletingItem}
      @sl-after-hide=${() => (this.isDeletingItem = false)}
    >
      ${msg("This item will be removed from any Collection it is a part of.")}
      ${when(this.itemToDelete?.type === "crawl", () =>
        msg(
          "All files and logs associated with this item will also be deleted, and the crawl will no longer be visible in its associated Workflow.",
        ),
      )}
      <div slot="footer" class="flex justify-between">
        <sl-button size="small" .autofocus=${true}>${msg("Cancel")}</sl-button>
        <sl-button
          size="small"
          variant="danger"
          @click=${async () => {
            this.isDeletingItem = false;
            if (this.itemToDelete) {
              await this.deleteItem(this.itemToDelete);
            }
          }}
          >${msg("Delete Crawl")}</sl-button
        >
      </div>
    </btrix-dialog>
  `;

  private renderControls() {
    return html`
      <div class="flex flex-wrap items-center gap-2 md:gap-4">
        <div class="grow basis-1/2">${this.renderSearch()}</div>

        <div class="flex items-center">
          <label
            class="mr-2 whitespace-nowrap text-sm text-neutral-500"
            for="sort-select"
          >
            ${msg("Sort by:")}
          </label>
          ${this.renderSortControl()}
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="whitespace-nowrap text-sm text-neutral-500">
            ${msg("Filter by:")}
          </span>
          <btrix-archived-item-state-filter
            .states=${this.filterBy.value.state}
            showUnfinishedStates
            @btrix-change=${(e: BtrixChangeArchivedItemStateFilterEvent) => {
              this.filterBy.setValue({
                ...this.filterBy.value,
                state: e.detail.value,
              });
            }}
          ></btrix-archived-item-state-filter>

          ${this.userInfo?.id
            ? html`<btrix-filter-chip
                ?checked=${this.filterByCurrentUser.value}
                @btrix-change=${(e: BtrixFilterChipChangeEvent) => {
                  const { checked } = e.target as FilterChip;
                  this.filterByCurrentUser.setValue(Boolean(checked));
                }}
              >
                ${msg("Mine")}
              </btrix-filter-chip> `
            : ""}
          ${when(
            this.hasFiltersSet,
            () => html`
              <sl-button
                class="[--sl-color-primary-600:var(--sl-color-neutral-500)] part-[label]:font-medium"
                size="small"
                variant="text"
                @click=${this.clearFilters}
              >
                <sl-icon slot="prefix" name="x-lg"></sl-icon>
                ${msg("Clear All")}
              </sl-button>
            `,
          )}
        </div>
      </div>
    `;
  }

  private renderSortControl() {
    const options = Object.entries(sortableFields).map(
      ([value, { label }]) => html`
        <sl-option value=${value}>${label}</sl-option>
      `,
    );
    return html`
      <sl-select
        id="sort-select"
        class="flex-1 md:min-w-[9.2rem]"
        size="small"
        pill
        value=${this.orderBy.value.field}
        @sl-change=${(e: Event) => {
          const field = (e.target as HTMLSelectElement).value as SortField;
          this.orderBy.setValue({
            field: field,
            direction:
              sortableFields[field].defaultDirection ||
              this.orderBy.value.direction,
          });
        }}
      >
        ${options}
      </sl-select>
      <sl-tooltip
        content=${this.orderBy.value.direction === "asc"
          ? msg("Sort in descending order")
          : msg("Sort in ascending order")}
      >
        <sl-icon-button
          name=${this.orderBy.value.direction === "asc"
            ? "sort-up-alt"
            : "sort-down"}
          class="text-base"
          label=${this.orderBy.value.direction === "asc"
            ? msg("Sort Descending")
            : msg("Sort Ascending")}
          @click=${() => {
            this.orderBy.setValue({
              ...this.orderBy.value,
              direction:
                this.orderBy.value.direction === "asc" ? "desc" : "asc",
            });
          }}
        ></sl-icon-button>
      </sl-tooltip>
    `;
  }

  private renderSearch() {
    return html`
      <btrix-search-combobox
        .searchKeys=${this.searchKeys}
        .searchOptions=${this.searchOptions}
        .keyLabels=${OrgCrawls.FieldLabels}
        selectedKey=${ifDefined(this.selectedSearchFilterKey)}
        searchByValue=${ifDefined(
          this.selectedSearchFilterKey &&
            this.filterBy.value[this.selectedSearchFilterKey],
        )}
        placeholder=${msg("Search crawls by name or start URL")}
        @btrix-select=${(e: CustomEvent) => {
          const { key, value } = e.detail;
          this.filterBy.setValue({
            ...this.filterBy.value,
            [key]: value,
          });
        }}
        @btrix-clear=${() => {
          const {
            name: _name,
            firstSeed: _firstSeed,
            ...otherFilters
          } = this.filterBy.value;
          this.filterBy.setValue(otherFilters);
        }}
      >
      </btrix-search-combobox>
    `;
  }

  private readonly renderArchivedItem = (crawl: Crawl) => html`
    <btrix-crawl-list-item
      href=${`${this.navigate.orgBasePath}/${OrgTab.Workflows}/${crawl.cid}/crawls`}
      .crawl=${crawl}
    >
      <sl-menu slot="menu">
        <sl-menu-item
          @click=${() => ClipboardController.copyToClipboard(crawl.id)}
        >
          <sl-icon name="copy" slot="prefix"></sl-icon>
          ${msg("Copy Crawl ID")}
        </sl-menu-item>
        ${when(
          this.isCrawler && !isActive(crawl),
          () => html`
            <sl-divider></sl-divider>
            <sl-menu-item
              style="--sl-color-neutral-700: var(--danger)"
              @click=${() => {
                // this.confirmDeleteCrawl(crawl)
              }}
            >
              <sl-icon name="trash3" slot="prefix"></sl-icon>
              ${msg("Delete Crawl")}
            </sl-menu-item>
          `,
        )}
      </sl-menu>
    </btrix-crawl-list-item>
  `;

  private readonly renderMenuItems = (item: Crawl) => {
    // HACK shoelace doesn't current have a way to override non-hover
    // color without resetting the --sl-color-neutral-700 variable
    const authToken = this.authState?.headers.Authorization.split(" ")[1];

    return html`
      ${when(
        this.isCrawler,
        () => html`
          <sl-menu-item
            @click=${async () => {
              this.itemToEdit = item;
              await this.updateComplete;
              this.isEditingItem = true;
            }}
          >
            <sl-icon name="pencil" slot="prefix"></sl-icon>
            ${msg("Edit Archived Item")}
          </sl-menu-item>
          <sl-divider></sl-divider>
        `,
      )}
      ${when(
        isSuccessfullyFinished(item),
        () => html`
          <btrix-menu-item-link
            href=${`/api/orgs/${this.orgId}/all-crawls/${item.id}/download?auth_bearer=${authToken}&preferSingleWACZ=true`}
            download
          >
            <sl-icon name="cloud-download" slot="prefix"></sl-icon>
            ${msg("Download Item")}
            ${item.fileSize
              ? html` <btrix-badge
                  slot="suffix"
                  class="font-monostyle text-xs text-neutral-500"
                  >${this.localize.bytes(item.fileSize)}</btrix-badge
                >`
              : nothing}
          </btrix-menu-item-link>
          <sl-divider></sl-divider>
        `,
      )}
      <sl-menu-item
        @click=${() =>
          this.navigate.to(
            `${this.navigate.orgBasePath}/workflows/${item.cid}`,
          )}
      >
        <sl-icon name="arrow-return-right" slot="prefix"></sl-icon>
        ${msg("Go to Workflow")}
      </sl-menu-item>
      <sl-menu-item
        @click=${() => ClipboardController.copyToClipboard(item.cid)}
      >
        <sl-icon name="copy" slot="prefix"></sl-icon>
        ${msg("Copy Workflow ID")}
      </sl-menu-item>

      <sl-menu-item
        @click=${() =>
          ClipboardController.copyToClipboard(item.tags.join(", "))}
        ?disabled=${!item.tags.length}
      >
        <sl-icon name="tags" slot="prefix"></sl-icon>
        ${msg("Copy Tags")}
      </sl-menu-item>
      <sl-menu-item
        @click=${() => ClipboardController.copyToClipboard(item.id)}
      >
        <sl-icon name="copy" slot="prefix"></sl-icon>
        ${msg("Copy Item ID")}
      </sl-menu-item>
      ${when(
        this.isCrawler && !isActive(item),
        () => html`
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => this.confirmDeleteItem(item)}
          >
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${msg("Delete Item")}
          </sl-menu-item>
        `,
      )}
    `;
  };

  private readonly renderStatusMenuItem = (state: CrawlState) => {
    const { icon, label } = CrawlStatus.getContent({ state });

    return html`<sl-option value=${state}>${icon}${label}</sl-option>`;
  };

  private renderEmptyState() {
    if (this.hasFiltersSet) {
      return html`
        <div class="rounded-lg border bg-neutral-50 p-4">
          <p class="text-center">
            <span class="text-neutral-400"
              >${msg("No matching items found.")}</span
            >
            <button
              class="font-medium text-neutral-500 underline hover:no-underline"
              @click=${() => {
                this.clearFilters();
                if (this.stateSelect) {
                  // TODO pass in value to sl-select after upgrading
                  // shoelace to >=2.0.0-beta.88. Passing an array value
                  // using beta.85 is currently buggy.
                  this.stateSelect.value = [];
                }
              }}
            >
              ${msg("Clear search and filters")}
            </button>
          </p>
        </div>
      `;
    }

    if (this.pagination.page && this.pagination.page > 1) {
      return html`
        <div class="border-b border-t py-5">
          <p class="text-center text-neutral-500">
            ${msg("Could not find page.")}
          </p>
        </div>
      `;
    }

    return html`
      <div class="border-b border-t py-5">
        <p class="text-center text-neutral-500">${msg("No crawl runs yet.")}</p>
      </div>
    `;
  }

  private async getArchivedItems(
    params: {
      itemType: OrgCrawls["itemType"];
      pagination: OrgCrawls["pagination"];
      orderBy: OrgCrawls["orderBy"]["value"];
      filterBy: OrgCrawls["filterBy"]["value"];
      filterByCurrentUser: OrgCrawls["filterByCurrentUser"]["value"];
      filterByTags: OrgCrawls["filterByTags"]["value"];
      filterByTagsType: OrgCrawls["filterByTagsType"]["value"];
    },
    signal: AbortSignal,
  ) {
    const query = queryString.stringify(
      {
        ...params.filterBy,
        state: params.filterBy.state,
        page: params.pagination.page,
        pageSize: params.pagination.pageSize,
        tags: params.filterByTags,
        tagMatch: params.filterByTagsType,
        userid: params.filterByCurrentUser ? this.userInfo!.id : undefined,
        sortBy: params.orderBy.field,
        sortDirection: params.orderBy.direction === "desc" ? -1 : 1,
        crawlType: params.itemType,
      },
      {
        arrayFormat: "none",
      },
    );

    return this.api.fetch<Crawls>(`/orgs/${this.orgId}/crawls?${query}`, {
      signal,
    });
  }

  private async fetchConfigSearchValues() {
    try {
      const query = queryString.stringify({
        crawlType: this.itemType,
      });
      const data: {
        crawlIds: string[];
        names: string[];
        descriptions: string[];
        firstSeeds: string[];
      } = await this.api.fetch(
        `/orgs/${this.orgId}/all-crawls/search-values?${query}`,
      );

      // Update search/filter collection
      const toSearchItem = (key: SearchFields) => (value: string) => ({
        [key]: value,
      });
      this.searchOptions = [
        ...data.names.map(toSearchItem("name")),
        ...data.firstSeeds.map(toSearchItem("firstSeed")),
      ];
    } catch (e) {
      console.debug(e);
    }
  }

  private readonly confirmDeleteItem = (item: Crawl) => {
    this.itemToDelete = item;
    this.isDeletingItem = true;
  };

  private async deleteItem(item: Crawl) {
    let apiPath;

    switch (this.itemType) {
      case "crawl":
        apiPath = "crawls";
        break;
      default:
        apiPath = "all-crawls";
        break;
    }

    try {
      const _data = await this.api.fetch(
        `/orgs/${item.oid}/${apiPath}/delete`,
        {
          method: "POST",
          body: JSON.stringify({
            crawl_ids: [item.id],
          }),
        },
      );
      // TODO eager list update before server response
      void this.archivedItemsTask.run();
      // const { items, ...crawlsData } = this.archivedItems!;
      this.itemToDelete = null;
      // this.archivedItems = {
      //   ...crawlsData,
      //   items: items.filter((c) => c.id !== item.id),
      // };
      this.notify.toast({
        message: msg(str`Successfully deleted crawl.`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
      if (this.itemToDelete) {
        this.confirmDeleteItem(this.itemToDelete);
      }
      let message = msg(str`Sorry, couldn't delete crawl at this time.`);
      if (isApiError(e)) {
        if (e.details == "not_allowed") {
          message = msg(str`Only org owners can delete other users' crawls.`);
        } else if (e.message) {
          message = e.message;
        }
      }
      this.notify.toast({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async getWorkflow(crawl: Crawl): Promise<Workflow> {
    const data: Workflow = await this.api.fetch(
      `/orgs/${crawl.oid}/crawlconfigs/${crawl.cid}`,
    );

    return data;
  }
}
