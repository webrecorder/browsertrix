import { TailwindElement } from "@/classes/TailwindElement";
import { type ArchivedItem } from "@/types/crawler";
import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

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
      <btrix-data-driven-table
        .data=${[
          { title: "Example page with resource errors" },
          { in: 1, a: "1", b: "a2", c: 3 },
          { in: 2, a: "1", b: "a3", c: 3 },
          { in: 3, a: "1", b: "a2", c: 3 },
        ]}
        .group=${{ value: "b", groups: [{ value: "a2" }] }}
        .renderItem=${() => null}
      ></btrix-data-driven-table>
    `;
  }
}
