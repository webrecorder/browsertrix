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
import { infoPopover } from "@/layouts/info-popover";
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
        class="grid grid-cols-5 grid-rows-[min-content_1fr] gap-x-3 gap-y-3 xl:gap-x-7"
      >
        <section class="col-span-full row-span-1 xl:col-span-4">
          ${this.renderStats()}
        </section>
        <section class="col-span-full row-span-2 xl:col-span-1">
          ${this.renderOverview()}
        </section>
        <section class="col-span-full row-span-1 xl:col-span-4">
          ${panelHeader({ heading: msg("Indexed Items") })}
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
        class="grid grid-cols-[1fr_min-content] grid-rows-[min-content_1fr] items-center gap-x-4 gap-y-0.5"
      >
        <dt class="min-h-6 text-base font-medium">
          ${when(
            this.collection,
            getValue,
            () => html`<sl-skeleton class="mt-1"></sl-skeleton>`,
          )}
        </dt>
        <dd class="col-start-1 text-xs text-neutral-700">${label}</dd>
        ${icon
          ? html`<div
              class="col-start-2 row-span-2 row-start-1 flex size-10 items-center justify-center rounded-lg bg-neutral-50"
            >
              <sl-icon name=${icon} class="size-5 text-neutral-400"></sl-icon>
            </div>`
          : nothing}
      </div>
    `;
    const value = (
      v: number,
      unit: "bytes" | "number" = "number",
      size: "medium" | "large" = "medium",
      successThreshold?: number,
    ) =>
      html`<span
        class=${clsx(
          successThreshold && v >= successThreshold && tw`text-success-600`,
          size === "large" && tw`text-lg leading-none`,
        )}
      >
        ${unit === "bytes" ? this.localize.bytes(v) : this.localize.number(v)}
      </span>`;

    return html`<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <btrix-card>
        <header slot="title" class="flex items-center justify-between">
          <h2>${msg("Storage Impact")}</h2>
          ${infoPopover({
            content: html`
              <strong class="font-semibold">${msg("Estimated Savings")}</strong
              >:
              ${msg(
                "An estimate of how much storage space has been conserved by deduplicating this collection.",
              )}<br /><br />
              <strong class="font-semibold">${msg("Indexed")}</strong>:
              ${msg(
                "The total storage space used by indexed items, including indexed and then deleted archived items.",
              )}<br /><br />
              <strong class="font-semibold">${msg("Crawled")}</strong>:
              ${msg(
                "The total size of all archived items, including duplicates.",
              )}
            `,
            placement: "right-start",
          })}
        </header>
        <dl class="grid flex-1 grid-cols-1 gap-x-5 gap-y-3 lg:grid-cols-2">
          <div
            class="flex flex-col gap-3 lg:col-span-2 lg:flex-row lg:items-center lg:border-b lg:pb-[calc(.75rem-1px)]"
          >
            ${stat({
              label: msg("Estimated Savings"),
              getValue: (col) =>
                col.indexStats
                  ? value(
                      col.indexStats.conservedSize,
                      "bytes",
                      "large",
                      BYTES_PER_MB,
                    )
                  : notApplicable,
            })}
            ${when(this.collection?.indexStats, (stats) =>
              stats.totalCrawlSize ||
              stats.conservedSize ||
              stats.removedCrawlSize
                ? html`<div class="flex-1">${this.renderStorageBar()}</div>`
                : nothing,
            )}
          </div>
          ${stat({
            label: msg("Indexed Items"),
            icon: "file-earmark-zip",
            getValue: (col) =>
              col.indexStats
                ? value(col.indexStats.totalCrawlSize, "bytes")
                : notApplicable,
          })}
          ${stat({
            label: msg("Deleted Items in Index"),
            icon: "file-earmark-minus",
            getValue: (col) =>
              col.indexStats
                ? value(col.indexStats.removedCrawlSize, "bytes")
                : notApplicable,
          })}
        </dl>
      </btrix-card>
      <btrix-card>
        <header slot="title">
          <h2>${msg("Index Overview")}</h2>
        </header>
        <dl class="col-span-1 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-y-6">
          ${stat({
            label: msg("Unique Documents"),
            icon: "circle-square",
            getValue: (col) =>
              col.indexStats
                ? value(col.indexStats.totalUrls - col.indexStats.dupeUrls)
                : notApplicable,
          })}
          ${stat({
            label: msg("Duplicate Documents"),
            icon: "intersect",
            getValue: (col) =>
              col.indexStats ? value(col.indexStats.dupeUrls) : notApplicable,
          })}
          ${stat({
            label: msg("Indexed Items"),
            icon: "file-earmark-zip",
            getValue: (col) =>
              col.indexStats
                ? value(col.indexStats.totalCrawls)
                : notApplicable,
          })}
          ${stat({
            label: msg("Deleted Items in Index"),
            icon: "file-earmark-minus",
            getValue: (col) =>
              col.indexStats
                ? value(col.indexStats.removedCrawls)
                : notApplicable,
          })}
        </dl>
      </btrix-card>
    </div>`;
  }

  private renderStorageBar() {
    const stats = this.collection?.indexStats;

    if (!stats) return;

    const { totalCrawlSize, conservedSize, removedCrawlSize } = stats;
    const notRemoved = totalCrawlSize - removedCrawlSize;
    const max = totalCrawlSize + conservedSize;

    return html`<btrix-meter value=${totalCrawlSize} max=${max} class="w-full">
      <btrix-meter-bar
        value=${(notRemoved / totalCrawlSize) * 100}
        class="[--background-color:theme(colors.primary.300)]"
      >
        <div class="flex justify-between gap-4 font-medium leading-none">
          <span>${msg("Kept Items in Index")}</span>
          <span>${this.localize.bytes(notRemoved)}</span>
        </div>
      </btrix-meter-bar>
      <btrix-meter-bar
        value=${(removedCrawlSize / totalCrawlSize) * 100}
        class="[--background-color:theme(colors.primary.200)]"
      >
        <div class="flex justify-between gap-4 font-medium leading-none">
          <span>${msg("Deleted Items in Index")}</span>
          <span>${this.localize.bytes(removedCrawlSize)}</span>
        </div>
      </btrix-meter-bar>
      <div slot="available" class="flex-1">
        <btrix-floating-popover placement="top" class="text-center">
          <div slot="content">
            <header class="flex justify-between gap-4 font-medium leading-none">
              <span>${msg("Estimated Savings")}</span>
              <span>${this.localize.bytes(stats.conservedSize)}</span>
            </header>
          </div>
          <div class="h-full w-full"></div>
        </btrix-floating-popover>
      </div>
      <span slot="valueLabel">${msg("Indexed")}</span>
      <span slot="maxLabel">${msg("Crawled")}</span>
    </btrix-meter>`;
  }

  private renderCrawls() {
    return html`
      <div
        class="mb-3 flex items-center justify-between gap-3 rounded-lg border bg-neutral-50 p-3"
      >
        <div class="flex items-center gap-2">
          <label for="view" class="whitespace-nowrap text-neutral-500"
            >${msg("View by:")}</label
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
              <sl-icon slot="prefix" name="file-code-fill"></sl-icon>
              ${msg("Workflow")}
            </sl-radio-button>
            <sl-radio-button pill value=${CrawlsView.Crawls}>
              <sl-icon slot="prefix" name="gear-wide-connected"></sl-icon>
              ${msg("Crawl Run")}
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
      heading: msg("Overview"),
      body: html`<btrix-desc-list>
        <btrix-desc-list-item label=${msg("Index Status")}>
          ${state ? indexStatus(state) : stringFor.unknown}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Index Last Saved")}>
          ${when(this.collection, (col) =>
            col.indexLastSavedAt
              ? this.localize.relativeDate(col.indexLastSavedAt)
              : noData,
          )}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Total Indexed URLs")}>
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
