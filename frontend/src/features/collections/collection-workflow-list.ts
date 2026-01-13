import { localized, msg, str } from "@lit/localize";
import type { SlTreeItem } from "@shoelace-style/shoelace";
import { css, html, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, queryAll } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { until } from "lit/directives/until.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { Crawl, Workflow } from "@/types/crawler";
import { finishedCrawlStates } from "@/utils/crawler";
import { pluralOf } from "@/utils/pluralize";

import "@/features/collections/collection-workflow-list/settings";

export type SelectionChangeDetail = {
  selection: Record<string, boolean>;
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
    sl-tree-item.workflow:not(.selectable)::part(checkbox) {
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

  /**
   * Whether item is selected or not, keyed by ID
   */
  @property({ type: Object })
  selection: { [itemID: string]: boolean } = {};

  @queryAll(".crawl")
  private readonly crawlItems?: NodeListOf<SlTreeItem>;

  private readonly crawlsMap = new Map<
    /* workflow ID: */ string,
    Promise<Crawl[]>
  >();

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("workflows")) {
      void this.fetchCrawls();
    }
  }

  render() {
    return html`<sl-tree
      class="part-[base]:grid part-[base]:grid-cols-[1fr_min-content] part-[base]:gap-2 part-[base]:gap-x-3"
      selection="multiple"
      @sl-selection-change=${(e: CustomEvent<{ selection: SlTreeItem[] }>) => {
        if (!this.crawlItems) {
          console.debug("no crawl items with classname `crawl`");
          return;
        }
        e.stopPropagation();
        const selection: CollectionWorkflowList["selection"] = {};
        Array.from(this.crawlItems).forEach((item) => {
          if (!item.dataset.crawlId) return;
          selection[item.dataset.crawlId] = item.selected;
        });
        this.dispatchEvent(
          new CustomEvent<SelectionChangeDetail>("btrix-selection-change", {
            detail: { selection },
          }),
        );
      }}
    >
      <sl-icon slot="expand-icon" name="chevron-double-down"></sl-icon>
      <sl-icon slot="collapse-icon" name="chevron-double-left"></sl-icon>
      ${repeat(this.workflows, ({ id }) => id, this.renderWorkflow)}
    </sl-tree>`;
  }

  private readonly renderWorkflow = (workflow: Workflow) => {
    const crawlsAsync = this.crawlsMap.get(workflow.id) || Promise.resolve([]);
    const countAsync = crawlsAsync.then((crawls) => ({
      total: crawls.length,
      selected: crawls.filter(({ id }) => this.selection[id]).length,
    }));

    return html`
      <sl-tree-item
        class="workflow ${until(
          countAsync.then(({ total }) => (total > 0 ? "selectable" : "")),
          "",
        )} !mt-0"
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
            countAsync.then(
              ({ total, selected }) => selected > 0 && selected < total,
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
          class="flex min-h-5 flex-1 items-center gap-2 overflow-hidden leading-none md:gap-x-6"
        >
          <div class="flex-1 overflow-hidden">${this.renderName(workflow)}</div>
          <div
            class="flex-none whitespace-nowrap text-neutral-500 md:text-right"
          >
            ${until(
              countAsync.then(({ total, selected }) =>
                total === 1
                  ? msg(
                      str`${this.localize.number(selected)} / ${this.localize.number(total)} crawl`,
                    )
                  : total
                    ? msg(
                        str`${this.localize.number(selected)} / ${this.localize.number(total)} crawls`,
                      )
                    : msg("0 crawls"),
              ),
            )}
          </div>
        </div>
        ${until(crawlsAsync.then((crawls) => crawls.map(this.renderCrawl)))}
      </sl-tree-item>
      <btrix-collection-workflow-list-settings
        .workflow=${workflow}
        @click=${(e: MouseEvent) => {
          e.stopPropagation();
        }}
      ></btrix-collection-workflow-list-settings>
    `;
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
          <div class="col-span-3 md:col-span-1">
            <btrix-format-date
              .date=${crawl.finished}
              month="2-digit"
              day="2-digit"
              year="numeric"
              hour="2-digit"
              minute="2-digit"
            ></btrix-format-date>
          </div>
          <div class="col-span-2 md:col-span-1">
            <btrix-crawl-status state=${crawl.state}></btrix-crawl-status>
          </div>
          <div class="col-span-3 md:col-span-1">
            ${this.localize.bytes(crawl.fileSize || 0, {
              unitDisplay: "narrow",
            })}
          </div>
          <div class="col-span-2 md:col-span-1">
            ${pageCount === 1
              ? msg(str`${this.localize.number(pageCount)} page`)
              : msg(str`${this.localize.number(pageCount)} pages`)}
          </div>
          <div class="col-span-5 truncate md:col-span-1">
            ${msg(str`Started by ${crawl.userName}`)}
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
          this.getCrawls({ cid: workflow.id, pageSize: CRAWLS_PAGE_SIZE }).then(
            ({ items }) => items,
          ),
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
