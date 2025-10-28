import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { loadingPanel } from "../templates/loading-panel";

import { BtrixElement } from "@/classes/BtrixElement";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { OrgTab } from "@/routes";
import { noData } from "@/strings/ui";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { Collection } from "@/types/collection";
import { isNotEqual } from "@/utils/is-not-equal";

const INITIAL_PAGE_SIZE = 10;

@customElement("btrix-org-settings-deduplication")
@localized()
export class OrgSettingsDeduplication extends BtrixElement {
  @property({ type: Boolean })
  visible?: boolean;

  @state({ hasChanged: isNotEqual })
  private pagination: Required<APIPaginationQuery> = {
    page: parsePage(new URLSearchParams(location.search).get("page")),
    pageSize: INITIAL_PAGE_SIZE,
  };

  protected willUpdate(changedProperties: PropertyValues): void {
    // Reset pagination when tab is hidden
    if (changedProperties.has("visible") && !this.visible) {
      this.pagination = {
        ...this.pagination,
        page: 1,
      };
    }
  }

  private readonly sources = new Task(this, {
    task: async ([pagination], { signal }) => {
      return this.getCollections({ ...pagination }, signal);
    },
    args: () => [this.pagination] as const,
  });

  render() {
    return html` ${this.sources.render({
      initial: loadingPanel,
      pending: () =>
        this.sources.value
          ? this.renderTable(this.sources.value)
          : loadingPanel(),
      complete: this.renderTable,
    })}`;
  }

  private readonly renderTable = (
    collections: APIPaginatedList<Collection>,
  ) => {
    return html`<btrix-table
        class="whitespace-nowrap [--btrix-table-cell-padding-x:var(--sl-spacing-2x-small)]"
        style="--btrix-table-grid-template-columns: 10ch 40ch repeat(4, 1fr) min-content"
      >
        <btrix-table-head class="mb-2">
          <btrix-table-header-cell>
            ${msg("Source Type")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>${msg("Name")}</btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Archived Items")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Index Entries")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Index Size")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Purgeable Entries")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            <span class="sr-only">${msg("Actions")}</span>
          </btrix-table-header-cell>
        </btrix-table-head>
        <btrix-table-body
          class="rounded border [--btrix-table-cell-padding:var(--sl-spacing-2x-small)]"
        >
          ${collections.items.map(
            (item) => html`
              <btrix-table-row
                class="border-t first:border-t-0 last:rounded-b hover:bg-neutral-50"
              >
                <btrix-table-cell>
                  <btrix-badge>${msg("Collection")}</btrix-badge>
                </btrix-table-cell>
                <btrix-table-cell>${item.name}</btrix-table-cell>
                <btrix-table-cell
                  >${this.localize.number(item.crawlCount)}</btrix-table-cell
                >
                <btrix-table-cell>${noData}</btrix-table-cell>
                <btrix-table-cell>${noData}</btrix-table-cell>
                <btrix-table-cell>${noData}</btrix-table-cell>
                <btrix-table-cell>
                  <sl-tooltip content=${msg("Open in New Tab")}>
                    <sl-icon-button
                      name="arrow-up-right"
                      href="${this.navigate
                        .orgBasePath}/${OrgTab.Collections}/view/${item.id}"
                      target="_blank"
                    >
                    </sl-icon-button>
                  </sl-tooltip>
                  <btrix-overflow-dropdown>
                    <sl-menu>
                      <sl-menu-item class="menu-item-warning"
                        >${msg("Clear Index")}</sl-menu-item
                      >
                      <sl-menu-item class="menu-item-danger"
                        >${msg("Delete Index")}</sl-menu-item
                      >
                    </sl-menu>
                  </btrix-overflow-dropdown>
                </btrix-table-cell>
              </btrix-table-row>
            `,
          )}
        </btrix-table-body>
      </btrix-table>
      ${when(
        collections.total > collections.pageSize,
        () => html`
          <footer class="mt-6 flex justify-center">
            <btrix-pagination
              page=${collections.page}
              totalCount=${collections.total}
              size=${collections.pageSize}
              @page-change=${async (e: PageChangeEvent) => {
                this.pagination = {
                  ...this.pagination,
                  page: e.detail.page,
                };
              }}
            ></btrix-pagination>
          </footer>
        `,
      )} `;
  };

  private async getCollections(
    params: APIPaginationQuery,
    signal: AbortSignal,
  ) {
    const query = queryString.stringify({
      pageSize: 2,
      ...params,
      hasDedupeIndex: true,
    });
    return this.api.fetch<APIPaginatedList<Collection>>(
      `/orgs/${this.orgId}/collections?${query}`,
      {
        signal,
      },
    );
  }
}
