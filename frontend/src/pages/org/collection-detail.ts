import { localized, msg, str } from "@lit/localize";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { guard } from "lit/directives/guard.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { MarkdownEditor } from "@/components/ui/markdown-editor";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { SelectCollectionAccess } from "@/features/collections/select-collection-access";
import type {
  SelectVisibilityDetail,
  ShareCollection,
} from "@/features/collections/share-collection";
import { pageNav, type Breadcrumb } from "@/layouts/pageHeader";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import { CollectionAccess, type Collection } from "@/types/collection";
import type { ArchivedItem, Crawl, Upload } from "@/types/crawler";
import type { CrawlState } from "@/types/crawlState";
import { pluralOf } from "@/utils/pluralize";

const ABORT_REASON_THROTTLE = "throttled";
const INITIAL_ITEMS_PAGE_SIZE = 20;

export enum Tab {
  Replay = "replay",
  About = "about",
  Items = "items",
}

@localized()
@customElement("btrix-collection-detail")
export class CollectionDetail extends BtrixElement {
  @property({ type: String })
  collectionId!: string;

  @property({ type: String })
  collectionTab: Tab = Tab.Replay;

  @state()
  private collection?: Collection;

  @state()
  private archivedItems?: APIPaginatedList<ArchivedItem>;

  @state()
  private openDialogName?: "delete" | "editMetadata" | "editItems";

  @state()
  private isEditingDescription = false;

  @query("replay-web-page")
  private readonly replayEmbed?: ReplayWebPage | null;

  @query("btrix-share-collection")
  private readonly shareCollection?: ShareCollection | null;

  @query("btrix-markdown-editor")
  private readonly descriptionEditor?: MarkdownEditor | null;

  // Use to cancel requests
  private getArchivedItemsController: AbortController | null = null;

  private readonly tabLabels: Record<
    Tab,
    { icon: { name: string; library: string }; text: string }
  > = {
    [Tab.Replay]: {
      icon: { name: "replaywebpage", library: "app" },
      text: msg("Replay"),
    },
    [Tab.Items]: {
      icon: { name: "list-ul", library: "default" },
      text: msg("Archived Items"),
    },
    [Tab.About]: {
      icon: { name: "info-square-fill", library: "default" },
      text: msg("Description"),
    },
  };

  private get isCrawler() {
    return this.appState.isCrawler;
  }

  protected async willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (changedProperties.has("collectionId")) {
      void this.fetchCollection();
      void this.fetchArchivedItems({ page: 1 });
    }
  }

  render() {
    return html` <div class="mb-7">${this.renderBreadcrumbs()}</div>
      <header class="items-center gap-2 pb-3 md:flex">
        <div class="mb-2 flex w-full items-center gap-2 md:mb-0">
          <div class="flex size-8 items-center justify-center">
            ${choose(this.collection?.access, [
              [
                CollectionAccess.Private,
                () => html`
                  <sl-tooltip
                    content=${SelectCollectionAccess.Options[
                      CollectionAccess.Private
                    ].label}
                  >
                    <sl-icon
                      class="text-lg text-neutral-600"
                      name=${SelectCollectionAccess.Options[
                        CollectionAccess.Private
                      ].icon}
                    ></sl-icon>
                  </sl-tooltip>
                `,
              ],
              [
                CollectionAccess.Unlisted,
                () => html`
                  <sl-tooltip
                    content=${SelectCollectionAccess.Options[
                      CollectionAccess.Unlisted
                    ].label}
                  >
                    <sl-icon
                      class="text-lg text-neutral-600"
                      name=${SelectCollectionAccess.Options[
                        CollectionAccess.Unlisted
                      ].icon}
                    ></sl-icon>
                  </sl-tooltip>
                `,
              ],
              [
                CollectionAccess.Public,
                () => html`
                  <sl-tooltip
                    content=${SelectCollectionAccess.Options[
                      CollectionAccess.Public
                    ].label}
                  >
                    <sl-icon
                      class="text-lg text-success-600"
                      name=${SelectCollectionAccess.Options[
                        CollectionAccess.Public
                      ].icon}
                    ></sl-icon>
                  </sl-tooltip>
                `,
              ],
            ])}
          </div>
          <h1 class="min-w-0 flex-1 truncate text-xl font-semibold leading-7">
            ${this.collection?.name ||
            html`<sl-skeleton class="w-96"></sl-skeleton>`}
          </h1>
        </div>
        <btrix-share-collection
          collectionId=${this.collectionId}
          .collection=${this.collection}
          @btrix-select=${(e: CustomEvent<SelectVisibilityDetail>) => {
            e.stopPropagation();
            void this.updateVisibility(e.detail.item.value);
          }}
        ></btrix-share-collection>
        ${when(this.isCrawler, this.renderActions)}
      </header>
      <div class="rounded-lg border px-4 py-2">${this.renderInfoBar()}</div>
      <div
        class="sticky top-0 -mx-3 mb-3 flex items-center justify-between bg-white px-3 pt-3 shadow-lg shadow-white"
      >
        ${this.renderTabs()}
        ${when(this.isCrawler, () =>
          this.collectionTab === Tab.About
            ? this.isEditingDescription
              ? html`
                  <sl-button
                    variant="primary"
                    size="small"
                    @click=${() => void this.saveDescription()}
                    ?disabled=${!this.collection}
                  >
                    <sl-icon name="check-lg" slot="prefix"></sl-icon>
                    ${msg("Save")}
                  </sl-button>
                `
              : html`
                  <sl-button
                    size="small"
                    @click=${() => (this.isEditingDescription = true)}
                    ?disabled=${!this.collection}
                  >
                    <sl-icon name="pencil" slot="prefix"></sl-icon>
                    ${msg("Edit")}
                  </sl-button>
                `
            : html`
                <sl-button
                  size="small"
                  @click=${() => (this.openDialogName = "editItems")}
                  ?disabled=${!this.collection}
                >
                  <sl-icon name="ui-checks" slot="prefix"></sl-icon>
                  ${msg("Select Items")}
                </sl-button>
              `,
        )}
      </div>
      ${choose(this.collectionTab, [
        [Tab.Replay, () => guard([this.collection], this.renderReplay)],
        [
          Tab.Items,
          () => guard([this.archivedItems], this.renderArchivedItems),
        ],
        [Tab.About, () => this.renderDescription()],
      ])}

      <btrix-dialog
        .label=${msg("Delete Collection?")}
        .open=${this.openDialogName === "delete"}
        @sl-hide=${() => (this.openDialogName = undefined)}
      >
        ${msg(
          html`Are you sure you want to delete
            <strong>${this.collection?.name}</strong>?`,
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            @click=${() => (this.openDialogName = undefined)}
            >${msg("Cancel")}</sl-button
          >
          <sl-button
            size="small"
            variant="danger"
            @click=${async () => {
              await this.deleteCollection();
              this.openDialogName = undefined;
            }}
            >${msg("Delete Collection")}</sl-button
          >
        </div>
      </btrix-dialog>
      <btrix-collection-items-dialog
        collectionId=${this.collectionId}
        collectionName=${this.collection?.name || ""}
        ?isCrawler=${this.isCrawler}
        ?open=${this.openDialogName === "editItems"}
        @sl-hide=${() => (this.openDialogName = undefined)}
        @btrix-collection-saved=${() => {
          this.refreshReplay();
          void this.fetchCollection();
          void this.fetchArchivedItems();
        }}
      >
      </btrix-collection-items-dialog>
      ${when(
        this.collection,
        () => html`
          <btrix-collection-metadata-dialog
            .collection=${this.collection!}
            ?open=${this.openDialogName === "editMetadata"}
            @sl-hide=${() => (this.openDialogName = undefined)}
            @btrix-collection-saved=${() => {
              this.refreshReplay();
              void this.fetchCollection();
            }}
          >
          </btrix-collection-metadata-dialog>
        `,
      )}`;
  }

  private refreshReplay() {
    if (this.replayEmbed) {
      try {
        this.replayEmbed.fullReload();
      } catch (e) {
        console.warn("Full reload not available in RWP");
      }
    }
  }

  private readonly renderBreadcrumbs = () => {
    const breadcrumbs: Breadcrumb[] = [
      {
        href: `${this.navigate.orgBasePath}/collections`,
        content: msg("Collections"),
      },
      {
        content: this.collection?.name,
      },
    ];

    return pageNav(breadcrumbs);
  };

  private readonly renderTabs = () => {
    return html`
      <nav class="flex gap-2">
        ${Object.values(Tab).map((tabName) => {
          const isSelected = tabName === this.collectionTab;
          const tab = this.tabLabels[tabName];

          return html`
            <btrix-navigation-button
              .active=${isSelected}
              aria-selected="${isSelected}"
              href=${`${this.navigate.orgBasePath}/collections/view/${this.collectionId}/${tabName}`}
              @click=${this.navigate.link}
            >
              <sl-icon
                name=${tab.icon.name}
                library=${tab.icon.library}
              ></sl-icon>
              ${tab.text}</btrix-navigation-button
            >
          `;
        })}
      </nav>
    `;
  };

  private readonly renderActions = () => {
    const authToken = this.authState?.headers.Authorization.split(" ")[1];

    return html`
      <sl-dropdown distance="4">
        <sl-button slot="trigger" size="small" caret
          >${msg("Actions")}</sl-button
        >
        <sl-menu>
          <sl-menu-item @click=${() => (this.openDialogName = "editMetadata")}>
            <sl-icon name="gear" slot="prefix"></sl-icon>
            ${msg("Collection Settings")}
          </sl-menu-item>
          <sl-menu-item @click=${() => (this.openDialogName = "editItems")}>
            <sl-icon name="ui-checks" slot="prefix"></sl-icon>
            ${msg("Select Archived Items")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-item @click=${() => this.shareCollection?.show()}>
            <sl-icon slot="prefix" name="box-arrow-up"></sl-icon>
            ${msg("Share Collection")}
          </sl-menu-item>
          <btrix-menu-item-link
            href=${`/api/orgs/${this.orgId}/collections/${this.collectionId}/download?auth_bearer=${authToken}`}
            download
          >
            <sl-icon name="cloud-download" slot="prefix"></sl-icon>
            ${msg("Download Collection")}
          </btrix-menu-item-link>
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${this.confirmDelete}
          >
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${msg("Delete Collection")}
          </sl-menu-item>
        </sl-menu>
      </sl-dropdown>
    `;
  };

  private renderInfoBar() {
    return html`
      <btrix-desc-list horizontal>
        ${this.renderDetailItem(
          msg("Archived Items"),
          (col) =>
            `${this.localize.number(col.crawlCount)} ${pluralOf("items", col.crawlCount)}`,
        )}
        ${this.renderDetailItem(msg("Total Size"), (col) =>
          this.localize.bytes(col.totalSize || 0, {
            unitDisplay: "narrow",
          }),
        )}
        ${this.renderDetailItem(
          msg("Total Pages"),
          (col) =>
            `${this.localize.number(col.pageCount)} ${pluralOf("pages", col.pageCount)}`,
        )}
        ${this.renderDetailItem(
          msg("Last Updated"),
          (col) =>
            html`<btrix-format-date
              date=${col.modified}
              month="2-digit"
              day="2-digit"
              year="2-digit"
              hour="2-digit"
              minute="2-digit"
            ></btrix-format-date>`,
        )}
      </btrix-desc-list>
    `;
  }

  private renderDetailItem(
    label: string | TemplateResult,
    renderContent: (collection: Collection) => TemplateResult | string,
  ) {
    return html`
      <btrix-desc-list-item label=${label}>
        ${when(
          this.collection,
          () => renderContent(this.collection!),
          () => html`<sl-skeleton class="w-full"></sl-skeleton>`,
        )}
      </btrix-desc-list-item>
    `;
  }

  private renderDescription() {
    return html`
      <section>
        ${when(
          this.collection,
          (collection) =>
            this.isEditingDescription
              ? html`
                  <btrix-markdown-editor
                    initialValue=${collection.description || ""}
                    placeholder=${msg("Add a description...")}
                    maxlength=${4000}
                  ></btrix-markdown-editor>
                `
              : html`
                  <div class="rounded border p-6 leading-relaxed">
                    <btrix-markdown-viewer
                      value=${collection.description || ""}
                    ></btrix-markdown-viewer>
                  </div>
                `,
          () =>
            html`<div
              class="flex items-center justify-center rounded border py-10 text-3xl"
            >
              <sl-spinner></sl-spinner>
            </div>`,
        )}
      </section>
    `;
  }

  private readonly renderArchivedItems = () =>
    html`<section>
      ${when(
        this.archivedItems,
        () => {
          const { items, page, total, pageSize } = this.archivedItems!;
          const hasItems = items.length;
          return html`
            <section>
              ${hasItems
                ? this.renderArchivedItemsList()
                : this.renderEmptyState()}
            </section>
            ${when(
              hasItems || page > 1,
              () => html`
                <footer class="mt-6 flex justify-center">
                  <btrix-pagination
                    page=${page}
                    totalCount=${total}
                    size=${pageSize}
                    @page-change=${async (e: PageChangeEvent) => {
                      await this.fetchArchivedItems({
                        page: e.detail.page,
                      });

                      // Scroll to top of list
                      // TODO once deep-linking is implemented, scroll to top of pushstate
                      this.scrollIntoView({ behavior: "smooth" });
                    }}
                  ></btrix-pagination>
                </footer>
              `,
            )}
          `;
        },
        () => html`
          <div class="my-12 flex w-full items-center justify-center text-2xl">
            <sl-spinner></sl-spinner>
          </div>
        `,
      )}
    </section>`;

  private renderArchivedItemsList() {
    if (!this.archivedItems) return;

    return html`
      <btrix-archived-item-list>
        <btrix-table-header-cell slot="actionCell" class="p-0">
          <span class="sr-only">${msg("Row actions")}</span>
        </btrix-table-header-cell>
        ${repeat(
          this.archivedItems.items,
          ({ id }) => id,
          this.renderArchivedItem,
        )}
      </btrix-archived-item-list>
    `;
  }

  private renderEmptyState() {
    return html`
      <div class="rounded border px-3 py-12">
        <p class="text-center text-neutral-500">
          ${this.archivedItems?.page && this.archivedItems.page > 1
            ? msg("Page not found.")
            : html`
                ${msg("This Collection doesn’t have any archived items, yet.")}
                ${this.isCrawler &&
                html`
                  <div class="mt-3">
                    <sl-button
                      variant="primary"
                      @click=${() => (this.openDialogName = "editItems")}
                    >
                      <sl-icon name="ui-checks" slot="prefix"></sl-icon>
                      ${msg("Add Archived Items")}
                    </sl-button>
                  </div>
                `}
              `}
        </p>
      </div>
    `;
  }

  private readonly renderArchivedItem = (
    item: ArchivedItem,
    idx: number,
  ) => html`
    <btrix-archived-item-list-item
      href=${`${this.navigate.orgBasePath}/${item.type === "crawl" ? `workflows/${item.cid}/crawls` : `items/${item.type}`}/${item.id}?collectionId=${this.collectionId}`}
      .item=${item}
    >
      ${this.isCrawler
        ? html`
            <btrix-table-cell slot="actionCell" class="p-0">
              <btrix-overflow-dropdown
                @click=${(e: MouseEvent) => {
                  // Prevent navigation to detail view
                  e.preventDefault();
                  e.stopImmediatePropagation();
                }}
              >
                <sl-menu>
                  <sl-menu-item
                    style="--sl-color-neutral-700: var(--warning)"
                    @click=${() => void this.removeArchivedItem(item.id, idx)}
                  >
                    <sl-icon name="folder-minus" slot="prefix"></sl-icon>
                    ${msg("Remove from Collection")}
                  </sl-menu-item>
                </sl-menu>
              </btrix-overflow-dropdown>
            </btrix-table-cell>
          `
        : nothing}
    </btrix-archived-item-list-item>
  `;

  private readonly renderReplay = () => {
    if (!this.collection?.crawlCount) {
      return this.renderEmptyState();
    }

    const replaySource = `/api/orgs/${this.orgId}/collections/${this.collectionId}/replay.json`;
    const headers = this.authState?.headers;
    const config = JSON.stringify({ headers });

    return html`<section>
      <main>
        <div class="aspect-4/3 overflow-hidden rounded-lg border">
          <replay-web-page
            source=${replaySource}
            replayBase="/replay/"
            config="${config}"
            noSandbox="true"
            noCache="true"
          ></replay-web-page>
        </div>
      </main>
    </section>`;
  };

  private async updateVisibility(access: CollectionAccess) {
    const res = await this.api.fetch<{ updated: boolean }>(
      `/orgs/${this.orgId}/collections/${this.collectionId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ access }),
      },
    );

    if (res.updated) {
      this.notify.toast({
        message: msg("Collection visibility updated."),
        variant: "success",
        icon: "check2-circle",
      });

      if (this.collection) {
        this.collection = { ...this.collection, access };
      }
    }
  }

  private readonly confirmDelete = () => {
    this.openDialogName = "delete";
  };

  private async deleteCollection(): Promise<void> {
    if (!this.collection) return;

    try {
      const name = this.collection.name;
      const _data: Crawl | Upload = await this.api.fetch(
        `/orgs/${this.orgId}/collections/${this.collection.id}`,
        {
          method: "DELETE",
        },
      );

      this.navigate.to(`${this.navigate.orgBasePath}/collections`);

      this.notify.toast({
        message: msg(html`Deleted <strong>${name}</strong> Collection.`),
        variant: "success",
        icon: "check2-circle",
        id: "collection-delete-status",
      });
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't delete Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "collection-delete-status",
      });
    }
  }

  private async fetchCollection() {
    try {
      this.collection = await this.getCollection();
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "collection-retrieve-status",
      });
    }
  }

  private async getCollection() {
    const data = await this.api.fetch<Collection>(
      `/orgs/${this.orgId}/collections/${this.collectionId}/replay.json`,
    );

    return data;
  }

  /**
   * Fetch web captures and update internal state
   */
  private async fetchArchivedItems(params?: APIPaginationQuery): Promise<void> {
    this.cancelInProgressGetArchivedItems();
    try {
      this.archivedItems = await this.getArchivedItems(params);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        console.debug("Fetch web captures aborted to throttle");
      } else {
        this.notify.toast({
          message: msg("Sorry, couldn't retrieve web captures at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "collection-retrieve-status",
        });
      }
    }
  }

  private cancelInProgressGetArchivedItems() {
    if (this.getArchivedItemsController) {
      this.getArchivedItemsController.abort(ABORT_REASON_THROTTLE);
      this.getArchivedItemsController = null;
    }
  }

  private async getArchivedItems(
    params?: Partial<{
      state: CrawlState[];
    }> &
      APIPaginationQuery &
      APISortQuery,
  ) {
    const query = queryString.stringify(
      {
        ...params,
        page: params?.page || this.archivedItems?.page || 1,
        pageSize:
          params?.pageSize ||
          this.archivedItems?.pageSize ||
          INITIAL_ITEMS_PAGE_SIZE,
      },
      {
        arrayFormat: "comma",
      },
    );
    const data = await this.api.fetch<APIPaginatedList<Crawl | Upload>>(
      `/orgs/${this.orgId}/all-crawls?collectionId=${this.collectionId}&${query}`,
    );

    return data;
  }

  private async removeArchivedItem(id: string, _pageIndex: number) {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/collections/${this.collectionId}/remove`,
        {
          method: "POST",
          body: JSON.stringify({ crawlIds: [id] }),
        },
      );

      const { page, items } = this.archivedItems!;

      this.notify.toast({
        message: msg(str`Successfully removed item from Collection.`),
        variant: "success",
        icon: "check2-circle",
        id: "collection-item-remove-status",
      });
      void this.fetchCollection();
      void this.fetchArchivedItems({
        // Update page if last item
        page: items.length === 1 && page > 1 ? page - 1 : page,
      });
    } catch (e) {
      console.debug((e as Error | undefined)?.message);
      this.notify.toast({
        message: msg(
          "Sorry, couldn't remove item from Collection at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "collection-item-remove-status",
      });
    }
  }

  private async saveDescription() {
    if (!this.descriptionEditor?.checkValidity()) {
      // TODO
      return;
    }

    const description = this.descriptionEditor.value;

    try {
      await this.api.fetch<Collection>(
        `/orgs/${this.orgId}/collections/${this.collectionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            description,
          }),
        },
      );

      this.notify.toast({
        message: msg("Description updated."),
        variant: "success",
        icon: "check2-circle",
      });

      if (this.collection) {
        this.collection = {
          ...this.collection,
          description,
        };
      }
      this.isEditingDescription = false;

      void this.fetchCollection();
    } catch (err) {
      console.debug(err);

      this.notify.toast({
        message: msg(
          "Sorry, couldn't save collection description at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}
