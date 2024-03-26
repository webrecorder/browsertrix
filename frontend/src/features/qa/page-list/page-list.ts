import { localized, msg, str } from "@lit/localize";
import type { SlChangeEvent, SlSelect } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { renderItem } from "./ui/render-item";

import { TailwindElement } from "@/classes/TailwindElement";
import { type PageChangeEvent } from "@/components/ui/pagination";
import type { APIPaginatedList } from "@/types/api";
import type { ArchivedItemQAPage } from "@/types/qa";

type SortDirection = "asc" | "desc";
type SortableFieldNames = "textMatch" | "screenshotMatch" | "approved";
type SortableFields = Record<
  SortableFieldNames,
  {
    label: string;
    defaultDirection?: SortDirection;
  }
>;
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
  // url: {
  //   label: msg("Page URL"),
  //   defaultDirection: "desc",
  // },
  // title: {
  //   label: msg("Page Title"),
  //   defaultDirection: "desc",
  // },
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
export type QaPaginationChangeDetail = {
  page: number;
};
export type QaFilterChangeDetail = {
  reviewed: undefined | boolean;
  approved: undefined | boolean;
  hasNotes: undefined | boolean;
};
export type QaSortChangeDetail = {
  reviewed: undefined | boolean;
  approved: undefined | boolean;
  hasNotes: undefined | boolean;
};

/**
 * @fires btrix-qa-pagination-change
 * @fires btrix-qa-filter-change
 */
@localized()
@customElement("btrix-qa-page-list")
export class PageList extends TailwindElement {
  @property({ type: String })
  qaRunId?: string;

  @property({ type: String })
  itemPageId?: string;

  @property({ type: Object })
  pages?: APIPaginatedList<ArchivedItemQAPage>;

  @property({ type: Number })
  totalPages = 0;

  @state()
  orderBy: OrderBy = {
    field: "textMatch",
    direction: "asc",
  };

  render() {
    return html`
      <div
        class="z-40 mb-1 flex flex-wrap items-center gap-2 rounded-lg border bg-neutral-50 p-4"
      >
        <div class="flex w-full grow items-center md:w-fit">
          <div class="mr-2 whitespace-nowrap text-xs">${msg("Sort by:")}</div>
          <sl-select
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
        ${this.renderFilterControl()}
      </div>
      <div class="-mx-2 overflow-y-auto px-2">
        ${this.pages?.total
          ? html`
              <div
                class="sticky top-0 z-30 bg-gradient-to-b from-white to-white/85 backdrop-blur-sm"
              >
                <div class="ml-2 border-b px-2 py-1 text-xs text-neutral-500">
                  ${this.pages.total === this.totalPages
                    ? msg(
                        str`Showing all ${this.totalPages.toLocaleString()} pages`,
                      )
                    : msg(
                        str`Showing ${this.pages.total.toLocaleString()} of ${this.totalPages.toLocaleString()} pages`,
                      )}
                </div>
              </div>
              ${this.pages.items.map((page) =>
                renderItem(page, this.orderBy, this.itemPageId ?? ""),
              )}
              <div class="my-2 flex justify-center">
                <btrix-pagination
                  page=${this.pages.page}
                  totalCount=${this.pages.total}
                  size=${this.pages.pageSize}
                  compact
                  @page-change=${(e: PageChangeEvent) => {
                    e.stopPropagation();
                    this.dispatchEvent(
                      new CustomEvent<QaPaginationChangeDetail>(
                        "btrix-qa-pagination-change",
                        {
                          detail: { page: e.detail.page },
                        },
                      ),
                    );
                  }}
                >
                </btrix-pagination>
              </div>
            `
          : html`<div
              class="flex flex-col items-center justify-center gap-4 py-8 text-xs text-gray-600"
            >
              <sl-icon name="dash-circle" class="h-4 w-4"></sl-icon>
              ${msg("No matching pages found")}
            </div>`}
      </div>
    `;
  }

  private renderFilterControl() {
    return html`
      <div class="w-full">
        <sl-select
          label=${msg("Review state:")}
          @sl-change=${(e: SlChangeEvent) => {
            const { value } = e.target as SlSelect;
            const detail: QaFilterChangeDetail = {
              reviewed: undefined,
              approved: undefined,
              hasNotes: undefined,
            };
            switch (value) {
              case "notReviewed":
                detail.reviewed = false;
                break;
              case "reviewed":
                detail.reviewed = true;
                break;
              case "approved":
                detail.approved = true;
                break;
              case "rejected":
                detail.approved = false;
                break;
              case "hasNotes":
                detail.hasNotes = true;
                break;
              default:
                break;
            }
            this.dispatchEvent(
              new CustomEvent<QaFilterChangeDetail>("btrix-qa-filter-change", {
                detail,
              }),
            );
          }}
          pill
          size="small"
        >
          <sl-option value="">${msg("Any")}</sl-option>
          <sl-option value="notReviewed">${msg("No Review")}</sl-option>
          <sl-option value="reviewed">${msg("Reviewed")}</sl-option>
          <sl-option value="approved">${msg("Reviewed as approved")}</sl-option>
          <sl-option value="rejected">${msg("Reviewed as rejected")}</sl-option>
          <sl-option value="hasNotes"
            >${msg("Reviewed with comment")}</sl-option
          >
        </sl-select>
      </div>
    `;
  }
}
