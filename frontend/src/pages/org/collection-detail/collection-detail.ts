import { consume } from "@lit/context";
import { localized, msg, str } from "@lit/localize";
import clsx from "clsx";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { guard } from "lit/directives/guard.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";
import type { Embed as ReplayWebPage } from "replaywebpage";

import {
  CollectionSearchParam,
  EditingSearchParamValue,
  Tab,
  type Dialog,
  type OpenDialogEventDetail,
} from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import type { MarkdownEditor } from "@/components/ui/markdown-editor";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { viewStateContext, type ViewStateContext } from "@/context/view-state";
import { ClipboardController } from "@/controllers/clipboard";
import { SearchParamsValue } from "@/controllers/searchParamsValue";
import type { EditDialogTab } from "@/features/collections/collection-edit-dialog";
import { collectionShareLink } from "@/features/collections/helpers/share-link";
import { SelectCollectionAccess } from "@/features/collections/select-collection-access";
import type { ShareCollection } from "@/features/collections/share-collection";
import { createIndexDialog } from "@/features/collections/templates/create-index-dialog";
import { deleteIndexDialog } from "@/features/collections/templates/delete-index-dialog";
import { purgeIndexDialog } from "@/features/collections/templates/purge-index-dialog";
import {
  metadataColumn,
  metadataItemWithCollection,
} from "@/layouts/collections/metadataColumn";
import { emptyMessage } from "@/layouts/emptyMessage";
import { pageNav, pageTitle, type Breadcrumb } from "@/layouts/pageHeader";
import { panelBody, panelHeader } from "@/layouts/panel";
import { getIndexErrorMessage } from "@/strings/collections/index-error";
import {
  type APIPaginatedList,
  type APIPaginationQuery,
  type APISortQuery,
} from "@/types/api";
import {
  CollectionAccess,
  type Collection,
  type PublicCollection,
} from "@/types/collection";
import type { ArchivedItem, Crawl, Upload } from "@/types/crawler";
import type { CrawlState } from "@/types/crawlState";
import type { DedupeIndexState } from "@/types/dedupe";
import { isCrawlReplay, renderName } from "@/utils/crawler";
import { indexAvailable, indexInUse, indexUpdating } from "@/utils/dedupe";
import { pluralOf } from "@/utils/pluralize";
import { formatRwpTimestamp } from "@/utils/replay";
import { richText } from "@/utils/rich-text";
import { tw } from "@/utils/tailwind";

const ABORT_REASON_THROTTLE = "throttled";
const INITIAL_ITEMS_PAGE_SIZE = 20;

@customElement("btrix-collection-detail")
@localized()
export class CollectionDetail extends BtrixElement {
  @property({ type: String })
  collectionId!: string;

  @property({ type: String })
  collectionTab: Tab | null = Tab.Replay;

  @state()
  private collection?: Collection;

  @state()
  private archivedItems?: APIPaginatedList<ArchivedItem>;

  @state()
  private openDialogName?: Dialog;

  @state()
  private itemToRemove?: ArchivedItem;

  @state()
  private editTab?: EditDialogTab;

  @state()
  private isEditingDescription = false;

  @state()
  private isRwpLoaded = false;

  @state()
  private rwpDoFullReload = false;

  @consume({ context: viewStateContext })
  viewState?: ViewStateContext;

  @query("replay-web-page")
  private readonly replayEmbed?: ReplayWebPage | null;

  @query("btrix-share-collection")
  private readonly shareCollection?: ShareCollection | null;

  @query("btrix-markdown-editor")
  private readonly descriptionEditor?: MarkdownEditor | null;

  // Use to cancel requests
  private getArchivedItemsController: AbortController | null = null;

  private readonly editing =
    new SearchParamsValue<EditingSearchParamValue | null>(
      this,
      (value, params) => {
        if (value === EditingSearchParamValue.Items) {
          params.set(CollectionSearchParam.Editing, value);
        } else {
          params.delete(CollectionSearchParam.Editing);
        }
        return params;
      },
      (params) => {
        return params.get(CollectionSearchParam.Editing) ===
          EditingSearchParamValue.Items
          ? EditingSearchParamValue.Items
          : null;
      },
    );

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
      text: msg("About"),
    },
    [Tab.Deduplication]: {
      icon: { name: "stack", library: "default" },
      text: msg("Deduplication"),
    },
  };

  private get shareLink() {
    return collectionShareLink(
      this.collection,
      this.orgSlugState,
      this.viewState?.params.slug || "",
    );
  }

  private get isCrawler() {
    return this.appState.isCrawler;
  }

  protected async willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (changedProperties.has("collectionId")) {
      void this.fetchCollection();
      void this.fetchArchivedItems({
        page: parsePage(new URLSearchParams(location.search).get("page")),
      });
    }
    if (changedProperties.has("collectionTab")) {
      if (this.collectionTab === null) {
        this.collectionTab = Tab.Replay;
      }

      if (this.collectionTab === Tab.Deduplication) {
        // Get latest stats
        void this.fetchCollection();
      }
    }
  }

  protected async updated(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (
      changedProperties.has("isEditingDescription") &&
      this.isEditingDescription
    ) {
      if (this.descriptionEditor) {
        // FIXME Focus on editor ready instead of timeout
        window.setTimeout(() => {
          this.descriptionEditor && void this.descriptionEditor.focus();
        }, 200);
      }
    }
  }

  render() {
    const collection_name = html`<strong class="font-semibold"
      >${this.collection?.name}</strong
    >`;

    return html`
      <div class="mb-7 flex justify-between align-baseline">
        ${this.renderBreadcrumbs()}
        ${this.collection &&
        (this.collection.access === CollectionAccess.Unlisted ||
          this.collection.access === CollectionAccess.Public)
          ? html`
              <sl-button
                href=${this.shareLink}
                size="small"
                variant="text"
                class="-mx-3 -mb-3.5 -mt-1.5"
              >
                <sl-icon
                  slot="prefix"
                  name=${this.collection.access === CollectionAccess.Unlisted
                    ? SelectCollectionAccess.Options.unlisted.icon
                    : SelectCollectionAccess.Options.public.icon}
                ></sl-icon>
                ${this.collection.access === CollectionAccess.Unlisted
                  ? msg("Go to Unlisted Page")
                  : msg("Go to Public Page")}
              </sl-button>
            `
          : nothing}
      </div>
      <header class="mt-5 flex min-h-16 flex-col gap-3  lg:flex-row">
        <div
          class="-mb-1 -ml-2 -mr-1 -mt-1 flex flex-none flex-col gap-2 self-start rounded-lg pb-1 pl-2 pr-1 pt-1 transition-colors has-[.addSummary:hover]:bg-primary-50 has-[sl-icon-button:hover]:bg-primary-50"
        >
          <div class="flex flex-wrap items-center gap-2.5">
            ${this.renderAccessIcon()}${pageTitle(
              this.collection?.name,
              tw`mb-2 h-6 w-60`,
            )}
            ${this.collection &&
            html`<sl-icon-button
              name="pencil"
              aria-label=${msg("Edit Collection Name and Description")}
              @click=${() => {
                this.openDialogName = "edit";
                this.editTab = "general";
              }}
            ></sl-icon-button>`}
          </div>
          ${this.collection
            ? this.collection.caption
              ? html`<div class="text-pretty text-neutral-600">
                  ${richText(this.collection.caption)}
                </div>`
              : html`<div
                  class="addSummary text-pretty rounded-md px-1 font-light text-neutral-500"
                  role="button"
                  @click=${() => {
                    this.openDialogName = "edit";
                    this.editTab = "general";
                  }}
                >
                  ${msg("Add a summary...")}
                </div>`
            : html`<sl-skeleton></sl-skeleton>`}
        </div>

        <div class="ml-auto flex flex-shrink-0 items-center gap-2">
          <btrix-share-collection
            orgSlug=${this.orgSlugState || ""}
            collectionId=${this.collectionId}
            .collection=${this.collection}
            context="private"
            @btrix-change=${(e: CustomEvent) => {
              e.stopPropagation();
              void this.fetchCollection();
            }}
          ></btrix-share-collection>
          ${when(this.isCrawler, this.renderActions)}
        </div>
      </header>

      <div
        class="mt-3 rounded-lg border px-4 py-2"
        aria-busy="${
          // TODO Switch to task and use task status
          this.collection === undefined
        }"
      >
        ${this.renderInfoBar()}
      </div>
      <div class="flex items-center justify-between py-3">
        ${this.renderTabs()}
        ${when(this.isCrawler, () =>
          choose(this.collectionTab, [
            [
              Tab.Replay,
              () =>
                this.collection?.crawlCount
                  ? html`
                      <sl-button
                        size="small"
                        @click=${() => {
                          this.openDialogName = "replaySettings";
                        }}
                        title=${ifDefined(
                          this.isRwpLoaded
                            ? undefined
                            : msg("Please wait for replay load"),
                        )}
                        ?disabled=${!this.isRwpLoaded}
                      >
                        ${this.isRwpLoaded
                          ? html`<sl-icon name="house" slot="prefix"></sl-icon>`
                          : html`<sl-spinner slot="prefix"></sl-spinner>`}
                        ${msg("Set Initial View")}
                      </sl-button>
                    `
                  : nothing,
            ],
            [
              Tab.Items,
              () => html`
                <sl-button
                  size="small"
                  @click=${() =>
                    this.editing.setValue(EditingSearchParamValue.Items)}
                  ?disabled=${!this.collection}
                >
                  <sl-icon name="ui-checks" slot="prefix"></sl-icon>
                  ${msg("Configure Items")}
                </sl-button>
              `,
            ],
          ]),
        )}
      </div>
      ${choose(this.collectionTab, [
        [Tab.Replay, () => guard([this.collection], this.renderReplay)],
        [
          Tab.Items,
          () => guard([this.archivedItems], this.renderArchivedItems),
        ],
        [Tab.About, () => this.renderAbout()],
        [
          Tab.Deduplication,
          () =>
            html`<btrix-collection-detail-dedupe
              .collectionId=${this.collectionId}
              .collection=${this.collection}
              @btrix-open-dialog=${(e: CustomEvent<OpenDialogEventDetail>) => {
                if (e.detail === "editItems") {
                  this.editing.setValue(EditingSearchParamValue.Items);
                } else {
                  this.openDialogName = e.detail;
                }
              }}
              @btrix-request-update=${() => void this.fetchCollection()}
            >
              ${when(
                this.appState.isAdmin,
                () =>
                  html`<btrix-overflow-dropdown
                    slot="actions"
                    placement="bottom-end"
                  >
                    <sl-menu>${this.renderDedupeMenuItems()}</sl-menu>
                  </btrix-overflow-dropdown>`,
              )}
            </btrix-collection-detail-dedupe> `,
        ],
      ])}

      <btrix-dialog
        .label=${msg("Remove Dependency from Collection?")}
        .open=${this.openDialogName === "removeItem"}
        @sl-hide=${() => (this.openDialogName = undefined)}
        @sl-after-hide=${() => (this.itemToRemove = undefined)}
      >
        ${when(this.itemToRemove, (item) => {
          const archived_item_name = html`<strong class="font-semibold"
            >${renderName(item)}</strong
          >`;
          const dependenciesCount =
            isCrawlReplay(item) && item.requiredByCrawls.length;

          return html`
            <p>
              ${msg(
                html`Are you sure you want to remove ${archived_item_name} from
                this collection?`,
              )}
            </p>
            ${when(dependenciesCount, (count) => {
              const number_of_items = this.localize.number(count);
              const plural_of_items = pluralOf("items", count);

              return html`
                <p class="my-2">
                  ${msg(
                    str`${number_of_items} ${plural_of_items} depend on this
                    item.`,
                  )}
                </p>
              `;
            })}
            <p class="mt-2">
              ${msg(
                "Removing this item may result in incomplete replay and downloads until dependent URLs are crawled again.",
              )}
            </p>
          `;
        })}

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
              if (this.itemToRemove) {
                await this.removeArchivedItem(this.itemToRemove.id);
              }

              this.openDialogName = undefined;
            }}
            >${msg("Remove Item")}</sl-button
          >
        </div>
      </btrix-dialog>

      <btrix-dialog
        .label=${this.collection?.indexStats
          ? msg("Deletion Not Allowed")
          : msg("Delete Collection?")}
        .open=${this.openDialogName === "delete"}
        @sl-hide=${() => (this.openDialogName = undefined)}
      >
        ${when(this.collection, (col) =>
          col.indexStats
            ? html`${msg(
                  html`${collection_name} cannot be deleted because it is being
                  used as a deduplication source.`,
                )}
                ${this.appState.isAdmin
                  ? msg(
                      "To delete this collection, delete the deduplication index first.",
                    )
                  : nothing}
                <div slot="footer" class="flex justify-end">
                  <sl-button
                    size="small"
                    @click=${() => {
                      this.openDialogName = undefined;
                    }}
                    >${msg("Close")}</sl-button
                  >
                </div>`
            : html`${msg(
                  html`Are you sure you want to delete ${collection_name}?`,
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
                </div>`,
        )}
      </btrix-dialog>
      <btrix-collection-items-dialog
        collectionId=${this.collectionId}
        collectionName=${this.collection?.name || ""}
        ?isCrawler=${this.isCrawler}
        ?open=${Boolean(
          this.editing.value === EditingSearchParamValue.Items &&
            this.collection,
        )}
        @sl-hide=${() => this.editing.setValue(null)}
        @btrix-collection-saved=${() => {
          this.refreshReplay();
          void this.fetchCollection();
          void this.fetchArchivedItems();
        }}
      >
      </btrix-collection-items-dialog>

      <btrix-collection-initial-view-dialog
        ?open=${this.openDialogName === "replaySettings"}
        @btrix-change=${() => {
          // Don't do full refresh of rwp so that rwp-url-change fires
          this.isRwpLoaded = false;

          void this.fetchCollection();
        }}
        @sl-hide=${async () => (this.openDialogName = undefined)}
        collectionId=${this.collectionId}
        .collection=${this.collection}
        ?replayLoaded=${this.isRwpLoaded}
      >
      </btrix-collection-initial-view-dialog>

      <btrix-collection-edit-dialog
        .collection=${this.collection}
        .tab=${this.editTab ?? "general"}
        ?open=${this.openDialogName === "edit"}
        @sl-hide=${() => (this.openDialogName = undefined)}
        @btrix-collection-saved=${() => {
          this.refreshReplay();
          // TODO maybe we can return the updated collection from the update endpoint, and avoid an extra fetch?
          void this.fetchCollection();
        }}
        @btrix-change=${() => {
          // Don't do full refresh of rwp so that rwp-url-change fires
          this.isRwpLoaded = false;

          void this.fetchCollection();
        }}
        .replayWebPage=${this.replayEmbed}
        ?replayLoaded=${this.isRwpLoaded}
      ></btrix-collection-edit-dialog>

      ${createIndexDialog({
        open: this.openDialogName === "createIndex",
        collection: this.collection,
        hide: () => (this.openDialogName = undefined),
        confirm: async () => this.createIndex(),
      })}
      ${purgeIndexDialog({
        open: this.openDialogName === "purgeIndex",
        collection: this.collection,
        hide: () => (this.openDialogName = undefined),
        confirm: async () => this.purgeIndex(),
      })}
      ${deleteIndexDialog({
        open: this.openDialogName === "deleteIndex",
        collection: this.collection,
        hide: () => (this.openDialogName = undefined),
        confirm: async (args) => this.deleteIndex(args),
      })}
    `;
  }

  private renderAccessIcon() {
    return choose(this.collection?.access, [
      [
        CollectionAccess.Private,
        () => html`
          <sl-tooltip
            content=${SelectCollectionAccess.Options[CollectionAccess.Private]
              .label}
          >
            <sl-icon
              class="text-lg text-neutral-600"
              name=${SelectCollectionAccess.Options[CollectionAccess.Private]
                .icon}
            ></sl-icon>
          </sl-tooltip>
        `,
      ],
      [
        CollectionAccess.Unlisted,
        () => html`
          <sl-tooltip
            content=${SelectCollectionAccess.Options[CollectionAccess.Unlisted]
              .label}
          >
            <sl-icon
              class="text-lg text-neutral-600"
              name=${SelectCollectionAccess.Options[CollectionAccess.Unlisted]
                .icon}
            ></sl-icon>
          </sl-tooltip>
        `,
      ],
      [
        CollectionAccess.Public,
        () => html`
          <sl-tooltip
            content=${SelectCollectionAccess.Options[CollectionAccess.Public]
              .label}
          >
            <sl-icon
              class="text-lg text-success-600"
              name=${SelectCollectionAccess.Options[CollectionAccess.Public]
                .icon}
            ></sl-icon>
          </sl-tooltip>
        `,
      ],
    ]);
  }

  private refreshReplay() {
    if (this.replayEmbed) {
      try {
        this.replayEmbed.fullReload();
      } catch (e) {
        console.warn("Full reload not available in RWP");
      }
    } else {
      this.rwpDoFullReload = true;
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
      <sl-tooltip content=${msg("Edit Collection Settings")}>
        <sl-icon-button
          name="gear"
          @click=${() => {
            this.openDialogName = "edit";
            this.editTab = "general";
          }}
        >
          <sl-icon slot="prefix"></sl-icon>
        </sl-icon-button>
      </sl-tooltip>
      <sl-dropdown distance="4">
        <sl-button slot="trigger" size="small" caret
          >${msg("Actions")}</sl-button
        >
        <sl-menu>
          <sl-menu-item
            @click=${async () => {
              // replay-web-page needs to be available in order to configure start page
              if (this.collectionTab !== Tab.Replay) {
                this.navigate.to(
                  `${this.navigate.orgBasePath}/collections/view/${this.collectionId}/${Tab.Replay}`,
                );
                await this.updateComplete;
              }

              this.openDialogName = "edit";
            }}
          >
            <sl-icon name="gear" slot="prefix"></sl-icon>
            ${msg("Edit Collection Settings")}
          </sl-menu-item>
          ${when(
            this.collection?.crawlCount,
            () => html`
              <sl-menu-item
                @click=${() => {
                  this.openDialogName = "replaySettings";
                }}
                ?disabled=${!this.isRwpLoaded}
              >
                ${this.isRwpLoaded
                  ? html`<sl-icon name="house" slot="prefix"></sl-icon>`
                  : html`<sl-spinner slot="prefix"></sl-spinner>`}
                ${msg("Set Initial View")}
              </sl-menu-item>
            `,
          )}
          <sl-menu-item
            @click=${async () => {
              this.navigate.to(
                `${this.navigate.orgBasePath}/collections/view/${this.collectionId}/${Tab.About}`,
              );
              this.isEditingDescription = true;
              await this.updateComplete;
              await this.descriptionEditor?.updateComplete;
              void this.descriptionEditor?.focus();
            }}
          >
            <sl-icon name="pencil" slot="prefix"></sl-icon>
            ${msg("Edit Description")}
          </sl-menu-item>
          <sl-menu-item
            @click=${() => this.editing.setValue(EditingSearchParamValue.Items)}
          >
            <sl-icon name="ui-checks" slot="prefix"></sl-icon>
            ${msg("Configure Items")}
          </sl-menu-item>
          ${this.appState.isAdmin
            ? html`<sl-menu-item>
                <sl-icon name="stack" slot="prefix"></sl-icon>
                ${msg("Deduplication Settings")}
                <sl-menu slot="submenu">
                  ${this.renderDedupeMenuItems()}
                </sl-menu>
              </sl-menu-item>`
            : when(
                this.isCrawler &&
                  this.collection &&
                  !this.collection.indexStats,
                () =>
                  html`<sl-menu-item
                    class="menu-item-success"
                    @click=${() => (this.openDialogName = "createIndex")}
                  >
                    <sl-icon slot="prefix" name="table"></sl-icon>
                    ${msg("Create Index")}
                  </sl-menu-item>`,
              )}
          <sl-divider></sl-divider>
          ${when(
            this.collection?.totalSize,
            (size) => html`
              <btrix-menu-item-link
                href=${`/api/orgs/${this.orgId}/collections/${this.collectionId}/download?auth_bearer=${authToken}`}
                download
                ?disabled=${!this.collection?.totalSize}
              >
                <sl-icon name="cloud-download" slot="prefix"></sl-icon>
                ${msg("Download Collection")}
                <btrix-badge slot="suffix"
                  >${this.localize.bytes(size)}</btrix-badge
                >
              </btrix-menu-item-link>
              <sl-divider></sl-divider>
            `,
          )}
          <sl-menu-item
            @click=${() =>
              ClipboardController.copyToClipboard(
                this.collection?.id ?? this.collectionId,
              )}
          >
            <sl-icon name="copy" slot="prefix"></sl-icon>
            ${msg("Copy Collection ID")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-item class="menu-item-danger" @click=${this.confirmDelete}>
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${msg("Delete Collection")}
          </sl-menu-item>
        </sl-menu>
      </sl-dropdown>
    `;
  };

  private renderDedupeMenuItems() {
    if (!this.collection) return;

    if (this.collection.indexStats) {
      const purgeMenuItem = (indexState: DedupeIndexState) => {
        const available = indexAvailable(indexState);
        const pending = indexInUse(indexState) || indexUpdating(indexState);

        return html`
          <sl-menu-item
            class="menu-item-warning"
            ?disabled=${!available}
            title=${ifDefined(
              pending ? msg("Please wait for pending update") : undefined,
            )}
            @click=${() => (this.openDialogName = "purgeIndex")}
          >
            ${pending
              ? html`<sl-spinner slot="prefix"></sl-spinner>`
              : html`<sl-icon slot="prefix" name="trash2"></sl-icon>`}
            ${msg("Purge Index")}
          </sl-menu-item>
        `;
      };
      return html`${when(
          this.collection.indexStats.removedCrawls &&
            this.collection.indexState,
          purgeMenuItem,
        )}
        <sl-menu-item
          class="menu-item-danger"
          @click=${() => (this.openDialogName = "deleteIndex")}
        >
          <sl-icon slot="prefix" name="trash3"></sl-icon>
          ${msg("Delete Index")}
        </sl-menu-item>`;
    }

    return html`<sl-menu-item
      class="menu-item-success"
      @click=${() => (this.openDialogName = "createIndex")}
    >
      <sl-icon slot="prefix" name="table"></sl-icon>
      ${msg("Create Index")}
    </sl-menu-item>`;
  }

  private renderInfoBar() {
    if (!this.collection) {
      return html`<div class="h-14">
        <span class="sr-only">${msg("Loading details")}</span>
      </div>`;
    }

    const createdDate =
      this.collection.created &&
      (!this.collection.modified ||
        this.collection.created === this.collection.modified)
        ? this.collection.created
        : null;

    return html`
      <btrix-desc-list horizontal>
        ${this.renderDetailItem(
          msg("Archived Items"),
          (col) =>
            `${this.localize.number(col.crawlCount)} ${pluralOf("items", col.crawlCount)}`,
        )}
        ${this.renderDetailItem(
          msg("Total Pages"),
          (col) =>
            `${this.localize.number(col.pageCount)} ${pluralOf("pages", col.pageCount)}`,
        )}
        ${this.renderDetailItem(
          msg("Total Size"),
          (col) => html` ${this.localize.bytes(col.totalSize)} `,
        )}
        ${createdDate
          ? this.renderDetailItem(msg("Created"), () =>
              this.localize.relativeDate(createdDate),
            )
          : this.renderDetailItem(msg("Last Modified"), (col) =>
              col.modified ? this.localize.relativeDate(col.modified) : "",
            )}
      </btrix-desc-list>
    `;
  }

  private renderDetailItem(
    label: string | TemplateResult,
    renderContent: (
      collection: Collection | PublicCollection,
    ) => TemplateResult | string,
  ) {
    return metadataItemWithCollection(this.collection)({
      label,
      render: renderContent,
    });
  }

  private renderAbout() {
    const metadata = metadataColumn(this.collection);

    return html`
      <div class="grid grid-cols-7 gap-7">
        <section
          class="col-span-full flex flex-col leading-relaxed lg:col-span-5"
        >
          <header class="flex items-center justify-between">
            ${panelHeader({
              heading: msg("Description"),
            })}
            ${this.isEditingDescription
              ? html`
                  <btrix-popover placement="right-start">
                    <div slot="content">
                      <p class="mb-3">
                        ${msg(
                          html`Describe your collection in long-form rich text
                            (e.g. <strong>bold</strong> and
                            <em>italicized</em> text.)`,
                        )}
                      </p>
                      <p>
                        ${msg(
                          html`If this collection is shareable, this will appear
                          in the “About This Collection” section of the shared
                          collection.`,
                        )}
                      </p>
                    </div>
                    <div class="flex items-center gap-1.5 text-neutral-500">
                      ${msg("Help")}
                      <sl-icon
                        name="question-circle"
                        class="size-4 text-base"
                      ></sl-icon>
                    </div>
                  </btrix-popover>
                `
              : html`<sl-tooltip content=${msg("Edit Description")}>
                  <sl-icon-button
                    class="text-base"
                    name="pencil"
                    @click=${() => (this.isEditingDescription = true)}
                  >
                  </sl-icon-button>
                </sl-tooltip>`}
          </header>
          ${when(
            this.collection,
            (collection) =>
              this.isEditingDescription
                ? this.renderDescriptionForm()
                : html`
                    <div
                      class=${clsx(
                        tw`flex-1 rounded-lg border p-3 lg:p-6`,
                        !collection.description &&
                          tw`flex flex-col items-center justify-center`,
                      )}
                    >
                      ${collection.description
                        ? html`
                            <btrix-markdown-viewer
                              value=${collection.description}
                            ></btrix-markdown-viewer>
                          `
                        : html`
                            <div class="text-center text-neutral-500">
                              <p class="mb-3 max-w-prose">
                                ${msg("No description provided.")}
                              </p>
                              <sl-button
                                size="small"
                                @click=${() =>
                                  (this.isEditingDescription = true)}
                                ?disabled=${!this.collection}
                              >
                                <sl-icon name="pencil" slot="prefix"></sl-icon>
                                ${msg("Add Description")}
                              </sl-button>
                            </div>
                          `}
                    </div>
                  `,
            this.renderSpinner,
          )}
        </section>
        <section class="col-span-full flex-1 lg:col-span-2">
          ${panelHeader({
            heading: msg("Details"),
          })}
          <div>${metadata}</div>
        </section>
      </div>
    `;
  }

  private renderDescriptionForm() {
    if (!this.collection) return;

    return html`
      <btrix-markdown-editor
        class="flex-1"
        initialValue=${this.collection.description || ""}
        placeholder=${msg("Tell viewers about this collection")}
        maxlength=${4000}
      ></btrix-markdown-editor>
      <div class="flex-column mt-4 flex justify-between border-t pt-4">
        <sl-button
          size="small"
          @click=${() => (this.isEditingDescription = false)}
        >
          ${msg("Cancel")}
        </sl-button>
        <sl-button
          variant="primary"
          size="small"
          @click=${() => void this.saveDescription()}
          ?disabled=${!this.collection}
        >
          ${msg("Update Description")}
        </sl-button>
      </div>
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
        this.renderSpinner,
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
    const notFound = this.archivedItems?.page && this.archivedItems.page > 1;

    return panelBody({
      content: emptyMessage({
        message: notFound
          ? msg("Page not found.")
          : msg("No archived items yet"),
        detail: notFound
          ? undefined
          : msg(
              "Select individual items or automatically add new crawled items.",
            ),
        actions:
          !notFound && this.isCrawler
            ? html`
                <sl-button
                  size="small"
                  variant="primary"
                  @click=${() =>
                    this.editing.setValue(EditingSearchParamValue.Items)}
                >
                  <sl-icon name="ui-checks" slot="prefix"></sl-icon>
                  ${msg("Add Archived Items")}
                </sl-button>
              `
            : undefined,
      }),
    });
  }

  private readonly renderArchivedItem = (
    item: ArchivedItem,
    _idx: number,
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
                    @click=${() => {
                      if (item.requiredByCrawls.length) {
                        this.itemToRemove = item;
                        this.openDialogName = "removeItem";
                      } else {
                        void this.removeArchivedItem(item.id);
                      }
                    }}
                  >
                    <sl-icon name="folder-minus" slot="prefix"></sl-icon>
                    ${msg("Remove from Collection")}
                  </sl-menu-item>
                  <sl-divider></sl-divider>
                  <sl-menu-item
                    @click=${() => ClipboardController.copyToClipboard(item.id)}
                  >
                    <sl-icon name="copy" slot="prefix"></sl-icon>
                    ${msg("Copy Item ID")}
                  </sl-menu-item>
                </sl-menu>
              </btrix-overflow-dropdown>
            </btrix-table-cell>
          `
        : nothing}
    </btrix-archived-item-list-item>
  `;

  private readonly renderReplay = () => {
    if (!this.collection) {
      return this.renderSpinner();
    }
    if (!this.collection.crawlCount) {
      return this.renderEmptyState();
    }

    const replaySource = `/api/orgs/${this.orgId}/collections/${this.collectionId}/replay.json`;
    const headers = this.authState?.headers;
    const config = JSON.stringify({ headers });

    return html` <section class="overflow-hidden rounded-lg border">
      <replay-web-page
        class="h-[calc(100vh-6.5rem)]"
        source=${replaySource}
        config="${config}"
        coll=${this.collectionId}
        url=${this.collection.homeUrl ||
        /* must be empty string to reset the attribute: */ ""}
        ts=${formatRwpTimestamp(this.collection.homeUrlTs) ||
        /* must be empty string to reset the attribute: */ ""}
        replayBase="/replay/"
        noSandbox="true"
        noCache="true"
        @rwp-url-change=${() => {
          if (!this.isRwpLoaded) {
            this.isRwpLoaded = true;
          }
          if (this.rwpDoFullReload && this.replayEmbed) {
            this.replayEmbed.fullReload();
            this.rwpDoFullReload = false;
          }
        }}
      ></replay-web-page>
    </section>`;
  };

  private readonly renderSpinner = () => html`
    <div
      class="flex min-h-full items-center justify-center rounded-lg border py-24 text-3xl"
    >
      <sl-spinner></sl-spinner>
    </div>
  `;

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
      this.archivedItems = await this.getArchivedItems({
        ...params,
        page:
          params?.page ||
          this.archivedItems?.page ||
          parsePage(new URLSearchParams(location.search).get("page")),
        pageSize:
          params?.pageSize ||
          this.archivedItems?.pageSize ||
          INITIAL_ITEMS_PAGE_SIZE,
      });
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

  private async getArchivedItems<T extends "crawl" | "upload">(
    params?: Partial<{
      crawlType: T;
      state: CrawlState[];
    }> &
      APIPaginationQuery &
      APISortQuery,
    signal?: AbortSignal,
  ) {
    const query = queryString.stringify(
      { ...params },
      {
        arrayFormat: "comma",
      },
    );
    const data = await this.api.fetch<
      APIPaginatedList<
        T extends "crawl" ? Crawl : T extends "upload" ? Upload : Crawl | Upload
      >
    >(
      `/orgs/${this.orgId}/all-crawls?collectionId=${this.collectionId}&${query}`,
      { signal },
    );

    return data;
  }

  private async removeArchivedItem(id: string) {
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
      this.refreshReplay();
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

  private async createIndex() {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/collections/${this.collectionId}/dedupeIndex/create`,
        {
          method: "POST",
        },
      );
      await this.fetchCollection();

      const count = this.collection?.crawlCount || 0;
      const items_count = this.localize.number(count);
      const plural_of_items = pluralOf("items", count);

      this.notify.toast({
        ...(count
          ? {
              title: msg("Created deduplication index."),
              message: msg(
                str`Importing ${items_count} archived ${plural_of_items}.`,
              ),
            }
          : {
              message: msg("Created deduplication index."),
            }),
        variant: "success",
        icon: "check2-circle",
        id: "dedupe-index-update-status",
      });
    } catch (err) {
      console.debug(err);

      this.notify.toast({
        message: msg("Sorry, couldn't created index at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "dedupe-index-update-status",
      });
    }
  }

  private async purgeIndex() {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/collections/${this.collectionId}/dedupeIndex/purge`,
        {
          method: "POST",
        },
      );
      await this.fetchCollection();

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

  private async deleteIndex(params: { removeFromWorkflows: boolean }) {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/collections/${this.collectionId}/dedupeIndex/delete`,
        {
          method: "POST",
          body: JSON.stringify(params),
        },
      );
      await this.fetchCollection();

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
}
