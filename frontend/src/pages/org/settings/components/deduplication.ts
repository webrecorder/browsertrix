import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { loadingPanel } from "../templates/loading-panel";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { Tab } from "@/pages/org/collection-detail/types";
import { OrgTab } from "@/routes";
import { notApplicable } from "@/strings/ui";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { Collection } from "@/types/collection";
import type { DedupeIndexStats } from "@/types/dedupe";
import { isNotEqual } from "@/utils/is-not-equal";
import { pluralOf } from "@/utils/pluralize";

const INITIAL_PAGE_SIZE = 10;

@customElement("btrix-org-settings-deduplication")
@localized()
export class OrgSettingsDeduplication extends BtrixElement {
  @property({ type: Boolean })
  visible?: boolean;

  @state()
  private indexToClear?: Collection;

  @state()
  private indexToDelete?: Collection;

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

  private readonly renderTable = (sources: APIPaginatedList<Collection>) => {
    const dedupeStat = (
      source: Collection,
      render: (dedupe: DedupeIndexStats) => TemplateResult,
    ) => {
      if (source.indexStats) return render(source.indexStats);

      return html`<span class="text-neutral-400">${notApplicable}</span>`;
    };
    const detail = (content: TemplateResult | string) =>
      html`<div
        class="font-monostyle mt-1 text-xs leading-none text-neutral-500"
      >
        ${content}
      </div>`;

    return html`
      <btrix-overflow-scroll>
        <btrix-table
          class="whitespace-nowrap [--btrix-table-cell-padding-x:var(--sl-spacing-2x-small)]"
          style="--btrix-table-grid-template-columns: 40ch repeat(3, 1fr) min-content"
        >
          <btrix-table-head class="mb-2">
            <btrix-table-header-cell class="px-3">
              ${msg("Name")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Indexed URLs")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Indexed Items")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Purgeable Items")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Actions")}
            </btrix-table-header-cell>
          </btrix-table-head>
          <btrix-table-body
            class="divide-y rounded border [--btrix-table-cell-padding-y:var(--sl-spacing-x-small)] *:first:border-t-0 *:last:rounded-b"
          >
            ${sources.items.map(
              (item) => html`
                <btrix-table-row>
                  <btrix-table-cell class="px-3">
                    <div class="overflow-hidden">
                      <div class="truncate">${item.name}</div>
                      ${detail(html`
                        <span class="inline-flex items-center">
                          <sl-icon name="collection" class="mr-1.5"></sl-icon>
                          ${msg("Collection")}
                        </span>
                      `)}
                    </div>
                  </btrix-table-cell>
                  <btrix-table-cell>
                    ${dedupeStat(
                      item,
                      (dedupe) => html`
                        <div>
                          ${this.localize.number(dedupe.totalUrls)}
                          ${pluralOf("URLs", dedupe.totalUrls)}
                          ${detail(
                            `${this.localize.number(dedupe.uniqueUrls)} ${msg("unique")}`,
                          )}
                        </div>
                      `,
                    )}
                  </btrix-table-cell>
                  <btrix-table-cell>
                    ${dedupeStat(
                      item,
                      (dedupe) => html`
                        <div>
                          ${this.localize.number(dedupe.totalCrawls)}
                          ${pluralOf("items", dedupe.totalCrawls)}
                          ${detail(this.localize.bytes(dedupe.totalSize))}
                        </div>
                      `,
                    )}
                  </btrix-table-cell>
                  <btrix-table-cell>
                    ${dedupeStat(
                      item,
                      (dedupe) => html`
                        ${this.localize.number(dedupe.removableCrawls)}
                        ${pluralOf("items", dedupe.removableCrawls)}
                      `,
                    )}
                  </btrix-table-cell>
                  <btrix-table-cell>
                    <sl-tooltip
                      content=${msg("Open in New Tab")}
                      placement="left"
                    >
                      <sl-icon-button
                        name="arrow-up-right"
                        href="${this.navigate
                          .orgBasePath}/${OrgTab.Collections}/view/${item.id}/${Tab.Deduplication}"
                        target="_blank"
                      >
                      </sl-icon-button>
                    </sl-tooltip>
                    <btrix-overflow-dropdown>
                      <sl-menu>
                        <btrix-menu-item-link
                          href="${this.navigate
                            .orgBasePath}/${OrgTab.Collections}/view/${item.id}"
                        >
                          <sl-icon
                            name="arrow-return-right"
                            slot="prefix"
                          ></sl-icon>
                          ${msg("Go to Collection")}
                        </btrix-menu-item-link>
                        <sl-divider></sl-divider>
                        <sl-menu-item
                          class="menu-item-warning"
                          @click=${() => (this.indexToClear = item)}
                        >
                          <sl-icon slot="prefix" name="arrow-repeat"></sl-icon>
                          ${msg("Reset Index")}
                        </sl-menu-item>
                        <sl-menu-item
                          class="menu-item-danger"
                          @click=${() => (this.indexToDelete = item)}
                        >
                          <sl-icon slot="prefix" name="trash3"></sl-icon>
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
      label=${msg("Reset Index?")}
      ?open=${!!this.indexToClear}
    >
      ${when(this.indexToClear, (col) => {
        const collection_name = html`<strong class="font-semibold"
          >${col.name}</strong
        >`;

        return html`
          <p>
            ${msg(
              html`Are you sure you want to reset the deduplication index for
              ${collection_name}?`,
            )}
          </p>
          <p class="mt-3">
            ${msg(
              "This will clear the index of purgeable archived items and rebuild the index using items currently in the deduplication source.",
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
          >${msg("Reset Index")}</sl-button
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
              html`Are you sure you want to delete the deduplication index for
              ${collection_name}?`,
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
          >${msg("Delete Index")}</sl-button
        >
      </div>
    </btrix-dialog>`;
  }

  private async clearIndex(source: Collection) {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/collections/${source.id}/purgeDedupeIndex`,
        {
          method: "POST",
        },
      );

      this.notify.toast({
        message: msg("Reset deduplication index."),
        variant: "success",
        icon: "check2-circle",
        id: "dedupe-index-update-status",
      });
    } catch (err) {
      console.debug(err);

      this.notify.toast({
        message: msg("Sorry, couldn't reset index at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "dedupe-index-update-status",
      });
    }
  }

  private async deleteIndex(source: Collection) {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/collections/${source.id}/dedupe`,
        {
          method: "DELETE",
        },
      );

      this.notify.toast({
        message: msg("Deleted deduplication index."),
        variant: "success",
        icon: "check2-circle",
        id: "dedupe-index-update-status",
      });
    } catch (err) {
      console.debug(err);

      this.notify.toast({
        message: msg("Sorry, couldn't delete index at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "dedupe-index-update-status",
      });
    }
  }

  private async getCollections(
    params: APIPaginationQuery,
    signal: AbortSignal,
  ) {
    const query = queryString.stringify({
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
