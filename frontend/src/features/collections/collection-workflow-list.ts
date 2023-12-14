import { type TemplateResult, LitElement, html, css } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators.js";
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
  items: Workflow[] = [];

  /** Crawls keyed by workflow ID */
  @state()
  private crawlsByWorkflowID: { [workflowID: string]: Crawl[] } = {};

  private api = new APIController(this);

  render() {
    return html`<sl-tree selection="multiple">
      <sl-icon slot="expand-icon" name="chevron-double-down"></sl-icon>
      <sl-icon slot="collapse-icon" name="chevron-double-left"></sl-icon>
      ${this.items.map(this.renderWorkflow)}</sl-tree
    >`;
  }

  renderWorkflow = (workflow: Workflow) => {
    return html`
      <sl-tree-item
        ?lazy=${!this.crawlsByWorkflowID[workflow.id]}
        @sl-lazy-load=${() => this.fetchCrawls(workflow)}
      >
        ${this.renderName(workflow)}
        ${this.crawlsByWorkflowID[workflow.id]?.map(this.renderCrawl)}
      </sl-tree-item>
    `;
  };

  renderCrawl = (crawl: Crawl) => {
    const pageCount = +(crawl.stats?.done || 0);
    return html`
      <sl-tree-item selected>
        <div class="flex items-center w-full">
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

  private async fetchCrawls(workflow: Workflow) {
    try {
      const crawls = await this.getCrawls({ cid: workflow.id });
      this.crawlsByWorkflowID = {
        ...this.crawlsByWorkflowID,
        [workflow.id]: crawls.items,
      };
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
        ...params,
        pageSize: 100,
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
