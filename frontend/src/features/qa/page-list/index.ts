export * from "./ui";

import { TailwindElement } from "@/classes/TailwindElement";
import type { ArchivedItem, ArchivedItemPage } from "@/types/crawler";
import { localized, msg } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { GroupedList, remainder } from "../../../components/ui/grouped-list";

import { testData } from "./test-data";
import { pageDetails } from "./page-details";
import {
  composeWithRunId,
  groupBy,
  issueCounts,
  severityFromMatch,
  severityIcon,
} from "./helpers";

import { type Ref, createRef, ref } from "lit/directives/ref.js";
import { type QaPage } from "./ui";

type SortField = ("textMatch" | "screenshotMatch") & keyof ArchivedItemPage;
type SortDirection = "asc" | "desc";
export type OrderBy = {
  field: SortField;
  direction: SortDirection;
};
const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  textMatch: {
    label: msg("Text Match"),
    defaultDirection: "asc",
  },
  screenshotMatch: {
    label: msg("Screenshot Match"),
    defaultDirection: "asc",
  },
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
  item!: ArchivedItem;

  @state()
  orderBy: OrderBy = {
    field: "textMatch",
    direction: "asc",
  };

  @property({ type: String, reflect: true })
  currentPage: string | undefined;

  @property({ type: String }) qaRunId = "";

  currentPageElement: Ref<QaPage> = createRef();

  connectedCallback() {
    super.connectedCallback();
    if (!this.currentPage) {
      this.currentPage =
        testData.find(
          (d) =>
            severityFromMatch(d[this.orderBy.field]?.[this.qaRunId]) ===
            "severe",
        )?.id ?? testData[0].id;
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
            variant="primary"
            aria-label=${
              "4 pages" // TODO properly localize plurals
            }
          >
            4
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
            variant="primary"
            aria-label=${
              "4 pages" // TODO properly localize plurals
            }
          >
            4
          </btrix-badge>
        </btrix-navigation-button>
      </div>

      <div
        class="z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-neutral-50 p-4"
      >
        <btrix-search-combobox
          class="grow"
          .searchKeys=${["textMatch", "screenshotMatch"]}
          .searchOptions=${testData}
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
                  sortableFields[field].defaultDirection ||
                  this.orderBy.direction,
              };
              await this.updateComplete;
              this.currentPageElement.value?.focus();
              this.currentPageElement.value?.scrollIntoView({
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
              this.currentPageElement.value?.focus();
              this.currentPageElement.value?.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
              });
            }}
          ></sl-icon-button>
        </div>
      </div>
      <div class="-mx-2 overflow-y-auto px-2">
        ${GroupedList({
          data: testData,
          renderWrapper: (contents) =>
            html`<div
              class="@container"
              @qa-page-select=${async (e: CustomEvent<string | undefined>) => {
                this.currentPage = e.detail;
                await this.updateComplete;
                this.currentPageElement.value?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                });
              }}
            >
              ${contents}
            </div>`,
          renderGroup: (header, items) =>
            html`<btrix-qa-page-group expanded class="is-group bg-neutral-0">
              <div slot="header">${header}</div>
              <div slot="content" class="py-2">${items}</div>
            </btrix-qa-page-group>`,
          renderItem: (datum) =>
            html`<btrix-qa-page
              class="is-leaf -my-4 scroll-my-8 py-4 [contain-intrinsic-height:auto_70px] [contain:strict] [content-visibility:auto] first-of-type:mt-0 last-of-type:mb-0"
              .selected=${this.currentPage === datum.id}
              .pageId=${datum.id}
              ${this.currentPage === datum.id
                ? ref(this.currentPageElement)
                : nothing}
            >
              <div
                class="absolute -left-4 top-[50%] flex w-8 translate-y-[-50%] flex-col place-items-center gap-1 rounded-full border border-gray-300 bg-neutral-0 p-2 leading-[14px] shadow-sm"
              >
                ${severityIcon(
                  severityFromMatch(datum[this.orderBy.field]?.[this.qaRunId]),
                )}
                ${issueCounts(datum, this.qaRunId).severe > 1
                  ? html`<span class="text-[10px] font-semibold text-red-600"
                      >+${issueCounts(datum, this.qaRunId).severe - 1}</span
                    >`
                  : issueCounts(datum, this.qaRunId).moderate > 1
                    ? html`<span
                        class="text-[10px] font-semibold text-yellow-600"
                        >+${issueCounts(datum, this.qaRunId).moderate - 1}</span
                      >`
                    : nothing}
                ${datum.notes?.[0] &&
                html`<sl-icon
                  name="chat-square-text-fill"
                  class="text-blue-600"
                ></sl-icon>`}
              </div>
              <h5 class="truncate text-sm font-semibold text-black">
                ${datum.title}
              </h5>
              <div class="truncate text-xs leading-4 text-blue-600">
                ${datum.url}
              </div>
              <div
                slot="content"
                class="z-10 -mt-2 ml-6 mr-2 rounded-b-lg border border-solid border-gray-200 bg-neutral-0 px-4 pb-1 pt-4"
              >
                ${pageDetails(datum, this.qaRunId)}
              </div>
            </btrix-qa-page>`,
          sortBy: (a, b) =>
            ((b[this.orderBy.field]?.[this.qaRunId] ?? 0) -
              (a[this.orderBy.field]?.[this.qaRunId] ?? 0)) *
            (this.orderBy.direction === "asc" ? 1 : -1),
          groupBy: {
            value: composeWithRunId(groupBy, this.qaRunId, this.orderBy),
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
                value: remainder,
                renderLabel: ({ data }) =>
                  html`Likely Good
                    <btrix-badge class="ml-2" .variant=${"success"}>
                      ${data.length}
                    </btrix-badge>`,
              },
            ],
          },
        })}
      </div>
    `;
  }
}
