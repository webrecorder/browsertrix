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
  selection: Record<string, boolean>;
  workflowSelection: Record<string, boolean>;
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

  @property({ type: Array })
  workflows: Workflow[] = [];

  @state()
  expandWorkflowSettings = false;

  /**
   * Whether item is selected or not, keyed by ID
   */
  @property({ type: Object })
  selection: { [itemID: string]: boolean } = {};

  /**
   * Whether to select all crawls of a workflow, even crawls not visible in UI
   */
  @property({ type: Object })
  workflowSelection: { [workflowID: string]: boolean } = {};

  @queryAll(".workflow:not([disabled])")
  private readonly selectableWorkflows?: NodeListOf<SlTreeItem>;

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
      @sl-selection-change=${(e: SlSelectionChangeEvent) => {
        e.stopPropagation();

        const selection: CollectionWorkflowList["selection"] = {};
        const workflowSelection: Record<string, boolean> = {};

        this.selectableWorkflows?.forEach((workflow) => {
          const workflowId = workflow.dataset.workflowId;
          if (!workflowId) return;

          if (workflow.selected) {
            workflowSelection[workflowId] = true;
          } else {
            if (this.workflowSelection[workflowId]) {
              workflowSelection[workflowId] = false;
            }

            const crawls = workflow.querySelectorAll<SlTreeItem>(".crawl");

            crawls.forEach((crawl) => {
              const crawlId = crawl.dataset.crawlId;
              if (!crawlId) return;

              if (crawl.selected) {
                selection[crawlId] = true;
              } else if (this.selection[crawlId]) {
                selection[crawlId] = false;
              }
            });
          }
        });

        this.dispatchEvent(
          new CustomEvent<SelectionChangeDetail>("btrix-selection-change", {
            detail: { selection, workflowSelection },
          }),
        );
      }}
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
    const countAsync = crawlsAsync.then((res) => {
      const total = res?.total ?? 0;
      return {
        total,
        selected: this.workflowSelection[workflow.id]
          ? total
          : res?.items.filter(({ id }) => this.selection[id]).length ?? 0,
      };
    });

    return html`
      <sl-tree-item
        class="workflow !mt-0"
        data-workflow-id=${workflow.id}
        ?selected=${until(
          countAsync.then(
            ({ total, selected }) => selected > 0 && selected === total,
          ),
          false,
        )}
        .indeterminate=${
          // NOTE `indeterminate` is not a documented public property,
          // we're manually setting it since async child tree-items
          // doesn't work as of shoelace 2.8.0
          until(
            countAsync.then(({ selected }) =>
              this.workflowSelection[workflow.id] ? false : selected > 0,
            ),
            false,
          )
        }
        ?disabled=${until(
          countAsync.then(({ total }) => total === 0),
          true,
        )}
        @click=${(e: MouseEvent) => {
          void countAsync.then(({ total }) => {
            if (!total) {
              // Prevent selection since we're just allowing auto-add
              e.stopPropagation();
            }
          });
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
            ${until(
              countAsync.then(
                ({ total, selected }) =>
                  html`${total
                    ? `${this.localize.number(selected)} / ${this.localize.number(total)}`
                    : 0}
                  ${pluralOf("crawls", total)}`,
              ),
            )}
          </div>
        </div>
        ${until(crawlsAsync.then(this.renderCrawls))}
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

  private readonly renderCrawls = (res: APIPaginatedList<Crawl> | null) => {
    if (!res?.items.length) return nothing;

    let selectOlderCrawls: TemplateResult | typeof nothing = nothing;

    if (res.total > res.pageSize) {
      const older = res.total - res.pageSize;
      const number_of_older_crawls = this.localize.number(older);
      let message = "";

      if (this.workflowSelection[res.items[0].cid]) {
        const plural = msg(
          str`All crawls selected, including ${number_of_older_crawls} older crawls.`,
        );

        message = pluralize(older, {
          zero: plural,
          one: msg(str`All crawls selected, including 1 older crawl.`),
          two: plural,
          few: plural,
          many: plural,
          other: plural,
        });
      } else {
        const plural = msg(
          str`${number_of_older_crawls} older crawls are hidden.`,
        );

        message = pluralize(older, {
          zero: plural,
          one: msg(str`1 older crawl is hidden.`),
          two: plural,
          few: plural,
          many: plural,
          other: plural,
        });
      }

      // Include in tree selection so that workflow tree item correctly displays
      // as indeterminate, but prevent user selection
      selectOlderCrawls = html`<sl-tree-item
        class="group part-[label]:text-neutral-500 part-[checkbox]:opacity-0"
        @click=${(e: MouseEvent) => e.stopPropagation()}
      >
        ${message}
      </sl-tree-item>`;
    }

    return html`${res.items.map(this.renderCrawl)}${selectOlderCrawls}`;
  };

  private readonly renderCrawl = (crawl: Crawl) => {
    const pageCount = +(crawl.stats?.done || 0);
    return html`
      <sl-tree-item
        ?selected=${this.selection[crawl.id]}
        class="crawl"
        data-crawl-id=${crawl.id}
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
      });
    } catch (e: unknown) {
      console.debug(e);
    }
  }

  private async getCrawls(
    params: Partial<{
      cid: string;
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
