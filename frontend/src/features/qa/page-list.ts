import { TailwindElement } from "@/classes/TailwindElement";
import { type ArchivedItem } from "@/types/crawler";
import { localized, msg } from "@lit/localize";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { GroupedList, remainder } from "./grouped-list";

import {
  calculateSeverityFromDatum,
  errorsFromDatum,
  testData,
} from "./test-data";

type SearchFields = "name" | "issues";

enum Tab {
  Queued = "queued",
  Reviewed = "reviewed",
}

@localized()
@customElement("btrix-qa-page-list")
export class PageList extends TailwindElement {
  static FieldLabels: Record<SearchFields, string> = {
    name: msg("Name"),
    issues: msg("Most Issues"),
  };

  @property({ type: String }) tab: Tab = Tab.Queued;

  @property({ attribute: false })
  item!: ArchivedItem;

  static styles = css`
    sl-tree-item::part(item) {
      border-inline-start: none;
      background: none;
    }
    sl-tree-item.is-group::part(item) {
      position: sticky;
      top: 0;
      z-index: 5;
      border-bottom: 1px solid var(--sl-color-neutral-200);
      background-color: white;
    }
    sl-tree-item.is-leaf::part(item) {
      display: block;
    }
    sl-tree-item::part(label) {
      flex: 1 1 auto;
      display: block;
    }
    sl-tree-item::part(indentation),
    sl-tree-item.is-leaf::part(expand-button) {
      display: none;
    }
    sl-tree-item.is-leaf::part(item--selected) {
      background: none;
    }
  `;

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
      <div class=" overflow-y-auto">
        <div class="z-10 mb-3 rounded-lg border bg-neutral-50 p-4">
          <btrix-search-combobox
            .searchKeys=${[]}
            .searchOptions=${[]}
            .keyLabels=${PageList.FieldLabels}
            .selectedKey=${undefined}
            .placeholder=${msg("Search all crawls by name or Crawl Start URL")}
            @on-select=${(e: CustomEvent) => {
              const { key, value } = e.detail;
              console.log({ key, value });
            }}
            @on-clear=${() => {
              console.log("clear filters");
            }}
          >
          </btrix-search-combobox>
        </div>
        ${GroupedList({
          data: testData,
          renderWrapper: (contents) =>
            html`<sl-tree selection="leaf" class="@container"
              >${contents}</sl-tree
            >`,
          renderGroup: (header, items) =>
            html`<sl-tree-item expanded class="is-group bg-neutral-0">
              ${header} ${items}
            </sl-tree-item>`,
          renderItem: (datum) =>
            html`<sl-tree-item
              class="is-leaf my-2 ml-4 block flex-auto rounded border px-4 py-2 pl-5 shadow-sm transition-shadow aria-selected:border-blue-500 aria-selected:bg-blue-50 aria-selected:shadow-md aria-selected:shadow-blue-800/20 aria-selected:transition-none"
            >
              <div
                class="absolute -left-9 top-[50%] flex w-8 translate-y-[-50%] flex-col place-items-center gap-1 rounded-full border bg-neutral-0 p-2 shadow-sm"
              >
                ${{
                  severe: html`<sl-icon
                    name="exclamation-triangle-fill"
                    class="text-red-600"
                  ></sl-icon>`,
                  moderate: html`<sl-icon
                    name="dash-square-fill"
                    class="text-yellow-600"
                  ></sl-icon>`,
                  good: html`<sl-icon
                    name="check-circle-fill"
                    class="text-green-600"
                  ></sl-icon>`,
                }[calculateSeverityFromDatum(datum)]}
                ${datum.comment &&
                html`<sl-icon
                  name="chat-square-text-fill"
                  class="text-blue-600"
                ></sl-icon>`}
              </div>
              <h5 class="truncate text-sm font-semibold">${datum.title}</h5>
              <div class="truncate text-xs text-blue-600">${datum.url}</div>
            </sl-tree-item>`,
          sortBy: (a, b) => errorsFromDatum(b) - errorsFromDatum(a),
          groupBy: {
            value: calculateSeverityFromDatum,
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
