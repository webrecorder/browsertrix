import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlChangeEvent, SlRadioGroup } from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { SearchParamsValue } from "@/controllers/searchParamsValue";
import { emptyMessage } from "@/layouts/emptyMessage";
import { panel, panelBody, panelHeader } from "@/layouts/panel";
import { OrgTab } from "@/routes";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { Collection, DedupeStats } from "@/types/collection";
import type { Crawl, Workflow } from "@/types/crawler";
import { SortDirection } from "@/types/utils";
import { pluralOf } from "@/utils/pluralize";

const INITIAL_PAGE_SIZE = 10;

enum CrawlsView {
  Workflows = "workflows",
  Crawls = "crawls",
}

const DEFAULT_CRAWLS_VIEW = CrawlsView.Workflows;

type View = {
  crawlsView?: CrawlsView;
};

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
      if (value.crawlsView) {
        params.set("crawlsView", value.crawlsView);
      } else {
        params.delete("crawlsView");
      }
      return params;
    },
    (params) => {
      const crawlsView = params.get("crawlsView");
      return {
        crawlsView: crawlsView
          ? (crawlsView as CrawlsView)
          : DEFAULT_CRAWLS_VIEW,
      };
    },
  );

  private readonly dedupeStatsTask = new Task(this, {
    task: async ([collectionId]) => {
      if (!collectionId) return;

      // TODO Actual data
      return await new Promise<DedupeStats>((resolve) => {
        setTimeout(() => {
          resolve({
            uniqueUrls: 24,
            totalUrls: 49,
            uniqueSize: 1234,
            totalSize: 2345,
            removable: 2,
            state: "waiting_dedupe_index",
          });
        }, 1000);
      });

      // return await this.api.fetch<DedupeStats>(
      //   `/orgs/${this.orgId}/collections/${this.collectionId}/dedupe`,
      //   { signal },
      // );
    },
    args: () => [this.collectionId] as const,
  });

  private readonly dedupeWorkflowsTask = new Task(this, {
    task: async ([collectionId], { signal }) => {
      if (!collectionId) return;

      const query = queryString.stringify({
        dedupeCollId: collectionId,
        sortBy: "name",
      });

      return await this.api.fetch<APIPaginatedList<Workflow>>(
        `/orgs/${this.orgId}/crawlconfigs?${query}`,
        { signal },
      );
    },
    args: () => [this.collectionId] as const,
  });

  private readonly dedupeCrawlsTask = new Task(this, {
    task: async ([collectionId, pagination], { signal }) => {
      if (!collectionId) return;

      const query = queryString.stringify({
        ...pagination,
        dedupeCollId: collectionId,
        sortBy: "finished",
        sortDirection: SortDirection.Descending,
      });

      return await this.api.fetch<APIPaginatedList<Crawl>>(
        `/orgs/${this.orgId}/crawls?${query}`,
        { signal },
      );
    },
    args: () => [this.collectionId, this.pagination] as const,
  });

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("view.internalValue")) {
      this.pagination = {
        ...this.pagination,
        page: 1,
      };
    }
  }

  render() {
    if (!this.collection) return;

    if (this.collection.hasDedupeIndex) {
      return html` <div
        class="grid grid-cols-4 grid-rows-[repeat(2,min-content)] gap-x-3 gap-y-3"
      >
        <section class="col-span-full row-span-1 xl:col-span-3">
          ${this.renderStats()}
        </section>
        <section
          class="col-span-full row-span-2 xl:col-span-1 xl:border-l xl:pl-5"
        >
          ${this.renderOverview()}
        </section>
        <section class="col-span-full row-span-1 xl:col-span-3">
          ${panelHeader({ heading: msg("Indexed Crawls") })}
          ${this.renderCrawls()}
        </section>
      </div>`;
    }

    return panelBody({
      content: emptyMessage({
        message: msg("Deduplication is not enabled"),
        detail: msg(
          "Deduplication can help recover storage space and reduce crawl time.",
        ),
        actions: html`
          <sl-button
            size="small"
            href="${this.navigate.orgBasePath}/${OrgTab.Workflows}"
            @click=${this.navigate.link}
          >
            <sl-icon slot="prefix" name="file-code-fill"></sl-icon>
            ${msg("Enable in Workflows")}
          </sl-button>
        `,
      }),
    });
  }

  private renderStats() {
    const dedupe = this.dedupeStatsTask.value;

    const ringStat = (
      ring: Parameters<CollectionDetailDedupe["renderRing"]>[0],
      { format, icon }: { format: (v: number) => string; icon: string },
    ) => html`
      <div class="flex items-center gap-3">
        <sl-icon
          name=${icon}
          class="size-9 shrink-0 text-neutral-300"
        ></sl-icon>
        <div class="flex-1">
          <div class="text-base font-medium">
            ${format(ring.total - ring.unique)}
          </div>
          <div class="text-xs text-neutral-700">
            ${msg("out of")} ${format(ring.total)}
          </div>
        </div>
        <div>${this.renderRing(ring)}</div>
      </div>
    `;
    const ringSkeleton = () => html`
      <div class="flex items-center gap-3">
        <sl-skeleton class="size-9"></sl-skeleton>
        <div class="flex-1">
          <sl-skeleton class="mb-1 h-3 w-12"></sl-skeleton>
          <sl-skeleton class="h-3 w-12"></sl-skeleton>
        </div>
        <sl-skeleton
          class="size-16 part-[indicator]:rounded-full"
        ></sl-skeleton>
      </div>
    `;

    const ringStatWithDedupe = (render: (dedupe: DedupeStats) => unknown) =>
      when(dedupe, render, ringSkeleton);

    return html`
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <btrix-card class="col-span-full md:col-span-1">
          <span slot="title">${msg("Deduplicated URLs")}</span>
          ${ringStatWithDedupe((dedupe) =>
            ringStat(
              {
                unique: dedupe.uniqueUrls,
                total: dedupe.totalUrls,
                label: msg("URLs"),
              },
              {
                icon: "link-45deg",
                format: (v) =>
                  `${this.localize.number(v)} ${pluralOf("URLs", v)}`,
              },
            ),
          )}
        </btrix-card>
        <btrix-card class="col-span-full md:col-span-1">
          <span slot="title">${msg("Deduplicated Size")}</span>
          ${ringStatWithDedupe((dedupe) =>
            ringStat(
              {
                unique: dedupe.uniqueSize,
                total: dedupe.totalSize,
                label: msg("Size"),
              },
              {
                icon: "file-earmark-binary",
                format: (v) => this.localize.bytes(v),
              },
            ),
          )}
        </btrix-card>
      </div>
    `;
  }

  private renderRing({
    unique,
    total,
    label,
  }: {
    unique: number;
    total: number;
    label: string;
  }) {
    const value = ((total - unique) / total) * 100;
    return html`
      <sl-progress-ring
        class="block size-16 [--indicator-color:theme(colors.blue.200)] [--indicator-width:.5rem] [--size:4rem] [--track-color:theme(colors.blue.50)] [--track-width:.5rem]"
        label="${msg("Deduplicated")} ${label}"
        value=${value}
      >
        <span class="font-monostyle text-neutral-700"
          >${this.localize.number(value, { maximumFractionDigits: 0 })}%</span
        >
      </sl-progress-ring>
    `;
  }

  private renderCrawls() {
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
            value=${this.view.value.crawlsView || DEFAULT_CRAWLS_VIEW}
            @sl-change=${(e: SlChangeEvent) => {
              this.view.setValue({
                crawlsView: (e.target as SlRadioGroup).value as CrawlsView,
              });
            }}
          >
            <sl-radio-button pill value=${DEFAULT_CRAWLS_VIEW}>
              ${msg("By Workflow")}
            </sl-radio-button>
            <sl-radio-button pill value=${CrawlsView.Crawls}>
              ${msg("All Crawls")}
            </sl-radio-button>
          </sl-radio-group>
        </div>
      </div>

      <div class="mx-2">
        ${choose(this.view.value.crawlsView, [
          [CrawlsView.Workflows, this.renderWorkflowList],
          [CrawlsView.Crawls, this.renderCrawlList],
        ])}
      </div>
    `;
  }

  private readonly renderCrawlList = () => {
    const loading = () => html`
      <sl-skeleton effect="sheen" class="h-9"></sl-skeleton>
    `;
    const crawls = (crawls?: APIPaginatedList<Crawl>) =>
      crawls?.items.length
        ? html`
            <btrix-item-dependency-tree
              .items=${crawls.items}
              collectionId=${this.collectionId}
              showHeader
            ></btrix-item-dependency-tree>

            <footer class="mt-6 flex justify-center">
              <btrix-pagination
                page=${crawls.page}
                totalCount=${crawls.total}
                size=${crawls.pageSize}
                @page-change=${async (e: PageChangeEvent) => {
                  this.pagination = {
                    ...this.pagination,
                    page: e.detail.page,
                  };

                  await this.dedupeCrawlsTask.taskComplete;

                  // Scroll to top of list
                  // TODO once deep-linking is implemented, scroll to top of pushstate
                  this.scrollIntoView({ behavior: "smooth" });
                }}
              ></btrix-pagination>
            </footer>
          `
        : panelBody({
            content: emptyMessage({
              message: msg("No crawls found."),
            }),
          });

    return html`${this.dedupeCrawlsTask.render({
      initial: loading,
      pending: () =>
        this.dedupeCrawlsTask.value
          ? crawls(this.dedupeCrawlsTask.value)
          : loading(),
      complete: crawls,
    })}`;
  };

  private readonly renderWorkflowList = () => {
    const loading = () =>
      html`<sl-skeleton effect="sheen" class="h-10"></sl-skeleton>`;
    return html`${this.dedupeWorkflowsTask.render({
      initial: loading,
      pending: loading,
      complete: (workflows) =>
        workflows?.items.length
          ? html`
              <btrix-dedupe-workflows
                .workflows=${workflows.items}
              ></btrix-dedupe-workflows>
            `
          : panelBody({
              content: emptyMessage({
                message: msg("No crawls added."),
              }),
            }),
    })}`;
  };

  private renderOverview() {
    const dedupe = this.dedupeStatsTask.value;

    return panel({
      heading: msg("Overview"),
      body: html`<btrix-desc-list>
        <btrix-desc-list-item label=${msg("Dedupe Status")}>
          ${when(dedupe, (dedupe) => html` ${dedupe.state} `)}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Purgeable Items")}>
          ${when(
            dedupe,
            (dedupe) =>
              html`${this.localize.number(dedupe.removable)}
              ${pluralOf("items", dedupe.removable)} `,
          )}
        </btrix-desc-list-item>
      </btrix-desc-list>`,
    });
  }
}
