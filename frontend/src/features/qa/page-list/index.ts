import { TailwindElement } from "@/classes/TailwindElement";
import { type ArchivedItem } from "@/types/crawler";
import { localized, msg } from "@lit/localize";
import { css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { GroupedList, remainder } from "../../../components/ui/grouped-list";

import { testData } from "./test-data";
import { pageDetails } from "./page-details";
import type { SlTreeItem } from "@shoelace-style/shoelace";
import {
  composeWithRunId,
  issueCounts,
  maxSeverity,
  severityIcon,
} from "./helpers";

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

  @property({ type: String }) qaRunId = "";

  previousSelection: SlTreeItem | null = null;

  static styles = css`
    @tailwind base;
    @tailwind components;
    @tailwind utilities;

    @layer components {
      sl-tree-item::part(item) {
        border-inline-start: none;
        background: none;
      }
      sl-tree-item.is-group::part(item) {
        position: sticky;
        top: 0;
        border-bottom: 1px solid var(--sl-color-neutral-200);
        @apply z-30 bg-gradient-to-b from-white to-white/85 backdrop-blur-sm;
      }

      sl-tree-item::part(label) {
        flex: 1 1 auto;
        display: block;
      }
      sl-tree-item::part(indentation),
      sl-tree-item.is-leaf::part(expand-button),
      sl-tree-item.is-detail::part(expand-button) {
        display: none;
      }
      sl-tree-item.is-leaf::part(item--selected) {
        background: none;
      }
      sl-tree-item.is-leaf::part(item) {
        @apply block;
      }
      sl-tree-item.is-leaf:focus-visible::part(item) {
        @apply z-20;
      }
      sl-tree-item.is-leaf::part(label) {
        @apply relative z-20 ml-4 block flex-auto overflow-visible rounded border border-solid border-gray-300 bg-white px-4 py-2 pl-5 shadow-sm transition-shadow aria-selected:border-blue-500 aria-selected:bg-blue-50 aria-selected:shadow-md aria-selected:shadow-blue-800/20 aria-selected:transition-none;
      }
      sl-tree-item.is-detail::part(label) {
        @apply z-10 -mt-2 ml-6 mr-2 rounded-b-lg border border-solid border-gray-200 bg-neutral-0 px-4 pb-1 pt-4;
      }
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
      <div class=" -mx-2 overflow-y-auto px-2">
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
            html`<sl-tree
              class="@container"
              @sl-selection-change=${(
                e: CustomEvent<{ selection: SlTreeItem[] }>,
              ) => {
                console.log(e);
                if (e.detail.selection[0].classList.contains("is-group")) {
                  if (this.previousSelection) {
                    this.previousSelection.selected = true;
                  } else {
                    const leaf =
                      e.detail.selection[0].querySelector<SlTreeItem>(
                        ".is-leaf",
                      );
                    if (leaf) leaf.selected = true;
                  }
                }
                if (e.detail.selection[0].classList.contains("is-leaf")) {
                  const leaf = e.detail.selection[0];
                  leaf.expanded = true;
                  if (this.previousSelection)
                    this.previousSelection.expanded = false;
                  this.previousSelection = leaf;
                  leaf.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  });
                }
                if (e.detail.selection[0].classList.contains("is-detail")) {
                  const leaf = e.detail.selection[0].closest<SlTreeItem>(
                    "sl-tree-item.is-leaf",
                  )!;
                  leaf.selected = true;
                  leaf.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  });
                }
              }}
              >${contents}</sl-tree
            >`,
          renderGroup: (header, items) =>
            html`<sl-tree-item
              expanded
              class="is-group bg-neutral-0"
              .selectable=${false}
            >
              <div class="tree-item__expand-button">${header}</div>
              ${items}
            </sl-tree-item>`,
          renderItem: (datum) =>
            html`<sl-tree-item
              class="is-leaf -my-4 py-4 [contain:content] [content-visibility:auto] first-of-type:mt-0 last-of-type:mb-0"
            >
              <div
                class="absolute -left-4 top-[50%] flex w-8 translate-y-[-50%] flex-col place-items-center gap-1 rounded-full border border-gray-300 bg-neutral-0 p-2 shadow-sm"
              >
                ${severityIcon(maxSeverity(datum, this.qaRunId))}
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
              <h5 class="truncate text-sm font-semibold">${datum.title}</h5>
              <div class="truncate text-xs text-blue-600">${datum.url}</div>
              <sl-tree-item class="is-detail" .selectable=${false}
                >${pageDetails(datum, this.qaRunId)}</sl-tree-item
              >
            </sl-tree-item>`,
          // sortBy: (a, b) =>
          //   issueCounts(b, this.qaRunId).severe -
          //     issueCounts(a, this.qaRunId).severe ||
          //   issueCounts(b, this.qaRunId).moderate -
          //     issueCounts(a, this.qaRunId).moderate,
          groupBy: {
            value: composeWithRunId(maxSeverity, this.qaRunId),
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
