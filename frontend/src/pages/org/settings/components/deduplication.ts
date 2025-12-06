import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { loadingPanel } from "../templates/loading-panel";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { OrgTab } from "@/routes";
import { noData } from "@/strings/ui";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { Collection } from "@/types/collection";
import { isNotEqual } from "@/utils/is-not-equal";

type DedupeSource = Collection;

const INITIAL_PAGE_SIZE = 10;

@customElement("btrix-org-settings-deduplication")
@localized()
export class OrgSettingsDeduplication extends BtrixElement {
  @property({ type: Boolean })
  visible?: boolean;

  @state()
  private indexToClear?: DedupeSource;

  @state()
  private indexToDelete?: DedupeSource;

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
    return html`
      ${this.sources.render({
        initial: loadingPanel,
        pending: () =>
          this.sources.value
            ? this.renderTable(this.sources.value)
            : loadingPanel(),
        complete: this.renderTable,
      })}
      ${this.renderClearConfirmation()} ${this.renderDeleteConfirmation()}
    `;
  }

  private readonly renderTable = (sources: APIPaginatedList<DedupeSource>) => {
    return html`
      <btrix-overflow-scroll>
        <btrix-table
          class="whitespace-nowrap [--btrix-table-cell-padding-x:var(--sl-spacing-2x-small)]"
          style="--btrix-table-grid-template-columns: 12ch 40ch repeat(4, 1fr) min-content"
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
            ${sources.items.map(
              (item) => html`
                <btrix-table-row
                  class="border-t first:border-t-0 last:rounded-b hover:bg-neutral-50"
                >
                  <btrix-table-cell>
                    <btrix-badge class="whitespace-nowrap">
                      <sl-icon name="collection" class="mr-1.5"></sl-icon>
                      ${msg("Collection")}
                    </btrix-badge>
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
                        <sl-menu-item
                          class="menu-item-warning"
                          @click=${() => (this.indexToClear = item)}
                        >
                          ${msg("Clear Index")}
                        </sl-menu-item>
                        <sl-menu-item
                          class="menu-item-danger"
                          @click=${() => (this.indexToDelete = item)}
                        >
                          ${msg("Delete Index")}
                        </sl-menu-item>
                      </sl-menu>
                    </btrix-overflow-dropdown>
                  </btrix-table-cell>
                </btrix-table-row>
              `,
            )}
          </btrix-table-body>
        </btrix-table>
      </btrix-overflow-scroll>

      ${when(
        sources.total > sources.pageSize,
        () => html`
          <footer class="mt-6 flex justify-center">
            <btrix-pagination
              page=${sources.page}
              totalCount=${sources.total}
              size=${sources.pageSize}
              @page-change=${async (e: PageChangeEvent) => {
                this.pagination = {
                  ...this.pagination,
                  page: e.detail.page,
                };
              }}
            ></btrix-pagination>
          </footer>
        `,
      )}
    `;
  };

  private renderClearConfirmation() {
    return html`<btrix-dialog
      label=${msg("Clear Purgeable Items?")}
      ?open=${!!this.indexToClear}
    >
      ${when(this.indexToClear, (col) => {
        const collection_name = html`<strong class="font-semibold"
          >${col.name}</strong
        >`;
        const bytes = "TODO";
        return html`
          <p>
            ${msg(
              html`Are you sure you want to clear ${collection_name} of
              purgeable items?`,
            )}
          </p>
          <p class="mt-3">
            ${msg(
              html`This will recover ${bytes} of storage space and rebuild the
              index using archived items currently in the deduplication source.`,
            )}
          </p>
        `;
      })}
      <div slot="footer" class="flex justify-between">
        <sl-button
          size="small"
          @click=${(e: MouseEvent) =>
            void (e.target as HTMLElement)
              .closest<Dialog>("btrix-dialog")
              ?.hide()}
          .autofocus=${true}
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          size="small"
          variant="warning"
          @click=${() => {
            if (!this.indexToClear) return;

            void this.clearIndex(this.indexToClear);
            this.indexToClear = undefined;
          }}
          >${msg("Yes, Clear Index")}</sl-button
        >
      </div>
    </btrix-dialog>`;
  }

  private renderDeleteConfirmation() {
    return html`<btrix-dialog
      label=${msg("Delete Index?")}
      ?open=${!!this.indexToDelete}
    >
      ${when(this.indexToDelete, (col) => {
        const collection_name = html`<strong class="font-semibold"
          >${col.name}</strong
        >`;
        return html`
          <p>
            ${msg(
              html`Are you sure you want to delete the deduplication index and
              disable deduplication for ${collection_name}?`,
            )}
          </p>
          <p class="mt-3">
            ${msg(
              "The index will only be deleted if there are not any workflows using this index as a deduplication source.",
            )}
          </p>
        `;
      })}
      <div slot="footer" class="flex justify-between">
        <sl-button
          size="small"
          @click=${(e: MouseEvent) =>
            void (e.target as HTMLElement)
              .closest<Dialog>("btrix-dialog")
              ?.hide()}
          .autofocus=${true}
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          size="small"
          variant="danger"
          @click=${() => {
            if (!this.indexToDelete) return;

            void this.deleteIndex(this.indexToDelete);
            this.indexToDelete = undefined;
          }}
          >${msg("Yes, Delete Index")}</sl-button
        >
      </div>
    </btrix-dialog>`;
  }

  private async clearIndex(source: DedupeSource) {
    console.log(source);
  }

  private async deleteIndex(source: DedupeSource) {
    console.log(source);
  }

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
