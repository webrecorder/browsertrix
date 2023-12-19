import {
  type TemplateResult,
  type PropertyValues,
  LitElement,
  html,
  css,
} from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { until } from "lit/directives/until.js";
import { msg, localized, str } from "@lit/localize";
import queryString from "query-string";

import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import { APIController } from "@/controllers/api";
import type { Workflow, ArchivedItem, Crawl } from "@/types/crawler";
import { type AuthState } from "@/utils/AuthService";
import { TailwindElement } from "@/classes/TailwindElement";
import { finishedCrawlStates } from "@/utils/crawler";

const CRAWLS_PAGE_SIZE = 50;

/**
 * @example Usage:
 * ```ts
 * ```
 */
@localized()
@customElement("btrix-collection-workflow-list")
export class CollectionWorkflowList extends TailwindElement {
  static styles = css`
    :host {
      --border: 1px solid var(--sl-panel-border-color);
    }

    sl-tree-item.workflow:not(.selectable)::part(base) {
      cursor: default;
    }

    sl-tree-item.workflow:not(.selectable)::part(checkbox) {
      visibility: hidden;
    }

    sl-tree-item::part(expand-button) {
      /* Move expand button to end */
      order: 2;
      /* Increase size */
      font-size: 1rem;
      padding: var(--sl-spacing-small);
    }

    /* Increase size of label */
    sl-tree-item::part(label) {
      flex: 1;
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

  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  orgId?: string;

  @property({ type: Array })
  workflows: Workflow[] = [];

  /**
   * Whether item is selected or not, keyed by ID
   */
  @property({ type: Object })
  selection: { [itemID: string]: boolean } = {};

  private crawlsMap: Map</* workflow ID: */ string, Promise<Crawl[]>> =
    new Map();

  private api = new APIController(this);

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("workflows")) {
      this.fetchCrawls();
    }
  }

  render() {
    return html`<sl-tree selection="multiple">
      <sl-icon slot="expand-icon" name="chevron-double-down"></sl-icon>
      <sl-icon slot="collapse-icon" name="chevron-double-left"></sl-icon>
      ${this.workflows.map(this.renderWorkflowAsync)}</sl-tree
    >`;
  }

  private renderWorkflowAsync = (workflow: Workflow) =>
    until(
      this.crawlsMap
        .get(workflow.id)
        ?.then((crawls) => this.renderWorkflow(workflow, crawls)),
      html`loading`
    );

  private renderWorkflow = (workflow: Workflow, crawls: Crawl[]) => {
    const crawlCount = crawls.length || 0;
    let selectedCrawlCount = 0;
    if (crawlCount) {
      selectedCrawlCount = crawls.filter(({ id }) => this.selection[id]).length;
    }
    const isSelected = selectedCrawlCount > 0;
    // sl-tree-item doesn't expose `?indeterminate`
    // so we need to set the value directly with `.indeterminate`
    // See https://github.com/shoelace-style/shoelace/discussions/1630
    const isIndeterminate = isSelected && selectedCrawlCount < crawlCount;
    return html`
      <sl-tree-item
        class=${classMap({
          workflow: true,
          selectable: crawlCount > 0,
        })}
        .indeterminate=${isIndeterminate}
        ?selected=${!isIndeterminate && isSelected}
        @click=${(e: MouseEvent) => {
          if (!crawlCount) {
            // Prevent selection since we're just allowing auto-add
            e.stopPropagation();
          }
        }}
      >
        <div class="flex-1 flex items-center gap-6">
          <div class="flex-1">${this.renderName(workflow)}</div>
          <div class="flex-0 text-neutral-500 text-right">
            ${crawlCount === 1
              ? msg(
                  str`${selectedCrawlCount.toLocaleString()} / ${crawlCount?.toLocaleString()} crawl`
                )
              : crawlCount
              ? msg(
                  str`${selectedCrawlCount.toLocaleString()} / ${crawlCount?.toLocaleString()} crawls`
                )
              : msg("0 crawls")}
          </div>
          <div class="flex-0">
            <sl-switch
              class="flex"
              size="small"
              ?checked=${workflow.autoAddCollections?.length > 0}
              @click=${(e: MouseEvent) => e.stopPropagation()}
            >
              <span class="text-neutral-500">${msg("Auto-Add")}</span>
            </sl-switch>
          </div>
        </div>
        ${crawls.map(this.renderCrawl)}
      </sl-tree-item>
    `;
  };

  private renderCrawl = (crawl: Crawl) => {
    const pageCount = +(crawl.stats?.done || 0);
    return html`
      <sl-tree-item
        ?selected=${this.selection[crawl.id]}
        data-crawl-id=${crawl.id}
      >
        <div class="flex-1 flex items-center">
          <div class="flex-1">
            <sl-format-date
              date=${`${crawl.finished}Z`}
              month="2-digit"
              day="2-digit"
              year="2-digit"
              hour="2-digit"
              minute="2-digit"
            ></sl-format-date>
          </div>
          <div class="flex-1">
            <btrix-crawl-status state=${crawl.state}></btrix-crawl-status>
          </div>
          <div class="flex-1">
            <sl-format-bytes
              value=${crawl.fileSize || 0}
              display="narrow"
            ></sl-format-bytes>
          </div>
          <div class="flex-1">
            ${pageCount === 1
              ? msg(str`${pageCount.toLocaleString()} page`)
              : msg(str`${pageCount.toLocaleString()} pages`)}
          </div>
          <div class="flex-1">${crawl.userName}</div>
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
            ({ items }) => items
          )
        );
      });
      await this.crawlsMap.values();
      console.debug("all done");
    } catch (e: unknown) {
      console.log(e);
    }
  }

  private async getCrawls(
    params: Partial<{
      cid: string;
    }> &
      APIPaginationQuery &
      APISortQuery
  ) {
    if (!this.authState) throw new Error("Missing attribute `authState`");
    if (!this.orgId) throw new Error("Missing attribute `orgId`");

    const query = queryString.stringify(
      {
        state: finishedCrawlStates,
        ...params,
      },
      {
        arrayFormat: "comma",
      }
    );
    const data = await this.api.fetch<APIPaginatedList<Crawl>>(
      `/orgs/${this.orgId}/crawls?${query}`,
      this.authState
    );

    return data;
  }

  // TODO consolidate collections/workflow name
  private renderName(workflow: Workflow) {
    if (workflow.name)
      return html`<span class="truncate">${workflow.name}</span>`;
    if (!workflow.firstSeed)
      return html`<span class="truncate">${workflow.id}</span>`;
    const remainder = workflow.seedCount - 1;
    let nameSuffix: string | TemplateResult<1> = "";
    if (remainder) {
      if (remainder === 1) {
        nameSuffix = html`<span class="additionalUrls"
          >${msg(str`+${remainder} URL`)}</span
        >`;
      } else {
        nameSuffix = html`<span class="additionalUrls"
          >${msg(str`+${remainder} URLs`)}</span
        >`;
      }
    }
    return html`
      <span class="primaryUrl truncate">${workflow.firstSeed}</span
      >${nameSuffix}
    `;
  }
}
