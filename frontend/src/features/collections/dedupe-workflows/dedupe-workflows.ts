import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import clsx from "clsx";
import { html, nothing, unsafeCSS } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import stylesheet from "./dedupe-workflows.stylesheet.css";

import { BtrixElement } from "@/classes/BtrixElement";
import { OrgTab } from "@/routes";
import type { APIPaginatedList } from "@/types/api";
import type { Crawl, ListWorkflow } from "@/types/crawler";
import { SortDirection } from "@/types/utils";
import { finishedCrawlStates, renderName } from "@/utils/crawler";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

const INITIAL_PAGE_SIZE = 1000;

const styles = unsafeCSS(stylesheet);

@customElement("btrix-dedupe-workflows")
@localized()
export class DedupeWorkflows extends BtrixElement {
  static styles = styles;

  @property({ type: Array })
  workflows?: ListWorkflow[];

  @property({ type: Boolean })
  showHeader = false;

  @state()
  private workflowCrawlsMap = new Map<
    /* workflow ID: */ string,
    Promise<APIPaginatedList<Crawl> | undefined>
  >();

  private readonly workflowCrawlsTask = new Task(this, {
    task: async ([workflows], { signal }) => {
      if (!workflows) return;

      // Preload crawls
      workflows.forEach(({ id, dedupeCollId, crawlSuccessfulCount }) => {
        if (!this.workflowCrawlsMap.get(id)) {
          this.workflowCrawlsMap.set(
            id,
            crawlSuccessfulCount && dedupeCollId
              ? this.getCrawls(
                  {
                    workflowId: id,
                    dedupeCollId,
                  },
                  signal,
                )
              : Promise.resolve(undefined),
          );
        }
      });
    },
    args: () => [this.workflows] as const,
  });

  render() {
    return html`<btrix-overflow-scroll>
      ${this.showHeader
        ? html`<div
            class=${clsx(
              "component--row",
              tw`mx-px mb-2 pl-8 pr-1 text-xs leading-none text-neutral-600`,
            )}
          >
            <div>${msg("Workflow Name")}</div>
            <div>${msg("Crawl Runs")}</div>
            <div>${msg("Total Size")}</div>
            <div>
              <span class="sr-only">${msg("Actions")}</span>
            </div>
          </div>`
        : nothing}

      <div class="divide-y rounded border">
        ${repeat(this.workflows || [], ({ id }) => id, this.renderWorkflow)}
      </div>
    </btrix-overflow-scroll>`;
  }

  private readonly renderWorkflow = (workflow: ListWorkflow) => {
    const totalCrawls = workflow.crawlSuccessfulCount;
    // TOOD Virtualize scroll
    const content = () => html`
      <div class="max-h-96 overflow-y-auto border-t">
        <div class="min-h-4 pl-3 pt-3 text-xs leading-none text-neutral-500">
          ${until(
            this.workflowCrawlsMap
              .get(workflow.id)
              ?.then((crawls) =>
                crawls?.total
                  ? html`${this.localize.number(crawls.total)} ${msg("indexed")}
                    ${pluralOf("crawls", crawls.total)}`
                  : msg("No indexed crawls"),
              ),
          )}
        </div>

        ${until(
          this.workflowCrawlsMap
            .get(workflow.id)
            ?.then((crawls) => this.renderCrawls(workflow, crawls)),
          html`<div class="m-3 flex flex-col gap-1.5">
            ${Array.from({ length: totalCrawls }).map(
              () => html`
                <sl-skeleton
                  effect="sheen"
                  class="h-6 [--color:var(--sl-color-neutral-100)]"
                ></sl-skeleton>
              `,
            )}
          </div>`,
        )}
      </div>
    `;

    return html`
      <sl-details
        class=${clsx(
          !totalCrawls &&
            tw`part-[summary-icon]:invisible part-[header]:cursor-default part-[base]:opacity-100`,
        )}
        @sl-show=${() => {
          if (!this.workflowCrawlsMap.get(workflow.id)) {
            this.workflowCrawlsMap.set(
              workflow.id,
              workflow.dedupeCollId
                ? this.getCrawls({
                    workflowId: workflow.id,
                    dedupeCollId: workflow.dedupeCollId,
                  })
                : Promise.resolve(undefined),
            );
            this.workflowCrawlsMap = new Map(this.workflowCrawlsMap);
          }
        }}
        ?disabled=${!totalCrawls}
      >
        <div slot="summary" class=${clsx("component--row", tw`w-full`)}>
          <div class="flex items-center gap-1.5 truncate">
            <sl-tooltip content=${msg("Workflow Name")} hoist>
              <sl-icon
                name="file-code-fill"
                class="text-base text-neutral-600"
              ></sl-icon>
            </sl-tooltip>
            ${renderName(workflow)}
          </div>
          <div class="flex items-center gap-1.5 truncate">
            <sl-tooltip content=${msg("Successful Crawl Runs")} hoist>
              <sl-icon
                name="gear-wide-connected"
                class="text-base text-neutral-600"
              ></sl-icon>
              ${this.localize.number(totalCrawls)} ${msg("crawl")}
              ${pluralOf("runs", totalCrawls)}
            </sl-tooltip>
          </div>
          <div class="flex items-center gap-1.5 truncate">
            <sl-tooltip content=${msg("Total Size")} hoist>
              <sl-icon
                name="file-earmark-binary"
                class="text-base text-neutral-600"
              ></sl-icon>
              ${this.localize.bytes(
                workflow.totalSize ? +workflow.totalSize : 0,
              )}
            </sl-tooltip>
          </div>
          <div>
            <btrix-overflow-dropdown
              @click=${(e: MouseEvent) => e.stopPropagation()}
            >
              <sl-menu>
                ${when(
                  this.appState.isCrawler,
                  () => html`
                    <btrix-menu-item-link
                      href="${this.navigate
                        .orgBasePath}/${OrgTab.Workflows}/${workflow.id}?edit"
                    >
                      <sl-icon name="gear" slot="prefix"></sl-icon>
                      ${msg("Edit Workflow Settings")}
                    </btrix-menu-item-link>
                    <sl-divider></sl-divider>
                  `,
                )}
                <btrix-menu-item-link
                  href="${this.navigate
                    .orgBasePath}/${OrgTab.Workflows}/${workflow.id}"
                >
                  <sl-icon slot="prefix" name="arrow-return-right"></sl-icon>
                  ${msg("Go to Workflow")}
                </btrix-menu-item-link>
              </sl-menu>
            </btrix-overflow-dropdown>
          </div>
        </div>

        ${when(totalCrawls, content)}
      </sl-details>
    `;
  };

  private readonly renderCrawls = (
    workflow: ListWorkflow,
    crawls?: APIPaginatedList<Crawl>,
  ) => {
    return html`<div class=${clsx(crawls?.items.length ? tw`mt-1` : tw`mt-3`)}>
      ${when(
        crawls?.items,
        (items) =>
          html`<btrix-item-dependency-tree
            .items=${items}
            collectionId=${ifDefined(workflow.dedupeCollId || undefined)}
          ></btrix-item-dependency-tree>`,
      )}
    </div>`;
  };

  private async getCrawls(
    {
      workflowId,
      ...params
    }: {
      workflowId: string;
      dedupeCollId: string;
    },
    signal?: AbortSignal,
  ) {
    const query = queryString.stringify(
      {
        cid: workflowId,
        pageSize: INITIAL_PAGE_SIZE,
        sortBy: "started",
        sortDirection: SortDirection.Descending,
        state: finishedCrawlStates,
        ...params,
      },
      {
        arrayFormat: "comma",
      },
    );

    try {
      return await this.api.fetch<APIPaginatedList<Crawl>>(
        `/orgs/${this.orgId}/crawls?${query}`,
        { signal },
      );
    } catch (err) {
      console.debug(err);
    }
  }
}
