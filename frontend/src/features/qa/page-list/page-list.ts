import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators.js";

import type { QaPage } from "./ui/page";
import { renderItem } from "./ui/render-item";

import { TailwindElement } from "@/classes/TailwindElement";
import { type PageChangeEvent } from "@/components/ui/pagination";
import type { APIPaginatedList } from "@/types/api";
import type { ArchivedItemPage } from "@/types/crawler";

type SortDirection = "asc" | "desc";
type SortableFields = {
  [k in keyof ArchivedItemPage]?: {
    label: string;
    defaultDirection?: SortDirection;
  };
};
const sortableFields = {
  textMatch: {
    label: msg("Text Match"),
    defaultDirection: "asc",
  },
  screenshotMatch: {
    label: msg("Screenshot Match"),
    defaultDirection: "desc",
  },
  approved: {
    label: msg("Review Status"),
    // defaultDirection: "asc",
  },
  // timestamp: {
  //   label: msg("Time"),
  //   defaultDirection: "asc",
  // },
} satisfies SortableFields;

type SortField = keyof typeof sortableFields;
export type OrderBy = {
  field: SortField;
  direction: SortDirection;
};
type GroupName = "notReviewed" | "reviewed";
export type QaPaginationChangeDetail = {
  page: number;
  groupName: GroupName;
};

/**
 * @fires btrix-qa-pagination-change
 */
@localized()
@customElement("btrix-qa-page-list")
export class PageList extends TailwindElement {
  @property({ type: String })
  qaRunId?: string;

  @property({ type: String })
  itemPageId?: string;

  @property({ type: Object })
  notReviewedPages?: APIPaginatedList<ArchivedItemPage>;

  @property({ type: Object })
  reviewedPages?: APIPaginatedList<ArchivedItemPage>;

  @state()
  orderBy: OrderBy = {
    field: "textMatch",
    direction: "asc",
  };

  @state()
  filterBy: {
    reviewed?: boolean;
  } = {};

  @queryAll("btrix-qa-page")
  pageElems!: QaPage[];

  render() {
    console.log(this.pageElems);
    return html`
      <div
        class="z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-neutral-50 p-4"
      >
        ${
          // <btrix-search-combobox
          //   class="grow"
          //   .searchKeys=${["textMatch", "screenshotMatch"]}
          //   .searchOptions=${this.pages?.items ?? []}
          //   .selectedKey=${undefined}
          //   .placeholder=${msg("Search all crawls by name or Crawl Start URL")}
          //   @on-select=${() => {}}
          //   @on-clear=${() => {}}
          // >
          null
        }
        </btrix-search-combobox>
        <div class="flex w-full grow items-center md:w-fit">
          <div class="mr-2 whitespace-nowrap text-sm text-0-500">
            ${msg("Sort by:")}
          </div>
          <sl-select
            disabled
            class="flex-1 md:min-w-[9.2rem]"
            size="small"
            pill
            value=${this.orderBy.field}
            @sl-change=${(e: Event) => {
              const field = (e.target as HTMLSelectElement).value as SortField;
              this.orderBy = {
                field: field,
                direction:
                  (sortableFields[field] as SortableFields[SortField])
                    ?.defaultDirection ?? this.orderBy.direction,
              };
            }}
          >
            ${Object.entries(sortableFields).map(
              ([value, { label }]) => html`
                <sl-option value=${value}>${label}</sl-option>
              `,
            )}
          </sl-select>
          <sl-icon-button
            name="arrow-down-up"
            label=${msg("Reverse sort")}
            @click=${() => {
              this.orderBy = {
                ...this.orderBy,
                direction: this.orderBy.direction === "asc" ? "desc" : "asc",
              };
            }}
          ></sl-icon-button>
        </div>
      </div>
      <div
        class="-mx-2 overflow-y-auto px-2"
      >
      <div>
        ${
          this.notReviewedPages?.total || this.reviewedPages?.total
            ? html`
                ${this.renderGroup("notReviewed")}
                ${this.renderGroup("reviewed")}
              `
            : html`<div
                class="flex flex-col items-center justify-center gap-4 py-8 text-xs text-gray-600"
              >
                <sl-icon name="dash-circle" class="h-4 w-4"></sl-icon>
                ${msg("No pages to review")}
              </div>`
        }
          </div>
      </div>
    `;
  }

  private renderGroup(groupName: GroupName) {
    let pages = this.notReviewedPages;
    let heading = msg("Not Reviewed");
    if (groupName === "reviewed") {
      pages = this.reviewedPages;
      heading = msg("Reviewed");
    }

    if (!pages?.total) return;

    return html`
      <btrix-qa-page-group expanded>
        <div slot="header" class="flex items-center gap-2">
          ${heading}
          <btrix-badge>${pages.total.toLocaleString()}</btrix-badge>
        </div>
        <div class="py-2">
          ${pages.items.map((page) =>
            renderItem(
              page,
              this.qaRunId ?? "",
              this.orderBy,
              this.itemPageId ?? "",
            ),
          )}
          <div class="my-2 flex justify-center">
            <btrix-pagination
              page=${pages.page}
              totalCount=${pages.total}
              size=${pages.pageSize}
              compact
              @page-change=${(e: PageChangeEvent) => {
                this.dispatchEvent(
                  new CustomEvent<QaPaginationChangeDetail>(
                    "btrix-qa-pagination-change",
                    {
                      detail: {
                        page: e.detail.page,
                        groupName: groupName,
                      },
                    },
                  ),
                );
              }}
            >
            </btrix-pagination>
          </div>
        </div>
      </btrix-qa-page-group>
    `;
  }
}
