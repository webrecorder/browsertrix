import { localized, msg } from "@lit/localize";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { type QaPage } from "./ui/page";
import { renderItem } from "./ui/render-item";

import { TailwindElement } from "@/classes/TailwindElement";
import type { APIPaginatedList } from "@/types/api";
import type { ArchivedItem, ArchivedItemPage } from "@/types/crawler";

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

@localized()
@customElement("btrix-qa-page-list")
export class PageList extends TailwindElement {
  @property({ attribute: false })
  item?: ArchivedItem;

  @property({ attribute: false })
  pages?: APIPaginatedList<ArchivedItemPage>;

  @state()
  orderBy: OrderBy = {
    field: "textMatch",
    direction: "asc",
  };

  @property({ type: String })
  qaRunId?: string;

  #_itemPageId = "";

  @property({ type: String })
  set itemPageId(val: string | undefined) {
    this.#_itemPageId = val ?? "";
  }

  get itemPageId(): string {
    return this.#_itemPageId;
  }

  currentPageElement: QaPage | null = null;

  protected async willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("pages")) {
      const hasPage = this.pages?.items.some(
        ({ id }) => id === this.itemPageId,
      );

      if (!hasPage) {
        // Select first item by default
        const firstPage = this.pages?.items[0];
        if (!firstPage) return;
        this.dispatchEvent(
          new CustomEvent<string>("btrix-qa-page-select", {
            detail: firstPage.id,
            bubbles: true,
            composed: true,
          }),
        );
        this.itemPageId = firstPage.id;
      }
    }
  }

  private onSetReviewedTab() {
    // When switching to the "reviewed" tab, order by review status by default
    this.orderBy = {
      field: "approved",
      direction: "asc",
    };
  }

  render() {
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
          this.pages?.total
            ? this.pages?.items.map((page) =>
                renderItem(
                  page,
                  this.qaRunId ?? "",
                  this.orderBy,
                  this.itemPageId,
                ),
              )
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
}
