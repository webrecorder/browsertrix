import { localized, msg, str } from "@lit/localize";
import type {
  SlSelectionChangeEvent,
  SlTree,
  SlTreeItem,
} from "@shoelace-style/shoelace";
import {
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { dedupeStatusIcon } from "@/features/archived-items/templates/dedupe-status-icon";
import type { APIPaginatedList } from "@/types/api";
import type { Crawl, Workflow } from "@/types/crawler";
import { pluralOf } from "@/utils/pluralize";

import "@/features/collections/collection-workflow-list/settings";

export type CrawlsPageChangeDetail = {
  workflowId: string;
  page: number;
};
export type SelectionChangeDetail = {
  workflowSelection: Map<
    string,
    {
      checked: boolean | "indeterminate";
      selectionCount: number;
      allSelected?: boolean;
      addCrawls?: Set<string>;
      removeCrawls?: Set<string>;
    }
  >;
};

/**
 * @fires btrix-selection-change
 * @fires btrix-crawls-page-change
 */
@customElement("btrix-collection-workflow-list")
@localized()
export class CollectionWorkflowList extends BtrixElement {
  static styles = css`
    :host {
      --border: 1px solid var(--sl-panel-border-color);
    }

    sl-tree-item {
      min-width: 0;
    }

    sl-tree-item:not([disabled])::part(item):hover {
      background-color: var(--sl-color-neutral-50);
    }

    sl-tree-item::part(expand-button) {
      /* Move expand button to end */
      order: 2;
      /* Increase size */
      font-size: 1rem;
      padding: var(--sl-spacing-small);
      flex: none;
    }

    /* Increase size of label */
    sl-tree-item::part(label) {
      flex: 1 1 0%;
      overflow: hidden;
    }

    /* Hide default indentation marker */
    sl-tree-item::part(item--selected) {
      background-color: transparent;
      border-inline-start-color: transparent;
    }

    /* Remove indentation spacing */
    sl-tree-item::part(indentation) {
      display: none;
    }

    sl-tree-item::part(checkbox) {
      padding: var(--sl-spacing-small);
    }

    /* Add disabled styles only to checkbox */
    sl-tree-item::part(item--disabled) {
      opacity: 1;
    }
    sl-tree-item[disabled]::part(checkbox) {
      opacity: 0;
    }

    sl-tree > sl-tree-item:not([expanded])::part(item) {
      box-shadow: var(--sl-shadow-small);
    }

    sl-tree > sl-tree-item::part(item) {
      border: var(--border);
      border-radius: var(--sl-border-radius-medium);
    }

    sl-tree > sl-tree-item:nth-of-type(n + 2) {
      margin-top: var(--sl-spacing-x-small);
    }

    sl-tree-item::part(children) {
      border-left: var(--border);
      border-right: var(--border);
      border-bottom: var(--border);
      border-bottom-left-radius: var(--sl-border-radius-medium);
      border-bottom-right-radius: var(--sl-border-radius-medium);
      /* Offset child checkboxes */
      margin: 0 var(--sl-spacing-x-small);
    }

    sl-tree-item > sl-tree-item:nth-of-type(n + 2) {
      border-top: var(--border);
    }
  `;

  @property({ type: String })
  collectionId?: string;

  @property({ type: Array, attribute: false })
  workflows: Workflow[] = [];

  /**
   * Selection state for individual archived items
   */
  @property({ attribute: false })
  selectedItems = new Set<string>();

  /**
   * Deselected items when workflow is in "select all" mode
   */
  @property({ attribute: false })
  deselectedItems = new Set<string>();

  /**
   * Selection state for workflows
   */
  @property({ attribute: false })
  workflowSelection = new Map<
    string,
    {
      checked: boolean | "indeterminate";
      selectionCount: number;
      allSelected?: boolean;
    }
  >();

  @property({ attribute: false })
  workflowCrawls = new Map<
    /* workflow ID: */ string,
    {
      selectedCrawls: APIPaginatedList<Crawl> | null;
      paginatedCrawls: APIPaginatedList<Crawl> | null;
    }
  >();

  @state()
  expandWorkflowSettings = false;

  @query("sl-tree")
  private readonly tree?: SlTree | null;

  private previousSelection = new Set<SlTreeItem>();

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("workflows")) {
      if (this.collectionId) {
        const collId = this.collectionId;
        this.expandWorkflowSettings = this.workflows.some((workflow) =>
          workflow.autoAddCollections.some((id) => id === collId),
        );
      }
    }
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("workflowCrawls")) {
      void this.setPreviousSelection();
    }
  }

  private async setPreviousSelection() {
    if (!this.tree) {
      console.debug("no this.tree");
      return;
    }

    await this.tree.updateComplete;

    this.previousSelection = new Set(this.tree.selectedItems);
  }

  render() {
    return html`<sl-tree
      class="part-[base]:grid part-[base]:grid-cols-[1fr_min-content] part-[base]:gap-2"
      selection="multiple"
      @sl-selection-change=${this.onSelectionChange}
      @mousedown=${(e: MouseEvent) => {
        if ((e.target as HTMLElement).tagName !== "SL-TREE-ITEM") {
          // Prevent sl-tree from switching focusing
          // https://github.com/shoelace-style/shoelace/blob/370727c7bf70d427ad0cbb80d95df226c87dc77a/src/components/tree/tree.component.ts#L404C10-L404C19
          e.preventDefault();
        }
      }}
    >
      <sl-icon slot="expand-icon" name="chevron-double-down"></sl-icon>
      <sl-icon slot="collapse-icon" name="chevron-double-left"></sl-icon>
      ${repeat(this.workflows, ({ id }) => id, this.renderWorkflow)}
    </sl-tree>`;
  }

  private readonly renderWorkflow = (workflow: Workflow) => {
    const total = workflow.crawlSuccessfulCount;
    const selection = this.workflowSelection.get(workflow.id);
    const crawls = this.workflowCrawls.get(workflow.id);
    const paginatedCrawls = crawls?.paginatedCrawls;
    const allSelected = selection?.checked === true;

    return html`
      <sl-tree-item
        class="workflow !mt-0"
        data-workflow-id=${workflow.id}
        ?selected=${allSelected}
        .indeterminate=${selection?.checked === "indeterminate"}
        ?disabled=${!total || !crawls}
        @sl-after-collapse=${() => {
          // Reset crawls page
          this.dispatchEvent(
            new CustomEvent<CrawlsPageChangeDetail>(
              "btrix-crawls-page-change",
              {
                detail: { workflowId: workflow.id, page: 1 },
              },
            ),
          );
        }}
        @click=${(e: MouseEvent) => {
          if ((e.currentTarget as SlTreeItem).disabled) {
            e.stopPropagation();
          }
        }}
      >
        <div
          class="pointer-events-none flex min-h-5 flex-1 items-center gap-2 overflow-hidden leading-none md:gap-x-6"
        >
          <div class="min-h-4 flex-1 overflow-hidden">
            ${this.renderName(workflow)}
          </div>
          <div
            class="flex flex-none items-center gap-3 whitespace-nowrap text-neutral-500 md:text-right"
          >
            ${this.renderSelectionMessage(workflow)}
          </div>
        </div>
        ${when(paginatedCrawls, (crawls) =>
          this.renderCrawls(workflow, crawls),
        )}
      </sl-tree-item>
      <btrix-collection-workflow-list-settings
        collectionId=${ifDefined(this.collectionId)}
        workflowId=${workflow.id}
        dedupeCollId=${ifDefined(workflow.dedupeCollId || undefined)}
        .autoAddCollections=${workflow.autoAddCollections}
        ?collapse=${!this.expandWorkflowSettings}
      ></btrix-collection-workflow-list-settings>
    `;
  };

  private readonly renderSelectionMessage = (workflow: Workflow) => {
    const selectionCount =
      this.workflowSelection.get(workflow.id)?.selectionCount || 0;
    const total = workflow.crawlSuccessfulCount;
    const number_of_total_items = this.localize.number(total);
    const plural_of_total_items = pluralOf("items", total);

    if (!total) {
      return `${number_of_total_items} ${plural_of_total_items}`;
    }

    return html`
      ${this.localize.number(selectionCount)} / ${number_of_total_items}
      ${plural_of_total_items}
    `;
  };

  private readonly renderCrawls = (
    workflow: Workflow,
    res: APIPaginatedList<Crawl> | null,
  ) => {
    if (!res?.items.length) return nothing;

    let pagination: TemplateResult | typeof nothing = nothing;
    const selection = this.workflowSelection.get(workflow.id);
    const crawls = this.workflowCrawls.get(workflow.id);
    const paginatedCrawlIds = new Set(
      crawls?.paginatedCrawls?.items.map(({ id }) => id) || [],
    );
    const hiddenSelection =
      selection?.selectionCount &&
      crawls?.selectedCrawls?.items.some(
        ({ id }) => !paginatedCrawlIds.has(id),
      );

    if (res.total > res.pageSize) {
      // Include in tree selection so that workflow tree item correctly displays
      // as indeterminate, but prevent user selection
      pagination = html`<sl-tree-item
        class="pagination part-[item]:cursor-default part-[label]:justify-center part-[checkbox]:opacity-0 part-[item]:hover:!bg-transparent"
        ?selected=${Boolean(hiddenSelection)}
        @click=${(e: MouseEvent) => e.stopPropagation()}
      >
        <btrix-pagination
          class="mr-3"
          page=${res.page}
          size=${res.pageSize}
          totalCount=${res.total}
          disablePersist
          @page-change=${(e: PageChangeEvent) => {
            this.dispatchEvent(
              new CustomEvent<CrawlsPageChangeDetail>(
                "btrix-crawls-page-change",
                {
                  detail: { workflowId: workflow.id, page: e.detail.page },
                },
              ),
            );
          }}
        >
        </btrix-pagination>
      </sl-tree-item>`;
    }

    return html`${repeat(
      res.items,
      ({ id }) => id,
      this.renderCrawl,
    )}${pagination}`;
  };

  private readonly renderCrawl = (crawl: Crawl) => {
    const pageCount = +(crawl.stats?.done || 0);
    const selection = this.workflowSelection.get(crawl.cid);

    // Determine if crawl is selected:
    // - If workflow is in allSelected mode: selected unless in deselectedItems
    // - Otherwise: use previous logic
    let selected: boolean | undefined;
    if (selection?.allSelected) {
      selected = !this.deselectedItems.has(crawl.id);
    } else if (selection?.checked === "indeterminate") {
      selected = this.selectedItems.has(crawl.id);
    } else {
      selected = selection?.checked;
    }

    return html`
      <sl-tree-item
        ?selected=${selected}
        class="crawl"
        data-crawl-id=${crawl.id}
        data-workflow-id=${crawl.cid}
        @click=${async (e: MouseEvent) => {
          const el = e.currentTarget as SlTreeItem;
          if (el.disabled) {
            e.stopPropagation();
            return;
          }

          const pagination = el
            .closest<SlTreeItem>(".workflow")
            ?.querySelector<SlTreeItem>(".pagination");
          const workflowSelection = this.workflowSelection.get(crawl.cid);
          const workflow = this.workflows.find(({ id }) => id === crawl.cid);

          if (pagination && workflowSelection && workflow) {
            // HACK Render parent tree item (i.e. workflow) as indeterminate
            // by making invisible checkbox the opposite of current checkbox
            if (
              (el.selected && workflowSelection.selectionCount - 1) ||
              workflowSelection.selectionCount + 1 <
                workflow.crawlSuccessfulCount
            ) {
              if (workflowSelection.selectionCount - 1) {
                pagination.selected = el.selected;
              } else {
                // Select none
                pagination.selected = false;
              }
            } else {
              if (
                !el.selected &&
                workflowSelection.selectionCount + 1 ===
                  workflow.crawlSuccessfulCount
              ) {
                // Select all
                pagination.selected = true;
              }
            }
          }
        }}
      >
        <div class="grid flex-1 grid-cols-5 items-center">
          <div class="col-span-4 flex items-center gap-2 md:col-span-2">
            ${when(this.featureFlags.has("dedupeEnabled"), () =>
              dedupeStatusIcon(crawl),
            )}
            <btrix-format-date
              .date=${crawl.finished}
              month="2-digit"
              day="2-digit"
              year="numeric"
              hour="2-digit"
              minute="2-digit"
            ></btrix-format-date>
          </div>
          <div class="col-span-1 md:col-span-1">
            ${this.localize.bytes(crawl.fileSize || 0, {
              unitDisplay: "narrow",
            })}
          </div>
          <div class="col-span-5 md:col-span-1">
            ${pageCount === 1
              ? msg(str`${this.localize.number(pageCount)} page`)
              : msg(str`${this.localize.number(pageCount)} pages`)}
          </div>
          <div class="col-span-35md:col-span-1">
            <btrix-qa-review-status
              status=${ifDefined(crawl.reviewStatus)}
            ></btrix-qa-review-status>
          </div>
        </div>
      </sl-tree-item>
    `;
  };

  private readonly onSelectionChange = async (e: SlSelectionChangeEvent) => {
    e.stopPropagation();

    const workflows = this.tree?.querySelectorAll<SlTreeItem>(".workflow");

    const workflowSelection: SelectionChangeDetail["workflowSelection"] =
      new Map();

    const itemChanged = (item: SlTreeItem) => {
      return this.previousSelection.has(item) !== item.selected;
    };

    workflows?.forEach((el) => {
      const workflowId = el.dataset.workflowId;
      if (!workflowId) {
        console.debug("no workflowId");
        return;
      }

      const addCrawls = new Set<string>();
      const removeCrawls = new Set<string>();

      const crawlEls = el.getChildrenItems({ includeDisabled: false });
      let selectionCount =
        this.workflowSelection.get(workflowId)?.selectionCount || 0;

      crawlEls.forEach((el) => {
        const crawlId = el.dataset.crawlId;
        if (!crawlId) {
          console.debug("no crawlId");
          return;
        }

        if (itemChanged(el)) {
          if (el.selected) {
            selectionCount += 1;
            addCrawls.add(crawlId);
          } else {
            selectionCount = selectionCount ? selectionCount - 1 : 0;
            removeCrawls.add(crawlId);
          }
        }
      });

      if (el.selected) {
        workflowSelection.set(workflowId, {
          checked: true,
          selectionCount:
            this.workflowCrawls.get(workflowId)?.paginatedCrawls?.total || 0,
          allSelected: true,
          addCrawls,
          removeCrawls,
        });
      } else if (el.indeterminate) {
        const currentSelection = this.workflowSelection.get(workflowId);
        workflowSelection.set(workflowId, {
          checked: "indeterminate",
          selectionCount,
          allSelected: currentSelection?.allSelected,
          addCrawls,
          removeCrawls,
        });
      } else {
        workflowSelection.set(workflowId, {
          checked: false,
          selectionCount: 0,
          allSelected: false,
          addCrawls,
          removeCrawls,
        });
      }
    });

    this.dispatchEvent(
      new CustomEvent<SelectionChangeDetail>("btrix-selection-change", {
        detail: {
          workflowSelection,
        },
      }),
    );

    this.previousSelection = new Set(e.detail.selection);
  };

  // TODO consolidate collections/workflow name
  private readonly renderName = (workflow: Workflow) => {
    if (workflow.name) return html`<span>${workflow.name}</span>`;
    if (workflow.firstSeed && workflow.seedCount) {
      const remainder = workflow.seedCount - 1;
      let nameSuffix: string | TemplateResult<1> = "";
      if (remainder) {
        nameSuffix = html`<span class="ml-1"
          >+${this.localize.number(remainder, { notation: "compact" })}
          ${pluralOf("URLs", remainder)}</span
        >`;
      }
      return html`
        <div class="flex overflow-hidden whitespace-nowrap">
          <span class="min-w-0 truncate">${workflow.firstSeed}</span>
          <span>${nameSuffix}</span>
        </div>
      `;
    }
  };
}
