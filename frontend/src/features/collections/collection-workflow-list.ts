import { localized, msg, str } from "@lit/localize";
import type {
  SlSelectionChangeEvent,
  SlTreeItem,
} from "@shoelace-style/shoelace";
import {
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property, queryAll, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import { dedupeStatusIcon } from "@/features/archived-items/templates/dedupe-status-icon";
import type { CollectionWorkflowListSettingChangeEvent } from "@/features/collections/collection-workflow-list/settings";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { Crawl, Workflow } from "@/types/crawler";
import { SortDirection } from "@/types/utils";
import { finishedCrawlStates } from "@/utils/crawler";
import { pluralize, pluralOf } from "@/utils/pluralize";

import "@/features/collections/collection-workflow-list/settings";

export type SelectionChangeDetail = {
  addCrawlIds: string[];
  removeCrawlIds: string[];
  selectedWorkflowIds: string[];
};
export type AutoAddChangeDetail = {
  id: string;
  checked: boolean;
  dedupe?: boolean;
};

const CRAWLS_PAGE_SIZE = 50;

/**
 * @fires btrix-selection-change
 * @fires btrix-auto-add-change
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

  @state()
  expandWorkflowSettings = false;

  @queryAll(".workflow:not([disabled])")
  private readonly selectableWorkflows?: NodeListOf<SlTreeItem>;

  /**
   * Keep track of crawls explicitly added or removed (vs. add/remove an entire workflow)
   * to prevent crawls outside of current page range from being marked as removed
   */
  private readonly explicitAddCrawlsSet = new Set<string>();
  private readonly explicitRemoveCrawlsSet = new Set<string>();

  /**
   * Map of count of all selected crawls, even ones not visible in current page
   */
  private readonly selectionCountMap = new Map<
    /* workflow ID: */ string,
    Promise<number>
  >();

  /**
   * Map of first page of crawls
   */
  private readonly crawlsMap = new Map<
    /* workflow ID: */ string,
    Promise<APIPaginatedList<Crawl> | null>
  >();

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("workflows")) {
      if (this.collectionId) {
        const collId = this.collectionId;
        this.expandWorkflowSettings = this.workflows.some((workflow) =>
          workflow.autoAddCollections.some((id) => id === collId),
        );
      }

      void this.fetchCrawls();
    }
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
    const crawlsAsync =
      this.crawlsMap.get(workflow.id) || Promise.resolve(null);
    const total = workflow.crawlSuccessfulCount;
    const selectionCountAsync =
      this.selectionCountMap.get(workflow.id) || Promise.resolve(0);

    return html`
      <sl-tree-item
        class="workflow !mt-0"
        data-workflow-id=${workflow.id}
        ?selected=${until(
          selectionCountAsync.then((count) => count && count === total),
        )}
        .indeterminate=${until(
          selectionCountAsync.then((count) => count && count < total),
        )}
        ?disabled=${!total}
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
        ${until(
          crawlsAsync.then((crawls) => this.renderCrawls(workflow, crawls)),
        )}
      </sl-tree-item>
      <btrix-collection-workflow-list-settings
        collectionId=${ifDefined(this.collectionId)}
        workflowId=${workflow.id}
        dedupeCollId=${ifDefined(workflow.dedupeCollId || undefined)}
        .autoAddCollections=${workflow.autoAddCollections}
        ?collapse=${!this.expandWorkflowSettings}
        @btrix-change=${(e: CollectionWorkflowListSettingChangeEvent) => {
          e.stopPropagation();

          const { autoAdd, dedupe } = e.detail.value;

          this.dispatchEvent(
            new CustomEvent<AutoAddChangeDetail>("btrix-auto-add-change", {
              detail: {
                id: workflow.id,
                checked: autoAdd,
                dedupe,
              },
              composed: true,
            }),
          );
        }}
      ></btrix-collection-workflow-list-settings>
    `;
  };

  private readonly renderSelectionMessage = (workflow: Workflow) => {
    const selectedAsync =
      this.selectionCountMap.get(workflow.id) || Promise.resolve(0);
    const total = workflow.crawlSuccessfulCount;
    const number_of_total_items = this.localize.number(total);
    const plural_of_total_items = pluralOf("items", total);

    if (!total) {
      return `${number_of_total_items} ${plural_of_total_items}`;
    }

    return until(
      selectedAsync.then(
        (count) =>
          `${this.localize.number(count)} / ${number_of_total_items} ${plural_of_total_items}`,
      ),
    );
  };

  private readonly renderCrawls = (
    workflow: Workflow,
    res: APIPaginatedList<Crawl> | null,
  ) => {
    if (!res?.items.length) return nothing;

    let selectOlderCrawls: TemplateResult | typeof nothing = nothing;

    if (res.total > res.pageSize) {
      const allSelectedAsync = (
        this.selectionCountMap.get(workflow.id) || Promise.resolve(0)
      ).then((count) => count === total);
      const total = workflow.crawlSuccessfulCount;

      const renderMessage = (allSelected: boolean) => {
        const older = res.total - res.pageSize;
        const number_of_older_crawls = this.localize.number(older);

        if (allSelected) {
          const plural = msg(
            str`All items selected, including ${number_of_older_crawls} older crawled items.`,
          );

          return pluralize(older, {
            zero: plural,
            one: msg(str`All items selected, including 1 older crawled item.`),
            two: plural,
            few: plural,
            many: plural,
            other: plural,
          });
        }

        const plural = msg(
          str`${number_of_older_crawls} older crawled items are hidden.`,
        );

        return pluralize(older, {
          zero: plural,
          one: msg(str`1 older crawled item is hidden.`),
          two: plural,
          few: plural,
          many: plural,
          other: plural,
        });
      };

      // Include in tree selection so that workflow tree item correctly displays
      // as indeterminate, but prevent user selection
      selectOlderCrawls = html`<sl-tree-item
        class="part-[label]:text-neutral-500 part-[checkbox]:opacity-0"
        ?selected=${until(allSelectedAsync)}
        @click=${(e: MouseEvent) => e.stopPropagation()}
      >
        ${until(allSelectedAsync.then(renderMessage))}
      </sl-tree-item>`;
    }

    return html`${selectOlderCrawls}
    ${repeat(res.items, ({ id }) => id, this.renderCrawl)}`;
  };

  private readonly renderCrawl = (crawl: Crawl) => {
    const pageCount = +(crawl.stats?.done || 0);

    return html`
      <sl-tree-item
        ?selected=${!!this.collectionId &&
        crawl.collectionIds.includes(this.collectionId)}
        class="crawl"
        data-crawl-id=${crawl.id}
        data-workflow-id=${crawl.cid}
        @click=${async (e: MouseEvent) => {
          const el = e.currentTarget as SlTreeItem;
          if (el.disabled) {
            e.stopPropagation();
            return;
          }

          const selectedAsync = this.selectionCountMap.get(crawl.cid);

          if (!selectedAsync) {
            console.debug("no selectedAsync for ", crawl.cid);
            return;
          }

          const nextSelected = !el.selected;

          const add = (id: string) => {
            this.explicitAddCrawlsSet.add(id);
            this.explicitRemoveCrawlsSet.delete(id);
          };
          const remove = (id: string) => {
            this.explicitRemoveCrawlsSet.add(id);
            this.explicitAddCrawlsSet.delete(id);
          };

          if (nextSelected) {
            add(crawl.id);

            // TODO Handle removing all and then adding one

            this.selectionCountMap.set(
              crawl.cid,
              selectedAsync.then((count) => count + 1),
            );
          } else {
            remove(crawl.id);

            // TODO Handle adding all and then removing

            this.selectionCountMap.set(
              crawl.cid,
              selectedAsync.then((count) => count - 1),
            );
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

    const selectedWorkflowIds = new Set<string>();

    // Update selection counts based on selected or deselected workflows
    this.selectableWorkflows?.forEach((el) => {
      const workflowId = el.dataset.workflowId;
      if (!workflowId) {
        console.debug("no workflowId");
        return;
      }

      const workflow = this.workflows.find(({ id }) => id === workflowId);
      if (!workflow) {
        console.debug("no workflow");
        return;
      }

      if (el.selected) {
        const children = el.getChildrenItems({ includeDisabled: false });

        if (children.length === 1) {
          // Treat like individual crawl selection
          const crawlId = children[0].dataset.crawlId;

          if (crawlId) {
            this.explicitAddCrawlsSet.add(crawlId);
          }
        } else {
          selectedWorkflowIds.add(workflowId);
        }

        this.selectionCountMap.set(
          workflowId,
          Promise.resolve(workflow.crawlSuccessfulCount),
        );
      } else if (!el.indeterminate) {
        this.selectionCountMap.set(workflowId, Promise.resolve(0));
      }
    });

    this.dispatchEvent(
      new CustomEvent<SelectionChangeDetail>("btrix-selection-change", {
        detail: {
          addCrawlIds: [...this.explicitAddCrawlsSet],
          removeCrawlIds: [...this.explicitRemoveCrawlsSet],
          selectedWorkflowIds: [...selectedWorkflowIds],
        },
      }),
    );
  };

  /**
   * Get crawls for each workflow in list
   */
  private async fetchCrawls() {
    try {
      this.workflows.forEach((workflow) => {
        this.crawlsMap.set(
          workflow.id,
          this.getCrawls({
            cid: workflow.id,
            pageSize: CRAWLS_PAGE_SIZE,
          }).catch((err) => {
            console.debug(err);
            return null;
          }),
        );

        this.selectionCountMap.set(
          workflow.id,
          this.getCrawls({
            cid: workflow.id,
            collectionId: this.collectionId,
            // We only need totals
            pageSize: 1,
          })
            .then(({ total }) => total)
            .catch((err) => {
              console.debug(err);
              return 0;
            }),
        );
      });
    } catch (e: unknown) {
      console.debug(e);
    }
  }

  private async getCrawls(
    params: Partial<{
      cid: string;
      collectionId?: string;
    }> &
      APIPaginationQuery &
      APISortQuery,
  ) {
    if (!this.orgId) throw new Error("Missing attribute `orgId`");

    const query = queryString.stringify(
      {
        state: finishedCrawlStates,
        sortBy: "started",
        sortDirection: SortDirection.Descending,
        ...params,
      },
      {
        arrayFormat: "comma",
      },
    );
    const data = await this.api.fetch<APIPaginatedList<Crawl>>(
      `/orgs/${this.orgId}/crawls?${query}`,
    );

    return data;
  }

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
