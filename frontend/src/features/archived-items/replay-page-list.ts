import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { deepArrayEquals } from "@lit/task/deep-equals.js";
import clsx from "clsx";
import { html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { cache } from "lit/directives/cache.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import {
  pageListFilterControl,
  type FilterPageListBy,
} from "./templates/page-list-filter-control";
import {
  DEFAULT_REPLAY_VIEW,
  ReplayView,
} from "./templates/page-list-view-control";

import { BtrixElement } from "@/classes/BtrixElement";
import type { OverflowDropdown } from "@/components/ui/overflow-dropdown";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import type { Popover } from "@/components/ui/popover";
import { ClipboardController } from "@/controllers/clipboard";
import { SearchParamsValue } from "@/controllers/searchParamsValue";
import { type BtrixSelectEvent } from "@/events/btrix-select";
import { pageHttpStatusBadge } from "@/features/archived-items/templates/page-http-status-badge";
import {
  DEFAULT_SORT_BY,
  pageListSortControl,
  sortableFields,
  type SortField,
} from "@/features/archived-items/templates/page-list-sort-control";
import { stringFor } from "@/strings/ui";
import {
  type APIPaginatedList,
  type APIPaginationQuery,
  type APISortQuery,
} from "@/types/api";
import { type ArchivedItemPage } from "@/types/crawler";
import { objectSearchParams } from "@/utils/searchParams/object";
import { sortBySearchParams, type SortBy } from "@/utils/searchParams/sortBy";
import { tw } from "@/utils/tailwind";

export type ReplayPageListSelectEvent = BtrixSelectEvent<ArchivedItemPage>;

export type ReplayPage = {
  url?: string;
  ts?: string;
};

const PAGE_LIST_PAGE_SIZE = 10;

@customElement("btrix-archived-item-replay-page-list")
@localized()
export class ArchivedItemReplayPageList extends BtrixElement {
  @property({ type: String, useDefault: true })
  view = DEFAULT_REPLAY_VIEW;

  @property({ type: String, useDefault: true })
  itemId?: string;

  @property({ type: String, useDefault: true })
  reviewUrl?: string;

  private readonly orderBy = new SearchParamsValue<SortBy<SortField>>(
    this,
    ...sortBySearchParams<SortField>({
      sortFieldKey: "replayPageSortBy",
      sortDirKey: "replayPageSortDir",
      defaultSort: DEFAULT_SORT_BY,
      sortableFields,
    }),
  );

  private readonly replayPage = new SearchParamsValue<ReplayPage>(
    this,
    ...objectSearchParams<ReplayPage>({ keys: ["url", "ts"] }),
  );

  private readonly filterBy = new SearchParamsValue<FilterPageListBy>(
    this,
    ...objectSearchParams<FilterPageListBy>({
      keys: ["urlPrefix", "urlRegex"],
    }),
  );

  private readonly pagesTask = new Task(this, {
    task: async ([itemId, orderBy, page], { signal }) => {
      if (!itemId) throw "itemId required";

      const queryData: APISortQuery<ArchivedItemPage> & APIPaginationQuery = {
        sortBy: orderBy.field,
        sortDirection: orderBy.direction,
        page,
        pageSize: PAGE_LIST_PAGE_SIZE,
      };

      const query = queryString.stringify(queryData);

      const pages = await this.api.fetch<APIPaginatedList<ArchivedItemPage>>(
        `/orgs/${this.orgId}/all-crawls/${this.itemId}/pages?${query}`,
        { signal },
      );

      if (pages.items.length && !this.replayPage.value.url) {
        const firstPage = pages.items[0];
        this.replayPage.setValue(firstPage);
      }

      return pages;
    },
    args: () =>
      [
        this.itemId,
        this.orderBy.value,
        parsePage(new URLSearchParams(location.search).get("replayPage")),
      ] as const,
    argsEqual: deepArrayEquals,
  });

  render() {
    const sidebarView = this.view === ReplayView.Sidebar;

    return html`${when(this.pagesTask.value, ({ total }) =>
      total === 1 ? nothing : this.renderPageListControls(),
    )}
    ${cache(
      sidebarView ? this.renderPageListSidebar() : this.renderPageListTable(),
    )}`;
  }

  private renderPageListControls() {
    const sidebarView = this.view === ReplayView.Sidebar;

    return html` <div
      class=${clsx(
        tw`flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-neutral-50 p-2 text-neutral-500`,
        sidebarView ? tw`mb-2 shadow-md @3xl/content:shadow-none` : tw`mb-3`,
      )}
    >
      ${pageListFilterControl(this.filterBy)}
      ${pageListSortControl(this.orderBy)}
    </div>`;
  }

  private renderSinglePageInfo(page: ArchivedItemPage) {
    return html`<div class="flex gap-3 p-1">
      <div class="p-2 flex-1">${this.renderPageDetails(page)}</div>
      ${this.renderPageListActions(page)}
    </div>`;
  }

  private renderPageListSidebar() {
    const loading = () =>
      html`<div class="size-full flex items-center justify-center p-5">
        <sl-spinner class="text-xl"></sl-spinner>
      </div>`;
    const pageList = ({ items, total }: APIPaginatedList<ArchivedItemPage>) => {
      if (total === 1) {
        return this.renderSinglePageInfo(items[0]);
      }

      return html`<ul class="divide-y flex-1">
        ${repeat(items, ({ id }) => id, this.renderPageListSidebarRow)}
      </ul>`;
    };

    const pages = this.pagesTask.value;

    return html`<div
      class="flex flex-1 flex-col border rounded-lg overflow-hidden bg-white shadow-md @3xl/content:shadow-none"
    >
      <div class="overflow-auto flex-1">
        ${this.pagesTask.render({
          initial: loading,
          pending: () => (pages ? pageList(pages) : loading()),
          complete: pageList,
        })}
      </div>
      ${when(
        pages?.total &&
          (pages.page > 1 || pages.total > pages.pageSize) &&
          pages,
        ({ page, total, pageSize }) =>
          html`<footer class="p-3 flex justify-center">
            <btrix-pagination
              name="replayPage"
              page=${page}
              totalCount=${total}
              size=${pageSize}
              compact
              @page-change=${(e: PageChangeEvent) => {
                void this.pagesTask.run([
                  this.itemId,
                  this.orderBy.value,
                  e.detail.page,
                ]);
              }}
            >
            </btrix-pagination>
          </footer>`,
      )}
    </div>`;
  }

  private readonly renderPageDetails = (page: ArchivedItemPage) => {
    const none = html`<span class="opacity-50">${stringFor.none}</span>`;

    return html`<btrix-desc-list>
      <btrix-desc-list-item label=${msg("Page Title")}>
        ${page.title
          ? html`
              <div class="font-sans leading-relaxed text-neutral-600">
                ${page.title}
              </div>
            `
          : none}
      </btrix-desc-list-item>
      <btrix-desc-list-item label=${msg("Page URL")}>
        ${page.url
          ? html`<btrix-code
              class="part-[base]:break-all"
              language="url"
              value=${page.url}
            ></btrix-code>`
          : none}
      </btrix-desc-list-item>
      <btrix-desc-list-item label=${msg("HTTP Status")}>
        ${pageHttpStatusBadge(page.status)}
      </btrix-desc-list-item>
      <btrix-desc-list-item label=${msg("Snapshot Date")}>
        ${page.ts
          ? this.localize.date(page.ts, {
              dateStyle: "short",
              timeStyle: "long",
            })
          : stringFor.unknown}
      </btrix-desc-list-item>
    </btrix-desc-list>`;
  };

  private readonly renderPageListSidebarRow = (page: ArchivedItemPage) => {
    return html`<btrix-popover
      class="part-[body]:w-64"
      placement=${this.pagesTask.value?.total === 1 ? "bottom" : "right-start"}
      trigger="hover"
      hoist
    >
      <div slot="content">${this.renderPageDetails(page)}</div>
      <li
        class=${tw`flex items-center overflow-hidden transition-all has-[button:hover]:bg-cyan-50/50 aria-selected:[&:not(:only-child)]:bg-cyan-50`}
        aria-selected="${this.replayPage.value.url === page.url}"
      >
        <button
          class="flex-1 block overflow-hidden text-left py-1.5 pl-3 pr-1.5"
          @click=${() =>
            this.dispatchEvent(
              new CustomEvent<ReplayPageListSelectEvent["detail"]>(
                "btrix-select",
                {
                  detail: { item: page },
                },
              ),
            )}
        >
          <div class="truncate leading-5 pointer-events-none">
            ${page.title
              ? html`<strong class="font-medium">${page.title}</strong>`
              : html`<span class="opacity-50">${msg("No page title")}</span>`}
          </div>
          <btrix-code
            class="block flex-1 overflow-hidden text-xs pointer-events-none"
            language="url"
            value=${page.url}
            noWrap
            truncate
          ></btrix-code>
        </button>
        ${this.renderPageListActions(page)}
      </li>
    </btrix-popover>`;
  };

  private renderPageListTable() {
    const pages = this.pagesTask.value;

    if (pages?.total === 1) {
      return html`<div class="border rounded-lg">
        ${this.renderSinglePageInfo(pages.items[0])}
      </div>`;
    }

    const row = (page: ArchivedItemPage) =>
      html`<btrix-table-row
        class=${tw`border-x border-t bg-white transition-colors duration-fast first:rounded-t last:rounded-b last:border-b hover:bg-cyan-50/50 aria-selected:[&:not(:only-child)]:bg-cyan-50`}
        aria-selected="${this.replayPage.value.url === page.url}"
      >
        <btrix-table-cell rowClickTarget="button">
          <button
            class="text-left overflow-hidden"
            @click=${() => {
              this.dispatchEvent(
                new CustomEvent<ReplayPageListSelectEvent["detail"]>(
                  "btrix-select",
                  {
                    detail: { item: page },
                  },
                ),
              );
              this.shadowRoot
                ?.querySelector(".replay-panel")
                ?.scrollIntoView({ block: "start", behavior: "smooth" });
            }}
          >
            ${page.title
              ? html`<div class="truncate font-medium">${page.title}</div>`
              : html`<div class="opacity-50">${msg("No page title")}</div>`}
          </button>
        </btrix-table-cell>
        <btrix-table-cell class="overflow-hidden items-center gap-2">
          <btrix-code
            class="block flex-1 overflow-hidden"
            language="url"
            value=${page.url}
            noWrap
            truncate
          ></btrix-code>
          ${pageHttpStatusBadge(page.status)}
        </btrix-table-cell>
        <btrix-table-cell class="whitespace-nowrap"
          >${page.ts
            ? this.localize.date(page.ts, {
                month: "2-digit",
                day: "2-digit",
                year: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            : html`<span class="opacity-50"
                >${stringFor.unknown}</span
              >`}</btrix-table-cell
        >
        <btrix-table-cell class="px-0">
          ${this.renderPageListActions(page)}
        </btrix-table-cell>
      </btrix-table-row>`;

    return html`<btrix-overflow-scroll>
        <btrix-table
          class="[--btrix-table-cell-padding-x:--sl-spacing-x-small]"
          style="--btrix-table-grid-template-columns: ${[
            "[clickable-start] 40ch",
            "minmax(30ch, 1fr)",
            "11rem [clickable-end]",
            "min-content",
          ].join(" ")}"
        >
          <btrix-table-head
            class="[--btrix-table-cell-padding-bottom:var(--sl-spacing-2x-small)]"
          >
            <btrix-table-header-cell>
              ${msg("Page Title")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Page URL")}
            </btrix-table-header-cell>
            <btrix-table-header-cell
              >${msg("Snapshot Time")}</btrix-table-header-cell
            >
            <btrix-table-header-cell>
              <span class="sr-only">${msg("Actions")}</span>
            </btrix-table-header-cell>
          </btrix-table-head>
          <btrix-table-body>
            ${repeat(pages?.items || [], ({ id }) => id, row)}
          </btrix-table-body>
        </btrix-table>
      </btrix-overflow-scroll>

      ${when(
        pages?.total &&
          (pages.page > 1 || pages.total > pages.pageSize) &&
          pages,
        ({ page, total, pageSize }) =>
          html`<footer class="p-3 flex justify-center">
            <btrix-pagination
              name="replayPage"
              page=${page}
              totalCount=${total}
              size=${pageSize}
              compact
              @page-change=${(e: PageChangeEvent) => {
                void this.pagesTask.run([
                  this.itemId,
                  this.orderBy.value,
                  e.detail.page,
                ]);
              }}
            >
            </btrix-pagination>
          </footer>`,
      )} `;
  }

  private readonly renderPageListActions = (page: ArchivedItemPage) => {
    const closePopover = (e: Event) => {
      const el = e.target as OverflowDropdown;
      void el.closest<Popover>("btrix-popover")?.hide();
    };

    return html`<btrix-overflow-dropdown
      @btrix-select=${(e: CustomEvent) => e.stopPropagation()}
      @focus=${closePopover}
      @click=${closePopover}
    >
      <sl-menu>
        ${when(
          this.reviewUrl,
          (url) =>
            html`<btrix-menu-item-link href=${`${url}&itemPageId=${page.id}`}>
                <sl-icon slot="prefix" name="clipboard2-data"></sl-icon>
                ${msg("Review Page")}
              </btrix-menu-item-link>
              <sl-divider></sl-divider>`,
        )}
        <sl-menu-item
          @click=${() => ClipboardController.copyToClipboard(page.url)}
        >
          <sl-icon name="copy" slot="prefix"></sl-icon>
          ${msg("Copy URL")}
        </sl-menu-item>
      </sl-menu>
    </btrix-overflow-dropdown>`;
  };
}
