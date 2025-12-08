import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import { OrgTab } from "@/routes";
import type { APIPaginatedList } from "@/types/api";
import type { Crawl, ListWorkflow } from "@/types/crawler";
import { renderName } from "@/utils/crawler";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

const gridColsCss = tw`grid-cols-[repeat(2,minmax(12rem,1fr))_12rem_2rem]`;
const INITIAL_PAGE_SIZE = 1000;

@customElement("btrix-dedupe-workflows")
@localized()
export class DedupeWorkflows extends BtrixElement {
  @property({ type: Array })
  workflows?: ListWorkflow[];

  @state()
  private workflowCrawlsMap = new Map<
    /* workflow ID: */ string,
    Promise<APIPaginatedList<Crawl> | undefined>
  >();

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("workflows") && this.workflows) {
      // Preload crawls
      this.workflows.forEach(({ id, dedupeCollId }) => {
        if (!this.workflowCrawlsMap.get(id)) {
          this.workflowCrawlsMap.set(
            id,
            this.getCrawls({
              workflowId: id,
              dedupeCollId: dedupeCollId || undefined,
            }),
          );
        }
      });
    }
  }

  render() {
    return html`<btrix-overflow-scroll>
      <div
        class="${gridColsCss} mx-px mb-2 grid gap-3 pl-8 pr-1 text-xs leading-none text-neutral-600"
      >
        <div>${msg("Name")}</div>
        <div>${msg("Crawl Runs")}</div>
        <div>${msg("Total Size")}</div>
        <div>
          <span class="sr-only">${msg("Actions")}</span>
        </div>
      </div>
      <div class="divide-y overflow-hidden rounded border">
        ${repeat(this.workflows || [], ({ id }) => id, this.renderWorkflow)}
      </div>
    </btrix-overflow-scroll>`;
  }

  private readonly renderWorkflow = (workflow: ListWorkflow) => {
    const totalCrawls = workflow.crawlSuccessfulCount;
    // TOOD Virtualize scroll
    const content = () => html`
      <div
        class="max-h-96 overflow-y-auto border-t bg-neutral-50 py-3 pl-1 pr-3"
      >
        <div class="mb-3 ml-1.5 text-xs leading-none text-neutral-500">
          ${msg("Indexed Crawls")}
          ${until(
            this.workflowCrawlsMap
              .get(workflow.id)
              ?.then(
                (crawls) =>
                  html`<btrix-badge class="ml-1" outline>
                    ${this.localize.number(crawls?.total || 0)}
                  </btrix-badge>`,
              ),
          )}
        </div>

        ${until(
          this.workflowCrawlsMap.get(workflow.id)?.then(this.renderCrawls),
          html`<div class="ml-3 flex flex-col gap-1.5">
            ${Array.from({ length: totalCrawls }).map(
              () => html`
                <sl-skeleton
                  effect="sheen"
                  class="h-8 [--color:var(--sl-color-neutral-100)]"
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
          tw`part-[summary-icon]:order-first part-[summary-icon]:ml-1 part-[summary-icon]:mr-2.5`,
          tw`part-[base]:rounded-none part-[base]:border-0`,
          tw`part-[header]:p-1`,
          tw`part-[content]:p-0`,
          !totalCrawls &&
            tw`part-[summary-icon]:invisible part-[header]:cursor-default part-[base]:opacity-100`,
        )}
        @sl-show=${() => {
          if (!this.workflowCrawlsMap.get(workflow.id)) {
            this.workflowCrawlsMap.set(
              workflow.id,
              this.getCrawls({
                workflowId: workflow.id,
                dedupeCollId: workflow.dedupeCollId || undefined,
              }),
            );
            this.workflowCrawlsMap = new Map(this.workflowCrawlsMap);
          }
        }}
        ?disabled=${!totalCrawls}
      >
        <div
          slot="summary"
          class="${gridColsCss} grid w-full items-center gap-3"
        >
          <div class="truncate">${renderName(workflow)}</div>
          <div class="flex items-center gap-1.5 truncate">
            <sl-tooltip content=${msg("Successful Crawl Runs")} hoist>
              <sl-icon
                name="gear-wide-connected"
                class="text-base text-neutral-600"
              ></sl-icon>
            </sl-tooltip>
            ${this.localize.number(totalCrawls)}
            ${pluralOf("runs", totalCrawls)}
          </div>
          <div class="flex items-center gap-1.5 truncate">
            <sl-tooltip content=${msg("Total Size")} hoist>
              <sl-icon
                name="file-earmark-binary"
                class="text-base text-neutral-600"
              ></sl-icon>
            </sl-tooltip>
            ${this.localize.bytes(workflow.totalSize ? +workflow.totalSize : 0)}
          </div>
          <div>
            ${this.renderLink(
              `${this.navigate.orgBasePath}/${OrgTab.Workflows}/${workflow.id}`,
            )}
          </div>
        </div>

        ${when(totalCrawls, content)}
      </sl-details>
    `;
  };

  private readonly renderCrawls = (crawls?: APIPaginatedList<Crawl>) => {
    if (crawls?.items.length) {
      return html`<btrix-item-dependency-tree
        .items=${crawls.items}
      ></btrix-item-dependency-tree>`;
    }

    return html`<p class="mx-1.5 text-xs text-neutral-600">
      ${msg("No crawls found.")}
    </p>`;
  };

  private renderLink(href: string) {
    return html`<sl-tooltip
      placement="right"
      content=${msg("Open in New Tab")}
      hoist
    >
      <sl-icon-button
        name="arrow-up-right"
        href=${href}
        target="_blank"
        @click=${(e: MouseEvent) => {
          e.stopPropagation();
        }}
      >
      </sl-icon-button>
    </sl-tooltip>`;
  }

  private async getCrawls({
    workflowId,
    ...params
  }: {
    workflowId?: string;
    dedupeCollId?: string;
  }) {
    const query = queryString.stringify({
      cid: workflowId,
      pageSize: INITIAL_PAGE_SIZE,
      ...params,
    });

    try {
      return await this.api.fetch<APIPaginatedList<Crawl>>(
        `/orgs/${this.orgId}/crawls?${query}`,
      );
    } catch (err) {
      console.debug(err);
    }
  }
}
