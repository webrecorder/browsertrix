import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlChangeEvent, SlRadioGroup } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { SearchParamsValue } from "@/controllers/searchParamsValue";
import { indexStatus } from "@/features/collections/templates/index-status";
import { emptyMessage } from "@/layouts/emptyMessage";
import { panel, panelBody, panelHeader } from "@/layouts/panel";
import { OrgTab } from "@/routes";
import { noData, notApplicable, stringFor } from "@/strings/ui";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { Collection } from "@/types/collection";
import type { Crawl, Workflow } from "@/types/crawler";
import { SortDirection } from "@/types/utils";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

const BYTES_PER_MB = 1e6;
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

    if (this.collection.indexStats) {
      return html` <div
        class="grid grid-cols-4 grid-rows-[min-content_1fr] gap-x-3 gap-y-3 xl:gap-x-7"
      >
        <section class="col-span-full row-span-1 xl:col-span-3">
          ${this.renderStats()}
        </section>
        <section class="col-span-full row-span-2 xl:col-span-1">
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
    const stat = ({
      label,
      icon,
      getValue,
    }: {
      label: string;
      icon?: string;
      getValue: (col: Collection) => string | TemplateResult;
    }) => html`
      <div
        class="col-span-full grid grid-cols-[1fr_min-content] grid-rows-[min-content_1fr] items-center gap-x-4 gap-y-0.5 rounded border px-4 py-3 md:col-span-1"
      >
        <dt class="min-h-6 text-base font-medium">
          ${when(
            this.collection,
            getValue,
            () => html`<sl-skeleton class="mt-1"></sl-skeleton>`,
          )}
        </dt>
        <dd class="col-start-1 text-xs text-neutral-500">${label}</dd>
        ${icon
          ? html`<sl-icon
              name=${icon}
              class="col-start-2 row-span-2 row-start-1 text-xl text-neutral-300"
            ></sl-icon>`
          : nothing}
      </div>
    `;
    const value = (
      v: number,
      unit: "bytes" | "number" = "number",
      successThreshold?: number,
    ) =>
      html`<span
        class=${clsx(
          successThreshold && v >= successThreshold
            ? tw`text-success-600`
            : tw`text-neutral-700`,
        )}
      >
        ${unit === "bytes" ? this.localize.bytes(v) : this.localize.number(v)}
      </span>`;

    return html`<h2 class="sr-only">${msg("Statistics")}</h2>
      <dl class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        ${stat({
          label: msg("Unique Documents"),
          icon: "circle-square",
          getValue: (col) =>
            col.indexStats ? value(col.indexStats.uniqueUrls) : notApplicable,
        })}
        ${stat({
          label: msg("Duplicate Documents"),
          icon: "intersect",
          getValue: (col) =>
            col.indexStats
              ? value(col.indexStats.totalUrls - col.indexStats.uniqueUrls)
              : notApplicable,
        })}
        ${stat({
          label: msg("Hidden Crawls"),
          icon: "eye-slash",
          getValue: (col) =>
            col.indexStats
              ? value(col.indexStats.removableCrawls)
              : notApplicable,
        })}
        ${stat({
          label: msg("Estimated Storage Savings"),
          getValue: (col) =>
            col.indexStats
              ? value(col.indexStats.sizeSaved, "bytes", BYTES_PER_MB)
              : notApplicable,
        })}
      </dl>`;
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
    const state = this.collection?.indexState;
    const stats = this.collection?.indexStats;

    return panel({
      heading: msg("Index Overview"),
      body: html`<btrix-desc-list>
        <btrix-desc-list-item label=${msg("Status")}>
          ${state ? indexStatus(state) : stringFor.unknown}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Last Saved")}>
          ${when(this.collection, (col) =>
            col.indexLastSavedAt
              ? this.localize.relativeDate(col.indexLastSavedAt)
              : noData,
          )}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Indexed Crawls")}>
          ${when(
            stats,
            (dedupe) =>
              html`${this.localize.number(dedupe.totalCrawls)}
              ${pluralOf("crawls", dedupe.totalCrawls)} `,
          )}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Size of Indexed Crawls")}>
          ${when(stats, (dedupe) => this.localize.bytes(dedupe.totalSize))}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Indexed URLs")}>
          ${when(
            stats,
            (dedupe) =>
              html`${this.localize.number(dedupe.totalUrls)}
              ${pluralOf("URLs", dedupe.totalUrls)} `,
          )}
        </btrix-desc-list-item>
      </btrix-desc-list>`,
    });
  }
}
