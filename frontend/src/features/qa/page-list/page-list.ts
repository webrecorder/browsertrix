import { localized, msg, str } from "@lit/localize";
import type { SlChangeEvent, SlSelect } from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";

import type { Page } from "./helpers/page";

import { BtrixElement } from "@/classes/BtrixElement";
import { type PageChangeEvent } from "@/components/ui/pagination";
import { renderSpinner } from "@/pages/org/archived-item-qa/ui/spinner";
import type { APIPaginatedList, APISortQuery } from "@/types/api";
import { pluralOf } from "@/utils/pluralize";

export type SortDirection = "asc" | "desc";
export type SortableFieldNames =
  | "textMatch"
  | "screenshotMatch"
  | "approved"
  | "notes";
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
    label: msg("Approval"),
    // defaultDirection: "asc",
  },
  notes: {
    label: msg("Comments"),
    defaultDirection: "desc",
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
export type QaSortChangeDetail = APISortQuery & { sortBy: SortableFieldNames };

/**
 * @fires btrix-qa-pagination-change
 * @fires btrix-qa-filter-change
 * @fires btrix-qa-sort-change
 */
@customElement("btrix-qa-page-list")
@localized()
export class PageList extends BtrixElement {
  @property({ type: String })
  qaRunId?: string;

  @property({ type: String })
  itemPageId?: string;

  @property({ type: Object })
  pages?: APIPaginatedList<Page>;

  @property({ type: Number })
  totalPages = 0;

  @property({ type: Object })
  orderBy: OrderBy = {
    field: "screenshotMatch",
    direction: "asc",
  };

  @property({ type: Object })
  filterBy: {
    reviewed?: boolean;
    approved?: boolean;
    hasNotes?: boolean;
  } = {};

  @query(".scrollContainer")
  private readonly scrollContainer?: HTMLElement | null;

  protected async updated(changedProperties: PropertyValues<this>) {
    if (
      changedProperties.has("pages") &&
      changedProperties.get("pages") &&
      this.pages
    ) {
      this.scrollContainer?.scrollTo({ top: 0, left: 0 });
    }
  }

  render() {
    return html`
      <div
        class="z-40 mb-1 flex flex-wrap items-center gap-2 rounded-lg border bg-neutral-50 p-2"
      >
        ${this.renderSortControl()} ${this.renderFilterControl()}
      </div>
      <div
        class="scrollContainer relative -mx-2 overflow-y-auto overscroll-contain px-2"
      >
        ${when(
          this.pages,
          ({ total, items, page, pageSize }) =>
            total
              ? html`
                  <div
                    class="sticky top-0 z-30 bg-gradient-to-b from-white to-white/85 backdrop-blur-sm"
                  >
                    <div
                      class="mb-0.5 ml-2 border-b py-1 text-xs text-neutral-500"
                    >
                      ${total === this.totalPages
                        ? msg(
                            str`Showing all ${this.localize.number(this.totalPages)} ${pluralOf("pages", this.totalPages)}`,
                          )
                        : msg(
                            str`Showing ${this.localize.number(total)} of ${this.localize.number(this.totalPages)} ${pluralOf("pages", this.totalPages)}`,
                          )}
                    </div>
                  </div>
                  ${repeat(
                    items,
                    ({ id }) => id,
                    (page) => html`
                      <btrix-qa-page
                        class="is-leaf -my-4 scroll-my-8 py-4 first-of-type:mt-0 last-of-type:mb-0"
                        .page=${page}
                        statusField=${this.orderBy.field === "notes"
                          ? "approved"
                          : this.orderBy.field}
                        ?selected=${page.id === this.itemPageId}
                      >
                      </btrix-qa-page>
                    `,
                  )}
                  <div class="my-2 flex justify-center">
                    <btrix-pagination
                      page=${page}
                      totalCount=${total}
                      size=${pageSize}
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

                  <div
                    class="sticky bottom-0 z-30 h-4 bg-gradient-to-t from-white to-white/0"
                  ></div>
                `
              : html`<div
                  class="flex flex-col items-center justify-center gap-4 py-8 text-xs text-gray-600"
                >
                  <sl-icon name="slash-circle"></sl-icon>
                  ${msg("No matching pages found")}
                </div>`,
          renderSpinner,
        )}
      </div>
    `;
  }

  private renderSortControl() {
    return html`
      <div class="flex w-full grow items-center md:w-fit">
        <sl-select
          class="label-same-line flex-1"
          label=${msg("Sort by:")}
          size="small"
          pill
          value="worstScreenshotMatch"
          @sl-change=${(e: Event) => {
            const { value } = e.target as SlSelect;
            const detail: QaSortChangeDetail = {
              sortBy: this.orderBy.field,
              sortDirection: this.orderBy.direction === "asc" ? 1 : -1,
            };
            switch (value) {
              case "bestScreenshotMatch":
                detail.sortBy = "screenshotMatch";
                detail.sortDirection = -1;
                break;
              case "worstScreenshotMatch":
                detail.sortBy = "screenshotMatch";
                detail.sortDirection = 1;
                break;
              case "bestTextMatch":
                detail.sortBy = "textMatch";
                detail.sortDirection = -1;
                break;
              case "worstTextMatch":
                detail.sortBy = "textMatch";
                detail.sortDirection = 1;
                break;
              case "approved":
                detail.sortBy = "approved";
                detail.sortDirection = -1;
                break;
              case "notApproved":
                detail.sortBy = "approved";
                detail.sortDirection = 1;
                break;
              case "comments":
                detail.sortBy = "notes";
                detail.sortDirection = -1;
                break;
              // case "url":
              //   detail.sortBy = "url";
              //   detail.sortDirection = 1;
              //   break;
              // case "title":
              //   detail.sortBy = "title";
              //   detail.sortDirection = 1;
              //   break;
              default:
                break;
            }
            this.dispatchEvent(
              new CustomEvent<QaSortChangeDetail>("btrix-qa-sort-change", {
                detail,
              }),
            );
          }}
        >
          <sl-option value="bestScreenshotMatch"
            >${msg("Best Screenshot Match")}</sl-option
          >
          <sl-option value="worstScreenshotMatch"
            >${msg("Worst Screenshot Match")}</sl-option
          >
          <sl-option value="bestTextMatch"
            >${msg("Best Extracted Text Match")}</sl-option
          >
          <sl-option value="worstTextMatch"
            >${msg("Worst Extracted Text Match")}</sl-option
          >
          <sl-option value="comments">${msg("Most Comments")}</sl-option>
          <sl-option value="approved">${msg("Recently Approved")}</sl-option>
          <sl-option value="notApproved">${msg("Not Approved")}</sl-option>
        </sl-select>
      </div>
    `;
  }

  private renderFilterControl() {
    const value = () => {
      if (this.filterBy.approved) return "approved";
      if (this.filterBy.approved === false) return "rejected";
      if (this.filterBy.reviewed) return "reviewed";
      if (this.filterBy.reviewed === false) return "notReviewed";
      if (this.filterBy.hasNotes) return "hasNotes";
      return "";
    };
    return html`
      <div class="w-full">
        <sl-select
          class="label-same-line"
          label=${msg("Approval:")}
          value=${value()}
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
          <sl-option value="notReviewed">${msg("None")}</sl-option>
          <sl-option value="reviewed"
            >${msg("Approved, Rejected, or Commented")}</sl-option
          >
          <sl-option value="approved">${msg("Approved")}</sl-option>
          <sl-option value="rejected">${msg("Rejected")}</sl-option>
          <sl-option value="hasNotes">${msg("Commented")}</sl-option>
        </sl-select>
      </div>
    `;
  }
}
