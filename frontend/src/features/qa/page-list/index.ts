import "./ui";

import { TailwindElement } from "@/classes/TailwindElement";
import type { ArchivedItem, ArchivedItemPage } from "@/types/crawler";
import { localized, msg } from "@lit/localize";
import { type PropertyValues, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { GroupedList, remainder } from "@/components/utils/grouped-list";

import { pageIsReviewed } from "./helpers";
import { groupBy } from "./helpers/groupBy";

import { type QaPage } from "./ui/page";
import type { APIPaginatedList } from "@/types/api";
import { renderItem } from "./ui/render-item";
import { sortBy } from "./helpers/sortBy";

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

enum Tab {
  Queued = "queued",
  Reviewed = "reviewed",
}

@localized()
@customElement("btrix-qa-page-list")
export class PageList extends TailwindElement {
  @property({ type: String }) tab: Tab = Tab.Queued;

  @property({ attribute: false })
  item?: ArchivedItem;

  @property({ attribute: false })
  pages?: APIPaginatedList<ArchivedItemPage>;

  @state()
  orderBy: OrderBy = {
    field: "textMatch",
    direction: "asc",
  };

  #_itemPageId = "";

  @property({ type: String })
  set itemPageId(val: string | undefined) {
    this.#_itemPageId = val ?? "";
  }

  get itemPageId(): string {
    return this.#_itemPageId;
  }

  currentPageElement: QaPage | null = null;

  private queuedCount = 0;
  private reviewedCount = 0;
  private filteredPages = this.pages?.items ?? [];

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("pages") || changedProperties.has("tab")) {
      // Queued counts
      this.queuedCount = 0;
      this.reviewedCount = 0;

      // Filtered data
      this.filteredPages = [];

      this.pages?.items.forEach((page) => {
        const isReviewed = pageIsReviewed(page);
        isReviewed ? this.reviewedCount++ : this.queuedCount++;
        if ((this.tab === Tab.Reviewed) === isReviewed) {
          this.filteredPages.push(page);
        }
      });

      this.dispatchEvent(
        new CustomEvent<string | undefined>("qa-page-select", {
          detail: this.filteredPages[0]?.id,
          composed: true,
          bubbles: true,
        }),
      );
    }
    if (changedProperties.has("itemPageId")) {
      console.log(this.itemPageId);
    }
  }

  render() {
    return html`
      <div class="mb-2 flex gap-2 *:flex-auto">
        <btrix-navigation-button
          ?active=${this.tab === Tab.Queued}
          @click=${() => {
            this.tab = Tab.Queued;
          }}
        >
          ${msg("Queued")}
          <btrix-badge
            variant=${this.queuedCount > 0 || this.tab === Tab.Queued
              ? "primary"
              : "neutral"}
            aria-label=${
              "4 pages" // TODO properly localize plurals
            }
          >
            ${this.queuedCount}
          </btrix-badge>
        </btrix-navigation-button>
        <btrix-navigation-button
          ?active=${this.tab === Tab.Reviewed}
          @click=${() => {
            this.tab = Tab.Reviewed;
          }}
        >
          ${msg("Reviewed")}
          <btrix-badge
            variant=${this.reviewedCount > 0 || this.tab === Tab.Reviewed
              ? "primary"
              : "neutral"}
            aria-label=${
              "4 pages" // TODO properly localize plurals
            }
          >
            ${this.reviewedCount}
          </btrix-badge>
        </btrix-navigation-button>
      </div>

      <div
        class="z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-neutral-50 p-4"
      >
        <btrix-search-combobox
          class="grow"
          .searchKeys=${["textMatch", "screenshotMatch"]}
          .searchOptions=${this.pages?.items ?? []}
          .selectedKey=${undefined}
          .placeholder=${msg("Search all crawls by name or Crawl Start URL")}
          @on-select=${() => {}}
          @on-clear=${() => {}}
        >
        </btrix-search-combobox>
        <div class="flex w-full grow items-center md:w-fit">
          <div class="mr-2 whitespace-nowrap text-sm text-0-500">
            ${msg("Sort by:")}
          </div>
          <sl-select
            class="flex-1 md:min-w-[9.2rem]"
            size="small"
            pill
            value=${this.orderBy.field}
            @sl-change=${async (e: Event) => {
              const field = (e.target as HTMLSelectElement).value as SortField;
              this.orderBy = {
                field: field,
                direction:
                  (sortableFields[field] as SortableFields[SortField])
                    ?.defaultDirection ?? this.orderBy.direction,
              };
              await this.updateComplete;
              this.currentPageElement?.focus();
              this.currentPageElement?.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
              });
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
            @click=${async () => {
              this.orderBy = {
                ...this.orderBy,
                direction: this.orderBy.direction === "asc" ? "desc" : "asc",
              };
              await this.updateComplete;
              this.currentPageElement?.focus();
              this.currentPageElement?.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
              });
            }}
          ></sl-icon-button>
        </div>
      </div>
      <div
        class="-mx-2 overflow-y-auto px-2"
        @qa-page-select=${(e: CustomEvent<QaPage>) => {
          this.currentPageElement = e.detail;
        }}
      >
        ${this.filteredPages.length > 0
          ? GroupedList({
              data: this.filteredPages,
              renderWrapper: (contents) =>
                html`<div class="@container">${contents}</div>`,
              renderGroup: (header, items, group) =>
                html`<btrix-qa-page-group
                  expanded
                  class="is-group bg-neutral-0"
                  .isRemainderGroup=${group?.value === remainder}
                >
                  <div slot="header" class="flex items-center">${header}</div>
                  <div slot="content" class="py-2">${items}</div>
                </btrix-qa-page-group>`,
              renderItem: renderItem(this),
              sortBy: sortBy(this),
              groupBy: {
                value: (datum) => groupBy(datum, this.itemPageId, this.orderBy),
                groups: [
                  {
                    value: "severe",
                    renderLabel: ({ data }) =>
                      html`Severe
                        <btrix-badge class="ml-2" .variant=${"danger"}>
                          ${data.length}
                        </btrix-badge>`,
                  },
                  {
                    value: "moderate",
                    renderLabel: ({ data }) =>
                      html`Possible Issues
                        <btrix-badge class="ml-2" .variant=${"warning"}>
                          ${data.length}
                        </btrix-badge>`,
                  },
                  {
                    value: "good",
                    renderLabel: ({ data }) =>
                      html`Likely Good
                        <btrix-badge class="ml-2" .variant=${"success"}>
                          ${data.length}
                        </btrix-badge>`,
                  },
                  {
                    value: remainder,
                    renderLabel: ({ data }) =>
                      html`No QA Data
                        <btrix-badge class="ml-2" .variant=${"high-contrast"}>
                          ${data.length}
                        </btrix-badge>`,
                  },
                ],
              },
            })
          : html`<div
              class="flex flex-col items-center justify-center gap-4 py-8 text-xs text-gray-600"
            >
              <sl-icon name="dash-circle" class="h-4 w-4"></sl-icon>
              ${msg("No pages")}
            </div>`}
      </div>
    `;
  }
}
