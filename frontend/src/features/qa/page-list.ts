import { TailwindElement } from "@/classes/TailwindElement";
import { type ArchivedItem } from "@/types/crawler";
import { localized, msg } from "@lit/localize";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { DataTable, remainder } from "./collapsible-table";

import {
  calculateSeverityFromDatum,
  errorsFromDatum,
  testData,
} from "./test-data";
import { tw } from "@/utils/tailwind";

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
    }
    sl-tree-item::part(label) {
      flex: 1 1 auto;
    }
    sl-tree-item::part(indentation),
    sl-tree-item.is-leaf::part(expand-button) {
      display: none;
    }
    sl-tree-item.is-leaf::part(item--selected) {
      background: none;
    }
    sl-tree-item.is-leaf::part(item--selected) {
      outline: 2px solid blue;
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
      <div class="sticky top-2 z-10 mb-3 rounded-lg border bg-neutral-50 p-4">
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
      ${DataTable({
        data: testData,
        renderItem: (datum) =>
          html`<div class="my-1 flex-auto rounded border px-4 py-2 shadow-sm">
            <h5 class=${tw` text-sm font-semibold`}>${datum.title}</h5>
            <div class=${tw`text-xs text-blue-600`}>url goes here</div>
          </div>`,
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
    `;
  }
}
