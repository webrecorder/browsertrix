import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlChangeEvent, SlRadioGroup } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { OpenDialogEventDetail } from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { SearchParamsValue } from "@/controllers/searchParamsValue";
import { indexUpdating } from "@/features/collections/index-import-progress";
import { dedupeIconFor } from "@/features/collections/templates/dedupe-icon";
import { indexStatus } from "@/features/collections/templates/index-status";
import { emptyMessage } from "@/layouts/emptyMessage";
import { infoPopover } from "@/layouts/info-popover";
import { panel, panelBody, panelHeader } from "@/layouts/panel";
import { stringFor } from "@/strings/ui";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { ArchivedItemSearchValues } from "@/types/archivedItems";
import type { Collection } from "@/types/collection";
import type { ArchivedItem, Workflow } from "@/types/crawler";
import type { DedupeIndexStats } from "@/types/dedupe";
import { SortDirection } from "@/types/utils";
import { finishedCrawlStates } from "@/utils/crawler";
import { tw } from "@/utils/tailwind";

const BYTES_PER_MB = 1e6;
const INITIAL_PAGE_SIZE = 10;

enum ItemsView {
  Workflows = "workflows",
  Crawls = "crawls",
  Dependencies = "dependencies",
}

const storageLabelFor = {
  conserved: msg("Space Conserved"),
  used: msg("Actual Stored"),
  withoutDedupe: msg("Estimated Total"),
};
const DEFAULT_ITEMS_VIEW = ItemsView.Workflows;
const ITEMS_VIEW_PARAM = "itemsView";
type View = {
  itemsView?: ItemsView;
};

/**
 * @slot actions
 * @fires btrix-open-dialog
 * @fires btrix-request-update
 */
@customElement("btrix-collection-detail-dedupe")
@localized()
export class CollectionDetailDedupe extends BtrixElement {
  @property({ type: String })
  collectionId = "";

  @property({ type: Object })
  collection?: Collection;

  @state()
  private pagination: Required<APIPaginationQuery> = {
    page: parsePage(new URLSearchParams(location.search).get("page")),
    pageSize: INITIAL_PAGE_SIZE,
  };

  private readonly view = new SearchParamsValue<View>(
    this,
    (value, params) => {
      if (value.itemsView) {
        params.set(ITEMS_VIEW_PARAM, value.itemsView);
      } else {
        params.delete(ITEMS_VIEW_PARAM);
      }
      return params;
    },
    (params) => {
      const itemsView = params.get(ITEMS_VIEW_PARAM);
      return {
        itemsView: itemsView ? (itemsView as ItemsView) : DEFAULT_ITEMS_VIEW,
      };
    },
  );

  /**
   * Workflows using this collection as deduplication source
   */
  private readonly dedupeWorkflowsTask = new Task(this, {
    task: async ([collection], { signal }) => {
      if (!collection) return;

      const query = queryString.stringify({
        dedupeCollId: collection.id,
        sortBy: "name",
      });

      return await this.api.fetch<APIPaginatedList<Workflow>>(
        `/orgs/${this.orgId}/crawlconfigs?${query}`,
        { signal },
      );
    },
    args: () => [this.collection] as const,
  });

  /**
   * Successfully finished and deduplicated crawls in the collection
   * that used this collection as the deduplication source
   */
  private readonly dedupeCrawlsTask = new Task(this, {
    task: async ([collectionId, pagination], { signal }) => {
      if (!collectionId) return;

      const query = queryString.stringify({
        ...pagination,
        sortBy: "finished",
        sortDirection: SortDirection.Descending,
        collectionId,
        dedupeCollId: collectionId,
        state: finishedCrawlStates,
        hasRequiresCrawls: true,
      });

      return await this.api.fetch<APIPaginatedList<ArchivedItem>>(
        `/orgs/${this.orgId}/crawls?${query}`,
        { signal },
      );
    },
    args: () => [this.collectionId, this.pagination] as const,
  });

  /**
   * IDs of all archived items currently in the collection
   */
  private readonly collectionItemIdsTask = new Task(this, {
    task: async ([collectionId], { signal }) => {
      if (!collectionId) return;

      const query = queryString.stringify({
        collectionId,
      });

      const { ids } = await this.api.fetch<ArchivedItemSearchValues>(
        `/orgs/${this.orgId}/all-crawls/search-values?${query}`,
        { signal },
      );

      return ids;
    },
    args: () => [this.collectionId] as const,
  });

  /**
   * Crawled items that are a dependency of an archived item
   * currently in the collection
   */
  private readonly dependenciesTask = new Task(this, {
    task: async ([itemIds, pagination], { signal }) => {
      if (!itemIds?.length) return;

      const query = queryString.stringify({
        ...pagination,
        sortBy: "finished",
        sortDirection: SortDirection.Descending,
        requiredByCrawls: itemIds,
      });

      return await this.api.fetch<APIPaginatedList<ArchivedItem>>(
        `/orgs/${this.orgId}/all-crawls?${query}`,
        { signal },
      );
    },
    args: () => [this.collectionItemIdsTask.value, this.pagination] as const,
  });

  /**
   * Poll for fresh collection data
   */
  private readonly pollTask = new Task(this, {
    task: async ([collection]) => {
      if (!collection) return;

      window.clearTimeout(this.pollTask.value);

      const pollInterval =
        collection.indexState === null ||
        ["ready", "idle"].includes(collection.indexState)
          ? 30
          : // Decrease poll interval if index is in use
            10;

      return window.setTimeout(() => {
        this.dispatchEvent(new CustomEvent("btrix-request-update"));
      }, pollInterval * 1000);
    },
    args: () => [this.collection] as const,
  });

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("view.internalValue")) {
      this.pagination = {
        ...this.pagination,
        page: 1,
      };
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this.pollTask.value);
  }

  render() {
    if (!this.collection) return;

    if (this.collection.indexStats) {
      const hideStats = !this.collection.indexStats.totalCrawls;

      return html` <div
        class="grid grid-cols-5 grid-rows-[min-content_1fr] gap-x-3 gap-y-3 xl:gap-x-7"
      >
        <section
          class="col-span-full row-span-2 xl:order-last xl:col-span-1 xl:col-start-5 xl:row-start-1"
        >
          ${this.renderOverview()}
        </section>
        ${hideStats
          ? nothing
          : html`<section
              class="col-span-full row-span-1 xl:col-span-4 xl:col-start-1 xl:row-start-1"
            >
              ${this.renderStats(this.collection.indexStats)}
            </section>`}
        <section
          class="${hideStats
            ? tw`xl:row-start-1`
            : tw`xl:row-start-2`} col-span-full row-span-1 xl:col-span-4 xl:col-start-1"
        >
          ${panelHeader({ heading: msg("Deduplicated Crawls") })}
          ${this.renderDeduped()}
        </section>
      </div>`;
    }

    return panelBody({
      content: emptyMessage({
        message: msg("Deduplication is not enabled"),
        detail: msg(
          "Deduplication can help conserve storage space and reduce crawl time.",
        ),
        actions: this.appState.isCrawler
          ? html`
              <div class="flex gap-3">
                <sl-button
                  size="small"
                  variant="primary"
                  @click=${() =>
                    this.dispatchEvent(
                      new CustomEvent<OpenDialogEventDetail>(
                        "btrix-open-dialog",
                        {
                          detail: "editItems",
                        },
                      ),
                    )}
                >
                  <sl-icon slot="prefix" name="ui-checks"></sl-icon>
                  ${msg("Configure with Auto-Add")}
                </sl-button>
                <sl-button
                  size="small"
                  @click=${() =>
                    this.dispatchEvent(
                      new CustomEvent<OpenDialogEventDetail>(
                        "btrix-open-dialog",
                        {
                          detail: "createIndex",
                        },
                      ),
                    )}
                >
                  <sl-icon slot="prefix" name="table"></sl-icon>
                  ${msg("Create Dedupe Index")}
                </sl-button>
              </div>
            `
          : undefined,
      }),
    });
  }

  private renderStats(indexStats: DedupeIndexStats) {
    const stat = ({
      label,
      icon,
      value,
      format = "number",
    }: {
      label: string;
      icon?: string;
      value: number | TemplateResult;
      format?: "number" | "byte";
    }) => {
      const formatValue = (v: number) => {
        let long = "";
        let short = "";
        if (format === "byte") {
          long = this.localize.bytes(v, undefined, 5);
          short = this.localize.bytes(v);
        } else {
          long = this.localize.number(v);
          short = this.localize.number(v, { notation: "compact" });
        }

        return html`
          <sl-tooltip content=${long} ?disabled=${long === short}>
            <span>${short}</span>
          </sl-tooltip>
        `;
      };

      return html`
        <div
          class="grid grid-cols-[1fr_min-content] grid-rows-[min-content_1fr] items-center gap-x-4 gap-y-0.5"
        >
          <dt class="min-h-6 text-base font-medium">
            ${typeof value === "number" ? formatValue(value) : value}
          </dt>
          <dd class="col-start-1 text-xs text-neutral-700">${label}</dd>
          ${icon
            ? html`<div
                class="col-start-2 row-span-2 row-start-1 flex size-10 items-center justify-center rounded-lg bg-neutral-50"
              >
                <sl-icon name=${icon} class="size-5 text-neutral-400"></sl-icon>
              </div>`
            : nothing}
        </div>
      `;
    };

    return html`<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <btrix-card>
        <header slot="title" class="flex items-center justify-between">
          <h2>${msg("Storage Impact")}</h2>
          ${infoPopover({
            content: html`
              <strong class="font-semibold">${storageLabelFor.conserved}</strong
              >:
              ${msg(
                "How much storage space has been conserved by deduplicating crawls.",
              )}<br /><br />
              <strong class="font-semibold">${storageLabelFor.used}</strong>:
              ${msg(
                "The total storage space used by indexed items, including indexed and then removed archived items.",
              )}<br /><br />
              <strong class="font-semibold"
                >${storageLabelFor.withoutDedupe}</strong
              >:
              ${msg(
                "Estimated total size of collection if items were not deduplicated.",
              )}
            `,
            placement: "right-start",
          })}
        </header>
        <dl class="grid flex-1 grid-cols-1 gap-x-5 gap-y-3 lg:grid-cols-2">
          <div
            class="flex flex-col gap-3 lg:col-span-2 lg:flex-row lg:items-center lg:border-b lg:pb-[calc(.75rem-1px)]"
          >
            ${stat({
              label: storageLabelFor.conserved,
              value: html`
                <span
                  class=${clsx(
                    tw`text-lg leading-none`,
                    indexStats.conservedSize >= BYTES_PER_MB &&
                      tw`text-success-600`,
                  )}
                >
                  ${this.localize.bytes(indexStats.conservedSize)}
                </span>
              `,
            })}
            <div class="flex-1">${this.renderStorageBar()}</div>
          </div>
          ${stat({
            label: msg("Total Indexed Items"),
            icon: "file-earmark-zip",
            value: indexStats.totalCrawlSize,
            format: "byte",
          })}
          ${stat({
            label: msg("Removed Items in Index"),
            icon: "file-earmark-minus",
            value: indexStats.removedCrawlSize,
            format: "byte",
          })}
        </dl>
      </btrix-card>
      <btrix-card>
        <header slot="title">
          <h2>${msg("Deduplication Summary")}</h2>
        </header>
        <dl class="col-span-1 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-y-6">
          ${stat({
            label: msg("Original Resources"),
            icon: "circle-square",
            value: indexStats.totalUrls - indexStats.dupeUrls,
          })}
          ${stat({
            label: msg("Duplicate Resources"),
            icon: "intersect",
            value: indexStats.dupeUrls,
          })}
          ${stat({
            label: msg("Total Indexed Items"),
            icon: "file-earmark-zip",
            value: indexStats.totalCrawls,
          })}
          ${stat({
            label: msg("Total Indexed URLs"),
            icon: "link-45deg",
            value: indexStats.totalUrls,
          })}
        </dl>
      </btrix-card>
    </div>`;
  }

  private renderStorageBar() {
    const stats = this.collection?.indexStats;

    if (!stats) return;

    const { totalCrawlSize, conservedSize, removedCrawlSize } = stats;
    const notRemoved = totalCrawlSize - removedCrawlSize;
    const max = totalCrawlSize + conservedSize;

    return html`<btrix-meter value=${totalCrawlSize} max=${max} class="w-full">
      <btrix-meter-bar
        value=${(notRemoved / totalCrawlSize) * 100}
        class="[--background-color:theme(colors.blue.300)]"
      >
        <div class="flex justify-between gap-4 font-medium leading-none">
          <!-- TODO Match storage tooltip content -->
          <span>${msg("Items in Index")} (${msg("Kept in Collection")})</span>
          <span>${this.localize.bytes(notRemoved)}</span>
        </div>
      </btrix-meter-bar>
      <btrix-meter-bar
        value=${(removedCrawlSize / totalCrawlSize) * 100}
        class="[--background-color:theme(colors.blue.200)]"
      >
        <div class="flex justify-between gap-4 font-medium leading-none">
          <!-- TODO Match storage tooltip content -->
          <span
            >${msg("Items in Index")} (${msg("Removed from Collection")})</span
          >
          <span>${this.localize.bytes(removedCrawlSize)}</span>
        </div>
      </btrix-meter-bar>
      <div slot="available" class="flex-1">
        <btrix-floating-popover placement="top" class="text-center">
          <div slot="content">
            <header class="flex justify-between gap-4 font-medium leading-none">
              <span>${msg("Estimated Space Conserved")}</span>
              <span>${this.localize.bytes(stats.conservedSize)}</span>
            </header>
          </div>
          <div class="h-full w-full"></div>
        </btrix-floating-popover>
      </div>
      <span slot="valueLabel">${storageLabelFor.used}</span>
      <span slot="maxLabel">${storageLabelFor.withoutDedupe}</span>
    </btrix-meter>`;
  }

  private renderDeduped() {
    return html`
      <div
        class="mb-3 flex items-center justify-between gap-3 rounded-lg border bg-neutral-50 p-3"
      >
        <div class="flex items-center gap-2">
          <label for="view" class="whitespace-nowrap text-neutral-500"
            >${msg("View:")}</label
          >
          <sl-radio-group
            id="view"
            size="small"
            value=${this.view.value.itemsView || DEFAULT_ITEMS_VIEW}
            @sl-change=${(e: SlChangeEvent) => {
              this.view.setValue({
                itemsView: (e.target as SlRadioGroup).value as ItemsView,
              });
            }}
          >
            <sl-radio-button pill value=${DEFAULT_ITEMS_VIEW}>
              <sl-icon slot="prefix" name="file-code-fill"></sl-icon>
              ${msg("By Workflow")}
            </sl-radio-button>
            <sl-radio-button pill value=${ItemsView.Crawls}>
              <sl-icon slot="prefix" name="gear-wide-connected"></sl-icon>
              ${msg("By Crawl Run")}
            </sl-radio-button>
            <sl-radio-button pill value=${ItemsView.Dependencies}>
              <sl-icon
                slot="prefix"
                name=${dedupeIconFor["dependency"].name}
              ></sl-icon>
              ${msg("Dependencies")}
            </sl-radio-button>
          </sl-radio-group>
        </div>
      </div>

      <div class="mx-2">
        ${choose(this.view.value.itemsView, [
          [ItemsView.Workflows, this.renderWorkflowsView],
          [ItemsView.Crawls, this.renderCrawlsView],
          [ItemsView.Dependencies, this.renderDependenciesView],
        ])}
      </div>
    `;
  }

  private readonly renderWorkflowsView = () => {
    const loading = () =>
      html`<sl-skeleton effect="sheen" class="h-10"></sl-skeleton>`;
    const workflows = (workflows?: APIPaginatedList<Workflow>) => {
      if (workflows?.items.length) {
        return html`
          <btrix-dedupe-workflows
            .workflows=${workflows.items}
          ></btrix-dedupe-workflows>
        `;
      }

      return panelBody({
        content: emptyMessage({
          message: msg("No workflows with dedupe enabled found"),
          detail: this.appState.isCrawler
            ? msg(
                "Dedupe can be enabled on workflows that auto-add crawls to this collection.",
              )
            : undefined,
          actions: this.appState.isCrawler
            ? html`<sl-button
                size="small"
                @click=${() =>
                  this.dispatchEvent(
                    new CustomEvent<OpenDialogEventDetail>(
                      "btrix-open-dialog",
                      {
                        detail: "editItems",
                      },
                    ),
                  )}
              >
                <sl-icon slot="prefix" name="ui-checks"></sl-icon>
                ${msg("Configure Auto-Add")}
              </sl-button>`
            : undefined,
        }),
      });
    };

    return html`${this.dedupeWorkflowsTask.render({
      initial: loading,
      pending: () =>
        this.dedupeWorkflowsTask.value
          ? workflows(this.dedupeWorkflowsTask.value)
          : loading(),
      complete: workflows,
    })}`;
  };

  private readonly renderCrawlsView = () => {
    const enableInWorkflow =
      this.dedupeWorkflowsTask.value && !this.dedupeWorkflowsTask.value.total;

    const empty = () => {
      return panelBody({
        content: emptyMessage({
          message: msg("No deduped crawls yet"),
          detail: this.appState.isCrawler
            ? enableInWorkflow
              ? msg(
                  "Dedupe can be enabled on workflows that auto-add crawls to this collection.",
                )
              : msg(
                  "You’ll see deduplicated crawls here after running a workflow with dedupe enabled.",
                )
            : undefined,
          actions:
            this.appState.isCrawler && enableInWorkflow
              ? html`<sl-button
                  size="small"
                  @click=${() =>
                    this.dispatchEvent(
                      new CustomEvent<OpenDialogEventDetail>(
                        "btrix-open-dialog",
                        {
                          detail: "editItems",
                        },
                      ),
                    )}
                >
                  <sl-icon slot="prefix" name="ui-checks"></sl-icon>
                  ${msg("Configure Auto-Add")}
                </sl-button>`
              : undefined,
        }),
      });
    };

    return html`${this.renderDependencyTree(this.dedupeCrawlsTask, empty)}`;
  };

  private readonly renderDependenciesView = () => {
    const empty = () =>
      panelBody({
        content: emptyMessage({
          message: msg("No dedupe dependencies found"),
          detail: this.appState.isCrawler
            ? msg(
                "Dependencies are archived items that are indexed and required by deduped crawls.",
              )
            : undefined,
          actions: this.appState.isCrawler
            ? html`<sl-button
                size="small"
                @click=${() =>
                  this.dispatchEvent(
                    new CustomEvent<OpenDialogEventDetail>(
                      "btrix-open-dialog",
                      {
                        detail: "editItems",
                      },
                    ),
                  )}
              >
                <sl-icon slot="prefix" name="ui-checks"></sl-icon>
                ${msg("Add Items to Index")}
              </sl-button>`
            : undefined,
        }),
      });
    const deletedItemsWarning = () => {
      return html`
        <btrix-alert
          variant="warning"
          class="mb-3 part-[base]:flex part-[base]:items-center part-[base]:gap-2"
        >
          <sl-icon name="exclamation-diamond-fill" class="text-base"></sl-icon>
          ${msg("Some dependencies were deleted and cannot be displayed.")}
        </btrix-alert>
      `;
    };

    return html` ${when(
      // TODO More accurate warning by checking if all required IDs exist
      this.dedupeCrawlsTask.value?.total &&
        !this.dependenciesTask.value?.total &&
        this.collection?.indexStats?.removedCrawls,
      deletedItemsWarning,
    )}
    ${this.renderDependencyTree(this.dependenciesTask, empty)}`;
  };

  private readonly renderDependencyTree = (
    itemsTask:
      | CollectionDetailDedupe["dedupeCrawlsTask"]
      | CollectionDetailDedupe["dependenciesTask"],
    empty: () => TemplateResult,
  ) => {
    const loading = () => html`
      <sl-skeleton effect="sheen" class="h-9"></sl-skeleton>
    `;
    const items = (items?: APIPaginatedList<ArchivedItem>) =>
      items?.items.length
        ? html`
            <btrix-item-dependency-tree
              .items=${items.items}
              collectionId=${this.collectionId}
              showHeader
            ></btrix-item-dependency-tree>

            <footer class="mt-6 flex justify-center">
              <btrix-pagination
                page=${items.page}
                totalCount=${items.total}
                size=${items.pageSize}
                @page-change=${async (e: PageChangeEvent) => {
                  this.pagination = {
                    ...this.pagination,
                    page: e.detail.page,
                  };

                  await itemsTask.taskComplete;

                  // Scroll to top of list
                  // TODO once deep-linking is implemented, scroll to top of pushstate
                  this.scrollIntoView({ behavior: "smooth" });
                }}
              ></btrix-pagination>
            </footer>
          `
        : empty();

    return html`${itemsTask.render({
      initial: loading,
      pending: () => (itemsTask.value ? items(itemsTask.value) : loading()),
      complete: items,
    })}`;
  };

  private renderOverview() {
    const state = this.collection?.indexState;
    const updating = indexUpdating(state || null);

    return panel({
      heading: msg("Index Overview"),
      actions: this.appState.isAdmin
        ? html`<slot name="actions"></slot>`
        : undefined,
      body: html`<btrix-desc-list>
        <btrix-desc-list-item label=${msg("Index Status")}>
          ${indexStatus(state)}
        </btrix-desc-list-item>
        ${when(
          state && this.collection,
          (col) => html`
            ${col.indexLastSavedAt
              ? html`<btrix-desc-list-item label=${msg("Index Last Updated")}>
                  ${this.localize.relativeDate(col.indexLastSavedAt)}
                </btrix-desc-list-item>`
              : nothing}
            ${when(
              this.appState.isAdmin,
              () => html`
                <btrix-desc-list-item label=${msg("Purgeable Items")}>
                  ${col.indexStats?.removedCrawls
                    ? this.localize.number(col.indexStats.removedCrawls)
                    : stringFor.none}
                </btrix-desc-list-item>
              `,
            )}
            ${updating
              ? html`<btrix-desc-list-item label=${msg("Import Progress")}>
                  <btrix-index-import-progress
                    collectionId=${this.collectionId}
                    initialValue=${ifDefined(col.indexStats?.updateProgress)}
                    @btrix-progress-complete=${() =>
                      this.dispatchEvent(
                        new CustomEvent("btrix-request-update"),
                      )}
                  ></btrix-index-import-progress>
                </btrix-desc-list-item>`
              : nothing}
          `,
        )}
      </btrix-desc-list>`,
    });
  }
}
