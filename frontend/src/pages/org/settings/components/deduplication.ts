import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";
import type { RequireExactlyOne } from "type-fest";

import { loadingPanel } from "../templates/loading-panel";

import { BtrixElement } from "@/classes/BtrixElement";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { deleteIndexDialog } from "@/features/collections/templates/delete-index-dialog";
import { indexStatus } from "@/features/collections/templates/index-status";
import { purgeIndexDialog } from "@/features/collections/templates/purge-index-dialog";
import { emptyMessage } from "@/layouts/emptyMessage";
import { labelWithIcon } from "@/layouts/labelWithIcon";
import { panelBody } from "@/layouts/panel";
import { Tab } from "@/pages/org/collection-detail/types";
import { OrgTab } from "@/routes";
import { getIndexErrorMessage } from "@/strings/collections/index-error";
import { noData } from "@/strings/ui";
import { type APIPaginatedList, type APIPaginationQuery } from "@/types/api";
import type { Collection } from "@/types/collection";
import { indexAvailable } from "@/utils/dedupe";
import { isNotEqual } from "@/utils/is-not-equal";
import { pluralOf } from "@/utils/pluralize";

const INITIAL_PAGE_SIZE = 10;

type DedupeSource = RequireExactlyOne<Collection, "indexStats">;

const detail = (content?: TemplateResult | string) =>
  html`<div class="font-monostyle mt-1 text-xs leading-none text-neutral-500">
    ${content || noData}
  </div>`;

@customElement("btrix-org-settings-deduplication")
@localized()
export class OrgSettingsDeduplication extends BtrixElement {
  @property({ type: Boolean })
  visible?: boolean;

  @state()
  private openDialog?: "purge" | "delete";

  @state()
  private selectedIndex?: DedupeSource;

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
      ${purgeIndexDialog({
        collection: this.selectedIndex,
        open: this.openDialog === "purge",
        hide: this.hideDialog,
        confirm: async () =>
          this.selectedIndex
            ? this.purgeIndex(this.selectedIndex)
            : console.debug("missing `selectedIndex`"),
      })}
      ${deleteIndexDialog({
        collection: this.selectedIndex,
        open: this.openDialog === "delete",
        hide: this.hideDialog,
        confirm: async (params) =>
          this.selectedIndex
            ? this.deleteIndex(this.selectedIndex, params)
            : console.debug("missing `selectedIndex`"),
      })}
    `;
  }

  private readonly hideDialog = () => (this.openDialog = undefined);

  private readonly renderTable = (sources: APIPaginatedList<DedupeSource>) => {
    if (!sources.total) {
      return panelBody({
        content: emptyMessage({
          message: msg("No deduplication sources found."),
        }),
      });
    }

    return html`
      <btrix-overflow-scroll>
        <btrix-table
          class="whitespace-nowrap [--btrix-table-cell-padding-x:var(--sl-spacing-2x-small)]"
          style="--btrix-table-grid-template-columns: 40ch repeat(4, 1fr) min-content"
        >
          <btrix-table-head class="mb-2">
            <btrix-table-header-cell class="px-3">
              ${msg("Name")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Status")}
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
            ${sources.items.map(this.renderSource)}
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

  private readonly renderSource = (item: DedupeSource) => {
    const { indexStats, indexState } = item;
    const updating =
      indexStats.updateProgress > 0 && indexStats.updateProgress < 1;
    const available = indexAvailable(indexState);

    return html`
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
        <btrix-table-cell class="text-base">
          ${updating
            ? labelWithIcon({
                icon: html`<sl-progress-ring
                  class="[--indicator-width:2px] [--size:1rem] [--track-width:1px]"
                  value=${indexStats.updateProgress * 100}
                ></sl-progress-ring>`,
                label: `${(indexStats.updateProgress * 100).toFixed(0)}% ${indexState === "purging" ? msg("Purged") : msg("Imported")}`,
              })
            : indexStatus(indexState)}
        </btrix-table-cell>
        <btrix-table-cell>
          <div>
            ${this.localize.number(indexStats.totalUrls)}
            ${pluralOf("URLs", indexStats.totalUrls)}
            ${detail(
              indexStats.dupeUrls
                ? `${this.localize.number(indexStats.dupeUrls, {
                    notation: "compact",
                  })} ${msg("duplicate")}`
                : undefined,
            )}
          </div>
        </btrix-table-cell>
        <btrix-table-cell>
          <div>
            ${this.localize.number(indexStats.totalCrawls)}
            ${pluralOf("items", indexStats.totalCrawls)}
            ${detail(
              indexStats.totalCrawlSize
                ? this.localize.bytes(indexStats.totalCrawlSize)
                : undefined,
            )}
          </div>
        </btrix-table-cell>
        <btrix-table-cell>
          <div>
            ${this.localize.number(indexStats.removedCrawls)}
            ${pluralOf("items", indexStats.removedCrawls)}
            ${detail(
              indexStats.removedCrawlSize
                ? this.localize.bytes(indexStats.removedCrawlSize)
                : undefined,
            )}
          </div>
        </btrix-table-cell>
        <btrix-table-cell>
          <sl-tooltip content=${msg("Open in New Tab")} placement="left">
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
                <sl-icon name="arrow-return-right" slot="prefix"></sl-icon>
                ${msg("Go to Collection")}
              </btrix-menu-item-link>
              <sl-divider></sl-divider>
              <sl-menu-item
                class="menu-item-warning"
                @click=${() => {
                  this.selectedIndex = item;
                  this.openDialog = "purge";
                }}
                ?disabled=${!available}
              >
                <sl-icon slot="prefix" name="trash2"></sl-icon>
                ${msg("Purge Index")}
              </sl-menu-item>
              <sl-menu-item
                class="menu-item-danger"
                @click=${() => {
                  this.selectedIndex = item;
                  this.openDialog = "delete";
                }}
              >
                <sl-icon slot="prefix" name="trash3"></sl-icon>
                ${msg("Delete Index")}
              </sl-menu-item>
            </sl-menu>
          </btrix-overflow-dropdown>
        </btrix-table-cell>
      </btrix-table-row>
    `;
  };

  private async purgeIndex(source: Collection) {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/collections/${source.id}/dedupeIndex/purge`,
        {
          method: "POST",
        },
      );
      await this.sources.run();

      this.notify.toast({
        message: msg("Purging deduplication index..."),
        variant: "success",
        icon: "check2-circle",
        id: "dedupe-index-update-status",
      });
    } catch (err) {
      const message =
        getIndexErrorMessage(err) ||
        msg("Sorry, couldn’t purge index at this time.");

      this.notify.toast({
        message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "dedupe-index-update-status",
      });
    }
  }

  private async deleteIndex(
    source: Collection,
    params: { removeFromWorkflows: boolean },
  ) {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/collections/${source.id}/dedupeIndex/delete`,
        {
          method: "POST",
          body: JSON.stringify(params),
        },
      );
      await this.sources.run();

      this.notify.toast({
        message: msg("Deleted deduplication index."),
        variant: "success",
        icon: "check2-circle",
        id: "dedupe-index-update-status",
      });
    } catch (err) {
      const message =
        getIndexErrorMessage(err) ||
        msg("Sorry, couldn’t delete index at this time.");

      this.notify.toast({
        message,
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
    return this.api.fetch<APIPaginatedList<DedupeSource>>(
      `/orgs/${this.orgId}/collections?${query}`,
      {
        signal,
      },
    );
  }
}
