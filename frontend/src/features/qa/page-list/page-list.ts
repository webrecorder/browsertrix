import { localized, msg } from "@lit/localize";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { pageIsReviewed } from "./helpers";
import { groupBy } from "./helpers/groupBy";
import { sortBy } from "./helpers/sortBy";
import { type QaPage } from "./ui/page";
import { renderItem } from "./ui/render-item";

import { TailwindElement } from "@/classes/TailwindElement";
import { GroupedList, remainder } from "@/components/utils/grouped-list";
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

  private queuedCount = 0;
  private reviewedCount = 0;

  @state()
  filteredPages = this.pages?.items ?? [];

  protected async willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("tab") && this.tab === Tab.Reviewed) {
      // When switching to the "reviewed" tab, order by review status by default
      this.orderBy = {
        field: "approved",
        direction: "asc",
      };
    }
    if (changedProperties.has("pages") || changedProperties.has("tab")) {
      // Queued counts
      this.queuedCount = 0;
      this.reviewedCount = 0;

      // Filtered data
      const filteredPages: ArchivedItemPage[] = [];

      this.pages?.items.forEach((page) => {
        const isReviewed = pageIsReviewed(page);
        isReviewed ? this.reviewedCount++ : this.queuedCount++;
        if ((this.tab === Tab.Reviewed) === isReviewed) {
          filteredPages.push(page);
        }
      });
      this.filteredPages = filteredPages;
    }
    if (
      changedProperties.has("filteredPages") &&
      this.filteredPages.length > 0
    ) {
      this.dispatchEvent(
        new CustomEvent<string>("btrix-qa-page-select", {
          detail: this.filteredPages[0].id,
          bubbles: true,
          composed: true,
        }),
      );
      this.itemPageId = this.filteredPages[0].id;
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
            variant=${
              this.queuedCount > 0 || this.tab === Tab.Queued
                ? "primary"
                : "neutral"
            }
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
            variant=${
              this.reviewedCount > 0 || this.tab === Tab.Reviewed
                ? "primary"
                : "neutral"
            }
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
        @btrix-qa-page-select=${(e: CustomEvent<string>) => {
          this.currentPageElement = e.detail;
        }}
      >
        ${
          this.filteredPages.length > 0
            ? GroupedList({
                data: this.filteredPages,
                key: "id",
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
                  value: (page) =>
                    groupBy(page, this.qaRunId ?? "", this.orderBy),
                  groups: [
                    {
                      value: "severe",
                      renderLabel: ({ data }) =>
                        html`${msg("Severe")}
                          <btrix-badge class="ml-2" .variant=${"danger"}>
                            ${data.length}
                          </btrix-badge>`,
                    },
                    {
                      value: "moderate",
                      renderLabel: ({ data }) =>
                        html`${msg("Possible Issues")}
                          <btrix-badge class="ml-2" .variant=${"warning"}>
                            ${data.length}
                          </btrix-badge>`,
                    },
                    {
                      value: "good",
                      renderLabel: ({ data }) =>
                        html`${msg("Likely Good")}
                          <btrix-badge class="ml-2" .variant=${"success"}>
                            ${data.length}
                          </btrix-badge>`,
                    },
                    {
                      value: "commentOnly",
                      renderLabel: ({ data }) =>
                        html`${msg("Comments Only")}
                          <btrix-badge class="ml-2" .variant=${"primary"}>
                            ${data.length}
                          </btrix-badge>`,
                    },
                    {
                      value: "approved",
                      renderLabel: ({ data }) =>
                        html`${msg("Approved")}
                          <btrix-badge class="ml-2" .variant=${"success"}>
                            ${data.length}
                          </btrix-badge>`,
                    },
                    {
                      value: "rejected",
                      renderLabel: ({ data }) =>
                        html`${msg("Rejected")}
                          <btrix-badge class="ml-2" .variant=${"danger"}>
                            ${data.length}
                          </btrix-badge>`,
                    },
                    {
                      value: remainder,
                      renderLabel: ({ data }) =>
                        html`${msg("No QA Data")}
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
              </div>`
        }
      </div>
    `;
  }
}
