import type { TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import { until } from "lit/directives/until.js";
import { guard } from "lit/directives/guard.js";
import debounce from "lodash/fp/debounce";
import { mergeDeep } from "immutable";
import omit from "lodash/fp/omit";
import groupBy from "lodash/fp/groupBy";
import Fuse from "fuse.js";
import queryString from "query-string";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import type { SlMenuItem } from "@shoelace-style/shoelace";

import type { CheckboxChangeEvent, CheckboxGroupList } from "./checkbox-list";
import type { MarkdownChangeEvent } from "./markdown-editor";
import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "../types/api";
import type { Collection } from "../types/collection";
import type { Crawl, CrawlState, Workflow } from "../types/crawler";
import type { PageChangeEvent } from "./pagination";

const TABS = ["crawls", "metadata"] as const;
type Tab = (typeof TABS)[number];
type SearchFields = "name" | "firstSeed";
type SearchResult = {
  item: {
    key: SearchFields;
    value: string;
  };
};
const finishedCrawlStates: CrawlState[] = [
  "complete",
  "partial_complete",
  "timed_out",
];
const INITIAL_PAGE_SIZE = 5;
const MIN_SEARCH_LENGTH = 2;

export type CollectionSubmitEvent = CustomEvent<{
  values: {
    name: string;
    description: string | null;
    crawlIds: string[];
  };
}>;

/**
 * @event on-submit
 */
@localized()
export class CollectionEditor extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Object })
  collection?: Collection;

  @property({ type: Boolean })
  isSubmitting = false;

  @state()
  private workflows?: APIPaginatedList & {
    items: Workflow[];
  };

  @state()
  private workflowCrawls: {
    [workflowId: string]: Promise<Crawl[]>;
  } = {};

  @state()
  private selectedCrawls: {
    [crawlId: string]: Crawl;
  } = {};

  @state()
  private activeTab: Tab = TABS[0];

  @state()
  private filterBy: Partial<Record<keyof Crawl, any>> = {};

  @state()
  private searchByValue: string = "";

  @state()
  private searchResultsOpen = false;

  private get hasSearchStr() {
    return this.searchByValue.length >= MIN_SEARCH_LENGTH;
  }

  private get selectedSearchFilterKey() {
    return Object.keys(this.fieldLabels).find((key) =>
      Boolean((this.filterBy as any)[key])
    );
  }

  // TODO localize
  private numberFormatter = new Intl.NumberFormat(undefined, {
    notation: "compact",
  });

  // For fuzzy search:
  private fuse = new Fuse([], {
    keys: ["value"],
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private readonly fieldLabels: Record<SearchFields, string> = {
    name: msg("Name"),
    firstSeed: msg("Crawl Start URL"),
  };

  private readonly tabLabels: Record<Tab, string> = {
    crawls: msg("Select Crawls"),
    metadata: msg("Metadata"),
  };

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId") && this.orgId) {
      this.fetchWorkflows();
      this.fetchSearchValues();
    }
    if (changedProperties.has("collection") && this.collection) {
      this.selectedCrawls = this.collection.crawlIds.reduce(
        (acc, id) => ({
          ...acc,
          [id]: { id }, // TODO replace with crawl
        }),
        {}
      );
    }
  }

  connectedCallback(): void {
    // Set initial active section and dialog based on URL #hash value
    this.getActivePanelFromHash();
    super.connectedCallback();
    window.addEventListener("hashchange", this.getActivePanelFromHash);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.getActivePanelFromHash);
  }

  render() {
    return html`<form name="collectionForm" @submit=${this.onSubmit}>
      <btrix-tab-list
        activePanel="collectionForm-${this.activeTab}"
        progressPanel="collectionForm-${this.activeTab}"
      >
        <h3 slot="header" class="font-semibold">
          ${this.tabLabels[this.activeTab]}
        </h3>

        ${TABS.map(this.renderTab)}

        <btrix-tab-panel name="collectionForm-crawls">
          ${this.renderSelectCrawls()}
        </btrix-tab-panel>
        <btrix-tab-panel name="collectionForm-metadata">
          ${this.renderMetadata()}
        </btrix-tab-panel>
      </btrix-tab-list>
    </form>`;
  }

  private renderTab = (tab: Tab) => {
    const isActive = tab === this.activeTab;
    const completed = false; // TODO
    const iconProps = {
      name: "circle",
      library: "default",
      class: "text-neutral-400",
    };
    if (isActive) {
      iconProps.name = "pencil-circle-dashed";
      iconProps.library = "app";
      iconProps.class = "text-base";
    } else if (completed) {
      iconProps.name = "check-circle";
    }

    return html`
      <btrix-tab
        slot="nav"
        name="collectionForm-${tab}"
        class="whitespace-nowrap"
        @click=${() => this.goToTab(tab)}
      >
        <sl-icon
          name=${iconProps.name}
          library=${iconProps.library}
          class="inline-block align-middle mr-1 text-base ${iconProps.class}"
        ></sl-icon>
        <span class="inline-block align-middle whitespace-normal">
          ${this.tabLabels[tab]}
        </span>
      </btrix-tab>
    `;
  };

  private renderSelectCrawls() {
    return html`
      <section class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section class="col-span-1 flex flex-col">
          <h4 class="text-base font-semibold mb-3">
            ${msg("Crawls in Collection")}
          </h4>
          <div class="border rounded-lg py-2 flex-1">
            ${this.renderCollectionWorkflowList()}
          </div>
        </section>
        <section class="col-span-1 flex flex-col">
          <h4 class="text-base font-semibold mb-3">${msg("All Workflows")}</h4>
          <div class="flex-0 border rounded bg-neutral-50 p-2 mb-2">
            ${this.renderWorkflowListControls()}
          </div>
          <div class="flex-1">${this.renderWorkflowList()}</div>
          <footer class="mt-4 flex justify-center">
            ${when(
              this.workflows?.total,
              () => html`
                <btrix-pagination
                  page=${this.workflows!.page}
                  totalCount=${this.workflows!.total}
                  size=${this.workflows!.pageSize}
                  @page-change=${async (e: PageChangeEvent) => {
                    await this.fetchWorkflows({
                      page: e.detail.page,
                    });

                    // Scroll to top of list
                    this.scrollIntoView({ behavior: "smooth" });
                  }}
                ></btrix-pagination>
              `
            )}
          </footer>
        </section>
        <footer
          class="col-span-1 lg:col-span-2 border rounded-lg px-6 py-4 flex justify-between"
        >
          <sl-button
            size="small"
            class="ml-auto"
            @click=${() => this.goToTab("metadata")}
          >
            <sl-icon slot="suffix" name="chevron-right"></sl-icon>
            ${msg("Enter Metadata")}
          </sl-button>
        </footer>
      </section>
    `;
  }

  private renderMetadata() {
    return html`
      <section class="border rounded-lg">
        <div class="p-6 grid grid-cols-5 gap-4">
          ${this.renderFormCol(html`
            <sl-input
              class="mb-4"
              name="name"
              label=${msg("Name")}
              autocomplete="off"
              placeholder=${msg("My Collection")}
              required
            ></sl-input>
          `)}
          ${this.renderHelpTextCol(msg("TODO"))}
          ${this.renderFormCol(html`
            <h4 class="form-label">${msg("Description")}</h4>
            <btrix-markdown-editor
              name="description"
              initialValue=${""}
            ></btrix-markdown-editor>
          `)}
          ${this.renderHelpTextCol(msg("TODO"))}
        </div>
        <footer class="border-t px-6 py-4 flex justify-between">
          <sl-button size="small" @click=${() => this.goToTab("crawls")}>
            <sl-icon slot="prefix" name="chevron-left"></sl-icon>
            ${msg("Select Crawls")}
          </sl-button>
          <sl-button
            type="submit"
            size="small"
            variant="primary"
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting}
          >
            ${msg("Save Collection")}
          </sl-button>
        </footer>
      </section>
    `;
  }

  private renderCollectionWorkflowList() {
    // TODO show crawls in collection
    const crawls = Object.values(this.selectedCrawls);
    if (!crawls.length) {
      return html`
        <div class="flex flex-col items-center justify-center text-center p-4">
          <span class="text-base font-semibold text-primary"
            >${msg("Add Crawls to This Collection")}</span
          >
          <p class="max-w-[24em] mx-auto mt-4">
            ${msg(
              "Select entire Workflows or individual Crawls. You can always come back and add Crawls later."
            )}
          </p>
        </div>
      `;
    }
    const groupedByWorkflow = groupBy("cid")(crawls);

    return html`
      <btrix-checkbox-list>
        ${Object.keys(groupedByWorkflow).map((workflowId) =>
          until(
            // TODO show crawls in collection
            Promise.resolve(
              this.workflowCrawls[workflowId] || groupedByWorkflow[workflowId]
            ).then((crawls) => this.renderWorkflowCrawls(workflowId, crawls))
          )
        )}
      </btrix-checkbox-list>
    `;
  }

  private renderWorkflowCrawls(workflowId: string, crawls: Crawl[]) {
    const selectedCrawlIds = Object.keys(this.selectedCrawls).filter((id) =>
      crawls.some((crawl) => id === crawl.id)
    );
    const allChecked = crawls.length === selectedCrawlIds.length;
    // Use latest crawl for workflow information, since we
    // may not have access to workflow details
    const firstCrawl = crawls[0];

    return html`
      <btrix-checkbox-list-item
        ?checked=${selectedCrawlIds.length}
        ?allChecked=${allChecked}
        group
        aria-controls=${selectedCrawlIds.join(" ")}
        @on-change=${(e: CheckboxChangeEvent) => {
          const checkAll = () => {
            const allCrawls = crawls.reduce(
              (acc: any, crawl: Crawl) => ({
                ...acc,
                [crawl.id]: crawl,
              }),
              {}
            );
            this.selectedCrawls = mergeDeep(this.selectedCrawls, allCrawls);
          };
          if (e.detail.checked) {
            checkAll();
          } else if (allChecked) {
            this.selectedCrawls = omit(crawls.map(({ id }) => id))(
              this.selectedCrawls
            ) as any;
          } else {
            checkAll();
          }
        }}
      >
        <div class="grid grid-cols-[1fr_4.6rem_2.5rem] gap-3 items-center">
          <div>
            ${this.renderSeedsLabel(firstCrawl.firstSeed, firstCrawl.seedCount)}
          </div>
          <div class="text-neutral-500 text-xs font-monostyle truncate h-4">
            ${crawls.length === 1
              ? msg("1 crawl")
              : msg(`${this.numberFormatter.format(crawls.length)} crawls`)}
          </div>
          <div class="col-span-1 border-l flex items-center justify-center">
            <btrix-button
              class="expandBtn p-2 text-base"
              aria-expanded="true"
              aria-controls=${`workflow-${workflowId}`}
              @click=${this.onWorkflowExpandClick(workflowId, crawls.length)}
              icon
            >
              <sl-icon name="chevron-double-down"></sl-icon>
            </btrix-button>
          </div>
        </div>
        <div
          id=${`workflow-${workflowId}-group`}
          slot="group"
          class="checkboxGroup transition-all overflow-hidden"
        >
          <btrix-checkbox-group-list>
            ${crawls.map((crawl) => this.renderCrawl(crawl, workflowId))}
          </btrix-checkbox-group-list>
        </div>
      </btrix-checkbox-list-item>
    `;
  }

  private renderCrawl(crawl: Crawl, workflowId?: string) {
    return html`
      <btrix-checkbox-list-item
        id=${crawl.id}
        name="crawlIds"
        value=${crawl.id}
        ?checked=${this.selectedCrawls[crawl.id]}
        @on-change=${(e: CheckboxChangeEvent) => {
          if (e.detail.checked) {
            this.selectedCrawls = mergeDeep(this.selectedCrawls, {
              [crawl.id]: crawl,
            });
          } else {
            this.selectedCrawls = omit([crawl.id])(this.selectedCrawls) as any;
          }
        }}
      >
        <div class="flex items-center">
          <btrix-crawl-status
            state=${crawl.state}
            hideLabel
          ></btrix-crawl-status>
          <div class="flex-1">
            ${workflowId
              ? html`<sl-format-date
                  date=${`${crawl.finished}Z`}
                  month="2-digit"
                  day="2-digit"
                  year="2-digit"
                  hour="2-digit"
                  minute="2-digit"
                ></sl-format-date>`
              : this.renderSeedsLabel(crawl.firstSeed, crawl.seedCount)}
          </div>
          <div class="w-16 font-monostyle truncate">
            <sl-tooltip content=${msg("Pages in crawl")}>
              <div class="flex items-center">
                <sl-icon
                  class="text-base"
                  name="file-earmark-richtext"
                ></sl-icon>
                <div class="ml-1 text-xs">
                  ${this.numberFormatter.format(+(crawl.stats?.done || 0))}
                </div>
              </div>
            </sl-tooltip>
          </div>
          <div class="w-14">
            <sl-format-bytes
              class="text-neutral-500 text-xs font-monostyle"
              value=${crawl.fileSize || 0}
              display="narrow"
            ></sl-format-bytes>
          </div>
        </div>
      </btrix-checkbox-list-item>
    `;
  }

  private renderWorkflowListControls() {
    return html`
      <div class="flex flex-wrap items-center md:gap-4 gap-2">
        <div class="grow">${this.renderSearch()}</div>
      </div>
    `;
  }

  private renderSearch() {
    return html`
      <btrix-combobox
        ?open=${this.searchResultsOpen}
        @request-close=${() => {
          this.searchResultsOpen = false;
          this.searchByValue = "";
        }}
        @sl-select=${async (e: CustomEvent) => {
          this.searchResultsOpen = false;
          const item = e.detail.item as SlMenuItem;
          const key = item.dataset["key"] as SearchFields;
          this.searchByValue = item.value;
          await this.updateComplete;
          this.filterBy = {
            ...this.filterBy,
            [key]: item.value,
          };
        }}
      >
        <sl-input
          size="small"
          placeholder=${msg("Search by Workflow Name or Crawl Start URL")}
          clearable
          value=${this.searchByValue}
          @sl-clear=${() => {
            this.searchResultsOpen = false;
            this.onSearchInput.cancel();
            const { name, firstSeed, ...otherFilters } = this.filterBy;
            this.filterBy = otherFilters;
          }}
          @sl-input=${this.onSearchInput}
          @focus=${() => {
            if (this.hasSearchStr) {
              this.searchResultsOpen = true;
            }
          }}
        >
          ${when(
            this.selectedSearchFilterKey,
            () =>
              html`<sl-tag
                slot="prefix"
                size="small"
                pill
                style="margin-left: var(--sl-spacing-3x-small)"
                >${this.fieldLabels[
                  this.selectedSearchFilterKey as SearchFields
                ]}</sl-tag
              >`,
            () => html`<sl-icon name="search" slot="prefix"></sl-icon>`
          )}
        </sl-input>
        ${this.renderSearchResults()}
      </btrix-combobox>
    `;
  }

  private renderSearchResults() {
    if (!this.hasSearchStr) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("Start typing to view crawl filters.")}</sl-menu-item
        >
      `;
    }

    const searchResults = this.fuse.search(this.searchByValue).slice(0, 10);
    if (!searchResults.length) {
      return html`
        <sl-menu-item slot="menu-item" disabled
          >${msg("No matching crawls found.")}</sl-menu-item
        >
      `;
    }

    return html`
      ${searchResults.map(
        ({ item }: SearchResult) => html`
          <sl-menu-item
            slot="menu-item"
            data-key=${item.key}
            value=${item.value}
          >
            <sl-tag slot="prefix" size="small" pill
              >${this.fieldLabels[item.key]}</sl-tag
            >
            ${item.value}
          </sl-menu-item>
        `
      )}
    `;
  }

  private renderWorkflowList() {
    if (!this.workflows) {
      return html`
        <div class="w-full flex items-center justify-center my-24 text-3xl">
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    return html`
      <btrix-checkbox-list>
        ${this.workflows.items.map((workflow) =>
          this.renderWorkflowItem(workflow)
        )}
      </btrix-checkbox-list>
    `;
  }

  private renderFormCol = (content: TemplateResult) => {
    return html`<div class="col-span-5 md:col-span-3">${content}</div> `;
  };

  private renderHelpTextCol(content: TemplateResult | string, padTop = true) {
    return html`
      <div class="col-span-5 md:col-span-2 flex${padTop ? " pt-6" : ""}">
        <div class="text-base mr-2">
          <sl-icon name="info-circle"></sl-icon>
        </div>
        <div class="mt-0.5 text-xs text-neutral-500">${content}</div>
      </div>
    `;
  }

  // TODO consolidate collections/workflow name
  private renderWorkflowName(workflow: Workflow) {
    if (workflow.name)
      return html`<span class="min-w-0">${workflow.name}</span>`;
    if (!workflow.firstSeed)
      return html`<span class="min-w-0">${workflow.id}</span>`;
    return this.renderSeedsLabel(
      workflow.firstSeed,
      workflow.config.seeds.length
    );
  }

  private renderSeedsLabel(firstSeed: string, seedCount: number) {
    let nameSuffix: any = "";
    const remainder = seedCount - 1;
    if (remainder) {
      if (remainder === 1) {
        nameSuffix = html`<span class="ml-1 text-neutral-500"
          >${msg(str`+${remainder} URL`)}</span
        >`;
      } else {
        nameSuffix = html`<span class="ml-1 text-neutral-500"
          >${msg(str`+${remainder} URLs`)}</span
        >`;
      }
    }
    return html`
      <div class="flex">
        <span class="flex-1 min-w-0 truncate">${firstSeed}</span>${nameSuffix}
      </div>
    `;
  }

  private renderWorkflowItem(workflow: Workflow) {
    const workflowCrawlsAsync =
      this.workflowCrawls[workflow.id] || Promise.resolve([]);
    const someSelectedAsync = workflowCrawlsAsync.then((crawls) =>
      crawls.some(({ id }) => this.selectedCrawls[id])
    );

    return html`
      <btrix-checkbox-list-item
        ?checked=${until(someSelectedAsync, false)}
        @on-change=${async (e: CheckboxChangeEvent) => {
          this.fetchWorkflowCrawls(workflow.id);
          const workflowCrawls = await this.workflowCrawls[workflow.id];

          if (e.detail.checked) {
            this.selectedCrawls = mergeDeep(
              this.selectedCrawls,
              workflowCrawls.reduce(
                (acc: any, crawl: Crawl) => ({
                  ...acc,
                  [crawl.id]: crawl,
                }),
                {}
              )
            );
          } else {
            this.selectedCrawls = omit(workflowCrawls.map(({ id }) => id))(
              this.selectedCrawls
            ) as any;
          }
        }}
      >
        <div class="grid grid-cols-[1fr_10ch] gap-3">
          ${this.renderWorkflowDetails(workflow)}
        </div>
      </btrix-checkbox-list-item>
    `;
  }

  private renderWorkflowDetails(workflow: Workflow) {
    return html`
      <div class="col-span-1 py-3 whitespace-nowrap truncate">
        <div class="text-neutral-700 h-6 truncate">
          ${this.renderWorkflowName(workflow)}
        </div>
        <div class="text-neutral-500 text-xs font-monostyle truncate h-4">
          <sl-format-date
            date=${workflow.lastCrawlTime}
            month="2-digit"
            day="2-digit"
            year="2-digit"
            hour="2-digit"
            minute="2-digit"
          ></sl-format-date>
        </div>
      </div>
      <div class="col-span-1 py-3">
        <div class="text-neutral-700 truncate h-6">
          <sl-format-bytes
            value=${workflow.totalSize}
            display="narrow"
          ></sl-format-bytes>
        </div>
        <div class="text-neutral-500 text-xs font-monostyle truncate h-4">
          ${workflow.crawlCount === 1
            ? msg("1 crawl")
            : msg(
                str`${this.numberFormatter.format(workflow.crawlCount)} crawls`
              )}
        </div>
      </div>
    `;
  }

  private onWorkflowExpandClick =
    (workflowId: string, crawlCount: number) => async (e: MouseEvent) => {
      e.stopPropagation();
      const checkboxGroup = this.querySelector(
        `#workflow-${workflowId}-group`
      ) as HTMLElement;
      const expandBtn = e.currentTarget as HTMLElement;
      const expanded = !(expandBtn.getAttribute("aria-expanded") === "true");
      expandBtn.setAttribute("aria-expanded", expanded.toString());

      if (expanded) {
        checkboxGroup.style.marginTop = "0px";
        checkboxGroup.style.opacity = "100%";
        checkboxGroup.style.pointerEvents = "auto";
      } else {
        checkboxGroup.style.marginTop = `-${checkboxGroup.clientHeight}px`;
        checkboxGroup.style.opacity = "0";
        checkboxGroup.style.pointerEvents = "none";
      }
    };

  private onSearchInput = debounce(150)((e: any) => {
    this.searchByValue = e.target.value.trim();

    if (this.searchResultsOpen === false && this.hasSearchStr) {
      this.searchResultsOpen = true;
    }

    if (!this.searchByValue && this.selectedSearchFilterKey) {
      const {
        [this.selectedSearchFilterKey as SearchFields]: _,
        ...otherFilters
      } = this.filterBy;
      this.filterBy = {
        ...otherFilters,
      };
    }
  }) as any;

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    event.stopPropagation();
    await this.updateComplete;

    const form = event.target as HTMLFormElement;
    if (form.querySelector("[data-invalid]")) {
      return;
    }

    const values = {
      ...serialize(form),
      crawlIds: Object.keys(this.selectedCrawls),
    };
    this.dispatchEvent(
      <CollectionSubmitEvent>new CustomEvent("on-submit", {
        detail: { values },
      })
    );
  }

  private getActivePanelFromHash = () => {
    const hashValue = window.location.hash.slice(1);
    if (TABS.includes(hashValue as any)) {
      this.activeTab = hashValue as Tab;
    } else {
      this.goToTab(TABS[0], { replace: true });
    }
  };

  private goToTab(tab: Tab, { replace = false } = {}) {
    const path = `${window.location.href.split("#")[0]}#${tab}`;
    if (replace) {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    this.activeTab = tab;
  }

  private async fetchWorkflows(params: APIPaginationQuery = {}) {
    try {
      this.workflows = await this.getWorkflows({
        page: params.page || this.workflows?.page || 1,
        pageSize:
          params.pageSize || this.workflows?.pageSize || INITIAL_PAGE_SIZE,
        sortBy: "lastCrawlTime",
        sortDirection: -1,
      });

      // TODO remove
      this.fetchWorkflowCrawls(this.workflows.items[0].id);
    } catch (e: any) {
      this.notify({
        message: msg("Sorry, couldn't retrieve Workflows at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getWorkflows(
    params: APIPaginationQuery & APISortQuery
  ): Promise<APIPaginatedList> {
    const query = queryString.stringify(params);
    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/crawlconfigs?${query}`,
      this.authState!
    );

    return data;
  }

  private fetchWorkflowCrawls(workflowId: string) {
    if (this.workflowCrawls[workflowId] !== undefined) {
      return Promise.resolve(this.workflowCrawls[workflowId] || []);
    }

    this.workflowCrawls = mergeDeep(this.workflowCrawls, {
      // TODO paginate
      [workflowId]: this.getCrawls({
        cid: workflowId,
        state: finishedCrawlStates,
      })
        // TODO remove omit once API removes
        .then((data) => data.items.map(omit("errors")))
        .catch((err: any) => {
          console.debug(err);
          this.workflowCrawls = omit([workflowId], this.workflowCrawls);
        }),
    });
  }

  private async getCrawls(
    params: Partial<{
      cid: string;
      state: CrawlState[];
    }>
  ): Promise<APIPaginatedList> {
    const query = queryString.stringify(params || {}, {
      arrayFormat: "comma",
    });
    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/crawls?${query}`,
      this.authState!
    );

    return data;
  }

  private async fetchSearchValues() {
    try {
      const { names, firstSeeds } = await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/search-values`,
        this.authState!
      );

      // Update search/filter collection
      const toSearchItem =
        (key: SearchFields) =>
        (value: string): SearchResult["item"] => ({
          key,
          value,
        });
      this.fuse.setCollection([
        ...names.map(toSearchItem("name")),
        ...firstSeeds.map(toSearchItem("firstSeed")),
      ] as any);
    } catch (e) {
      console.debug(e);
    }
  }
}
