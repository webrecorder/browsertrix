import { consume, provide } from "@lit/context";
import { localized, msg, str } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import clsx from "clsx";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { guard } from "lit/directives/guard.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";
import type {
  ReplayWebPage,
  RwpPageLoadingEvent,
  RwpUrlChangeEvent,
} from "replaywebpage";

import { collectionRwpContext } from "./context/collection-rwp";
import {
  CollectionSearchParam,
  EditingSearchParamValue,
  Tab,
  type Dialog,
  type OpenDialogEventDetail,
} from "./types";
import { getThumbnailBlob } from "./utils/getThumbnailBlob";

import { BtrixElement } from "@/classes/BtrixElement";
import type {
  EditableTextFieldChangeEvent,
  EditableTextFieldInputEvent,
} from "@/components/ui/editable-text-field";
import type { MarkdownEditor } from "@/components/ui/markdown-editor";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { viewStateContext, type ViewStateContext } from "@/context/view-state";
import { ClipboardController } from "@/controllers/clipboard";
import { SearchParamsValue } from "@/controllers/searchParamsValue";
import { type BtrixChangeEvent } from "@/events/btrix-change";
import type { BtrixRequestOrgUpdate } from "@/events/btrix-request-org-update";
import { DEFAULT_THUMBNAIL } from "@/features/collections/collection-thumbnail";
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
import { updatingOverlay } from "@/layouts/updatingOverlay";
import { OrgTab, RouteNamespace } from "@/routes";
import { getIndexErrorMessage } from "@/strings/collections/index-error";
import {
  type APIPaginatedList,
  type APIPaginationQuery,
  type APISortQuery,
} from "@/types/api";
import {
  COLLECTION_CAPTION_MAX_LENGTH,
  COLLECTION_NAME_MAX_LENGTH,
  CollectionAccess,
  collectionSchema,
  type Collection,
  type PublicCollection,
} from "@/types/collection";
import type { ArchivedItem, Crawl, Upload } from "@/types/crawler";
import type { CrawlState } from "@/types/crawlState";
import type { DedupeIndexState } from "@/types/dedupe";
import type { PageSnapshot } from "@/types/page";
import { SortDirection } from "@/types/utils";
import { isApiError } from "@/utils/api";
import { isCrawlReplay, renderName } from "@/utils/crawler";
import { indexAvailable, indexInUse, indexUpdating } from "@/utils/dedupe";
import { isNotEqual } from "@/utils/is-not-equal";
import { pluralOf } from "@/utils/pluralize";
import { formatRwpTimestamp } from "@/utils/replay";
import { richText } from "@/utils/rich-text";
import slugifyStrict from "@/utils/slugify";
import { tw } from "@/utils/tailwind";
import { toShortUrl } from "@/utils/url-helpers";

const ABORT_REASON_THROTTLE = "throttled";
const INITIAL_ITEMS_PAGE_SIZE = 20;
const POLL_INTERVAL_SECONDS = 10;
const POLL_INTERVAL_ACTIVE_SECONDS = 1;

@customElement("btrix-collection-detail")
@localized()
export class CollectionDetail extends BtrixElement {
  @property({ type: String })
  collectionId!: string;

  @property({ type: String })
  collectionTab: Tab | null = Tab.Replay;

  @state({ hasChanged: isNotEqual })
  private collection?: Collection;

  @state()
  private archivedItems?: APIPaginatedList<ArchivedItem>;

  @state()
  private openDialogName?: Dialog;

  @state()
  private itemToRemove?: ArchivedItem;

  @state()
  private isEditingDescription = false;

  @state()
  private isRwpLoaded = false;

  @state()
  private rwpDoFullReload = false;

  @state()
  private slugPreview = "";

  @state()
  private replayCurrentView?: { url: string; ts?: string };

  @consume({ context: viewStateContext })
  viewState?: ViewStateContext;

  @provide({ context: collectionRwpContext })
  replayEmbed?: ReplayWebPage | null;

  @query("btrix-share-collection")
  private readonly shareCollection?: ShareCollection | null;

  @query("btrix-markdown-editor")
  private readonly descriptionEditor?: MarkdownEditor | null;

  // Use to cancel requests
  private getArchivedItemsController: AbortController | null = null;

  private timerId?: number;

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
    { icon: { name: string; library: string }; text: string; beta?: boolean }
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
      beta: true,
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

  /**
   * Get page ID from URL and timestamp
   */
  private readonly replayCurrentPage = new Task(this, {
    task: async ([replayCurrentView], { signal }) => {
      if (!replayCurrentView) return;

      const { url, ts } = replayCurrentView;
      const { items } = await this.getPages(
        { url, sortBy: "ts", sortDirection: SortDirection.Descending },
        signal,
      );
      let page: PageSnapshot | undefined = items[0];

      if (ts) {
        page = items.find((page) => formatRwpTimestamp(page.ts) === ts);
      }

      return page || null;
    },
    args: () => [this.replayCurrentView] as const,
  });

  /**
   * Revert thumbnail change
   */
  private readonly revertThumbnailTask = new Task(this, {
    task: async ([oldThumbnail, oldDefaultThumbnailName], { signal }) => {
      try {
        if (oldDefaultThumbnailName) {
          await this.updateThumbnail(
            {
              defaultThumbnailName: oldDefaultThumbnailName,
            },
            signal,
          );
        } else {
          if (oldThumbnail) {
            this.notify.toast({
              message: msg("Reverting thumbnail..."),
              variant: "info",
              icon: "info-circle",
              id: "update",
            });

            await this.uploadThumbnail(
              {
                url: oldThumbnail.url,
                timestamp: oldThumbnail.urlTs,
                pageId: oldThumbnail.urlPageId,
              },
              signal,
            );
          }
          await this.updateThumbnail(
            {
              defaultThumbnailName: oldThumbnail ? null : DEFAULT_THUMBNAIL,
            },
            signal,
          );
        }

        this.notify.toast({
          message: msg("Thumbnail updated."),
          variant: "success",
          icon: "check2-circle",
          id: "update",
        });

        await this.fetchCollection();
      } catch {
        this.notify.toast({
          message: msg("Sorry, couldn’t revert thumbnail at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "update",
        });
      }
    },
    args: () =>
      [undefined, undefined] as readonly [
        Collection["thumbnailSource"] | undefined,
        Collection["defaultThumbnailName"] | undefined,
      ],
    autoRun: false,
  });

  /**
   * Update Replay/collection initial view
   */
  private readonly updateHomepageTask = new Task(this, {
    task: async ([page], { signal }) => {
      this.revertThumbnailTask.abort();

      try {
        const oldThumbnail = this.collection?.thumbnailSource;
        const oldDefaultThumbnailName = this.collection?.defaultThumbnailName;
        let thumbnailUpdated = false;

        await this.updateHomepage({ pageId: page?.id ?? null }, signal);

        if (page) {
          this.notify.toast({
            message: msg("Updating homepage..."),
            variant: "info",
            icon: "info-circle",
            id: "update",
          });

          try {
            await this.uploadThumbnail(
              { url: page.url, timestamp: page.ts, pageId: page.id },
              signal,
            );
            await this.updateThumbnail({ defaultThumbnailName: null }, signal);

            thumbnailUpdated = true;
          } catch (err) {
            console.debug(err);
          }
        }

        // Optimistic update
        if (this.collection) {
          this.collection = {
            ...this.collection,
            homeUrl: page?.url || null,
            homeUrlTs: page?.ts || null,
            homeUrlPageId: null,
          };
        }

        if (thumbnailUpdated) {
          const undo = () =>
            void this.revertThumbnailTask.run([
              oldThumbnail,
              oldDefaultThumbnailName,
            ]);
          const undoButton = html`<button
            class="font-semibold text-primary-500 underline hover:text-primary-600 hover:no-underline"
            @click=${undo}
          >
            ${msg("Undo")}
          </button>`;
          this.notify.toast({
            title: msg("Homepage updated"),
            message: html`${msg("Thumbnail updated to match.")} ${undoButton}`,
            variant: "success",
            icon: "check2-circle",
            duration: 10000,
            id: "update",
          });
        } else {
          this.notify.toast({
            message: msg("Homepage updated."),
            variant: "success",
            icon: "check2-circle",
            id: "update",
          });
        }

        await this.fetchCollection();
      } catch (err) {
        if (isApiError(err) && err.details === "invalid_collection_page") {
          this.notify.toast({
            message: msg("Please choose another homepage."),
            variant: "warning",
            icon: "exclamation-triangle",
            id: "update",
          });
        } else {
          console.debug(err);

          this.notify.toast({
            message: msg("Sorry, couldn’t update homepage at this time."),
            variant: "danger",
            icon: "exclamation-octagon",
            id: "update",
          });
        }
      }
    },
    args: () => [undefined] as readonly [PageSnapshot | undefined],
    autoRun: false,
  });

  disconnectedCallback(): void {
    window.clearTimeout(this.timerId);
    super.disconnectedCallback();
  }

  protected async willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (changedProperties.has("collectionId")) {
      this.replayEmbed = undefined;
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
      <div class="mb-7">${this.renderBreadcrumbs()}</div>
      <header
        class=${clsx(
          tw`grid items-end gap-4 md:grid-cols-[auto_1fr] md:grid-rows-[repeat(3,auto)] md:items-start lg:grid-cols-[auto_1fr_auto]`,
        )}
      >
        <div class="aspect-video md:row-span-3 md:h-36">
          ${when(
            this.collection,
            this.renderThumbnail,
            () =>
              html`<sl-skeleton
                class="block aspect-video [--border-radius:var(--sl-border-radius-large)]"
                effect="sheen"
              ></sl-skeleton>`,
          )}
        </div>
        <div
          class=${clsx(
            tw`overflow-hidden md:col-start-2 md:row-start-1`,
            this.isCrawler && tw`-m-1 p-1`,
          )}
        >
          <div
            class=${clsx(
              tw`flex items-center gap-2.5`,
              this.isCrawler ? tw`mb-1.5` : tw`mb-2`,
            )}
          >
            ${pageTitle(
              when(this.collection, this.renderName),
              tw`mb-2 h-6 w-60`,
              tw`grid`,
            )}
          </div>
          <div class="relative z-10">${this.renderAccessDetails()}</div>
        </div>
        <div
          class=${clsx(
            tw`grid md:col-start-2 md:row-start-2 lg:col-end-4`,
            this.isCrawler && tw`-mx-1 -mb-9 -mt-1 px-1 pb-5 pt-1 `,
          )}
        >
          ${this.isCrawler
            ? when(
                this.collection,
                (col) =>
                  html`<btrix-editable-text-field
                    class="-m-4 -mb-5 overflow-hidden p-4 pb-5 text-neutral-600"
                    maxLength=${COLLECTION_CAPTION_MAX_LENGTH}
                    .value=${col.caption}
                    placeholder=${msg("Add a summary...")}
                    .renderContent=${this.renderCaption}
                    rows=${3}
                    @btrix-change=${(e: BtrixChangeEvent<string>) => {
                      void this.updateSummary(e.detail.value);
                    }}
                    extraWidth=${24}
                  >
                    <span
                      slot="suffix"
                      class="ml-2 mt-0.5 inline-flex h-5 shrink-0 items-center"
                    >
                      <sl-icon
                        name="pencil"
                        class="size-3"
                        aria-label=${msg("Edit Collection Caption")}
                      ></sl-icon>
                    </span>
                  </btrix-editable-text-field>`,
              )
            : this.collection?.caption
              ? this.renderCaption(this.collection.caption)
              : nothing}
        </div>

        <div
          class="ml-auto flex flex-shrink-0 flex-wrap items-center justify-end gap-2 md:col-start-2 md:row-start-3 lg:col-start-3 lg:row-start-1"
        >
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
        class="relative mt-3 rounded-lg border bg-white px-4 py-2"
        aria-busy="${
          // TODO Switch to task and use task status
          this.collection === undefined || this.collection.runningUpdatesCount
        }"
      >
        ${this.renderInfoBar()}
      </div>
      <div class="flex flex-wrap items-center justify-between gap-y-2 py-3">
        ${this.renderTabs()}
        ${when(this.isCrawler, () =>
          choose(this.collectionTab, [
            [
              Tab.Replay,
              () =>
                this.collection?.crawlCount
                  ? html`
                      <sl-button-group label=${msg("Replay Toolbar")}>
                        <sl-tooltip
                          content=${msg("Go to Homepage")}
                          placement="left"
                        >
                          <sl-button
                            size="small"
                            ?disabled=${!this.replayEmbed ||
                            this.updateHomepageTask.status ===
                              TaskStatus.PENDING}
                            @click=${this.goToHomepage}
                          >
                            <sl-icon slot="prefix" name="house"></sl-icon>
                          </sl-button>
                        </sl-tooltip>
                        <sl-dropdown placement="bottom-end" distance="4">
                          <sl-button slot="trigger" size="small" caret>
                            ${msg("Set Homepage")}</sl-button
                          >
                          <sl-menu>
                            <sl-menu-item
                              ?disabled=${!this.replayCurrentPage.value}
                              @click=${() => {
                                if (this.replayCurrentPage.value) {
                                  void this.updateHomepageTask.run([
                                    this.replayCurrentPage.value,
                                  ]);
                                }
                              }}
                            >
                              <sl-icon
                                slot="prefix"
                                name="file-earmark-richtext"
                              ></sl-icon>
                              ${msg("Current Page")}
                            </sl-menu-item>
                            <sl-menu-item
                              @click=${() => void this.updateHomepageTask.run()}
                            >
                              <sl-icon slot="prefix" name="list-ul"></sl-icon>
                              ${msg("Page List")}
                            </sl-menu-item>
                          </sl-menu>
                        </sl-dropdown>
                      </sl-button-group>
                    `
                  : this.collection?.runningUpdatesCount
                    ? html`<sl-spinner slot="prefix"></sl-spinner>`
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
        [
          Tab.Replay,
          () =>
            guard(
              [this.collectionId, this.collection?.crawlCount],
              this.renderReplay,
            ),
        ],
        [
          Tab.Items,
          () => guard([this.archivedItems], this.renderArchivedItems),
        ],
        [Tab.About, () => this.renderAbout()],
        [
          Tab.Deduplication,
          () =>
            when(
              this.featureFlags.has("dedupeEnabled"),
              () =>
                html`<btrix-collection-detail-dedupe
                  .collectionId=${this.collectionId}
                  .collection=${this.collection}
                  @btrix-open-dialog=${(
                    e: CustomEvent<OpenDialogEventDetail>,
                  ) => {
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
                </btrix-collection-detail-dedupe>`,
            ),
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

      <btrix-collection-edit-dialog
        .collection=${this.collection}
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

  private readonly renderThumbnail = (collection: Collection) => {
    return html`
      <btrix-select-collection-thumbnail
        collectionId=${collection.id}
        homeUrl=${ifDefined(collection.homeUrl || undefined)}
        homeUrlTs=${ifDefined(collection.homeUrlTs || undefined)}
        thumbnailName=${ifDefined(collection.defaultThumbnailName || undefined)}
        thumbnailPath=${ifDefined(collection.thumbnail?.path)}
        pageCount=${collection.pageCount || 0}
        @btrix-collection-saved=${() => {
          void this.fetchCollection();
        }}
      ></btrix-select-collection-thumbnail>
    `;
  };

  private readonly renderName = (collection: Collection) => {
    if (!this.isCrawler) return collection.name;

    return html`<btrix-editable-text-field
      class="-m-4 overflow-hidden p-4"
      minLength=${1}
      maxLength=${COLLECTION_NAME_MAX_LENGTH}
      .value=${collection.name}
      placeholder=${msg("Enter collection name")}
      @btrix-input=${(e: EditableTextFieldInputEvent) => {
        e.stopPropagation();

        const { value } = e.detail;

        this.slugPreview = value ? slugifyStrict(value) : "";
      }}
      @btrix-change=${(e: EditableTextFieldChangeEvent) => {
        e.stopPropagation();

        const { value } = e.detail;

        if (value === this.collection?.name) {
          this.slugPreview = "";
        }

        void this.updateName(value);
      }}
      extraWidth=${24}
    >
      <span
        slot="suffix"
        class="ml-2 mt-0.5 inline-flex h-8 shrink-0 items-center"
      >
        <sl-icon
          name="pencil"
          class="size-3.5"
          aria-label=${msg("Edit Collection Name")}
        ></sl-icon>
      </span>
    </btrix-editable-text-field>`;
  };

  private readonly renderAccessDetails = () => {
    if (!this.collection) {
      return html`<sl-skeleton class="h-4 w-12"></sl-skeleton>`;
    }

    const badge = html`<btrix-badge>
      <sl-icon
        name=${SelectCollectionAccess.Options[this.collection.access].icon}
        class="mr-1.5"
      ></sl-icon>
      ${SelectCollectionAccess.Options[this.collection.access].label}
    </btrix-badge>`;

    const publicLink = () => {
      const baseUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`;
      const namespacedPath = `${RouteNamespace.PublicOrgs}/${this.viewState?.params.slug}/${OrgTab.Collections}`;
      const slugPreview = this.slugPreview || this.collection?.slug || "";
      const link = new URL(`${baseUrl}/${namespacedPath}/${slugPreview}`).href;
      const displayUrl = html`<span class="break-all text-xs text-neutral-500">
        <span>${toShortUrl(baseUrl, null)}</span
        ><span title="/${namespacedPath}/">/.../</span
        ><span
          class=${clsx(
            tw`break-all text-xs`,
            this.slugPreview ? tw` text-blue-500` : tw`text-neutral-500`,
          )}
          >${slugPreview}</span
        >
      </span>`;

      return html` ${this.slugPreview
        ? displayUrl
        : html`<a
            class="group flex items-center gap-1.5"
            href=${link}
            target="_blank"
          >
            ${displayUrl}
            <sl-icon
              name="arrow-up-right"
              class="size-2.5 opacity-0 transition-opacity duration-fast group-hover:opacity-100"
            ></sl-icon>
          </a>`}`;
    };

    return html`<div class="flex items-start gap-1.5">
      ${badge}
      ${when(this.collection.access !== CollectionAccess.Private, publicLink)}
    </div>`;
  };

  private readonly renderCaption = (text: string) =>
    html`<btrix-prose
      class="block [--btrix-line-clamp:2] part-[base]:max-w-full"
      >${richText(text, {
        linkClass: tw`text-cyan-500 transition-colors hover:text-cyan-600`,
      })}</btrix-prose
    >`;

  private refreshReplay() {
    if (this.replayEmbed) {
      try {
        void this.replayEmbed.fullReload();
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
    let tabs = Object.values(Tab);

    if (this.featureFlags.excludes("dedupeEnabled")) {
      tabs = tabs.filter((tab) => tab !== Tab.Deduplication);
    }

    return html`
      <btrix-overflow-scroll
        class="-mx-3 -my-2 max-w-[calc(100%+theme(spacing.6))] part-[content]:px-3 part-[content]:py-2"
      >
        <nav class="flex min-w-max gap-2">
          ${tabs.map((tabName) => {
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
                ${tab.text}
                ${when(
                  tab.beta,
                  () => html`<btrix-beta-badge></btrix-beta-badge>`,
                )}
              </btrix-navigation-button>
            `;
          })}
        </nav>
      </btrix-overflow-scroll>
    `;
  };

  private readonly renderActions = () => {
    const authToken = this.authState?.headers.Authorization.split(" ")[1];

    return html`
      <btrix-popover placement="bottom">
        ${when(
          this.collection,
          (collection) => html`
            <div slot="content">
              <div class="text-sm font-semibold">
                ${SelectCollectionAccess.Options[collection.access].label}
              </div>
              <p>${SelectCollectionAccess.Options[collection.access].detail}</p>
            </div>
          `,
        )}
        <sl-button
          size="small"
          variant=${this.collection?.crawlCount ? "primary" : "default"}
          @click=${() => {
            this.openDialogName = "edit";
          }}
        >
          <sl-icon
            slot="prefix"
            name=${this.collection
              ? SelectCollectionAccess.Options[this.collection.access].icon
              : ""}
          ></sl-icon>
          ${msg("Share")}
        </sl-button>
      </btrix-popover>
      <sl-dropdown distance="4">
        <sl-button slot="trigger" size="small" caret
          >${msg("Actions")}</sl-button
        >
        <sl-menu>
          <sl-menu-item
            @click=${() => {
              this.openDialogName = "edit";
            }}
          >
            <sl-icon name="box-arrow-up" slot="prefix"></sl-icon>
            ${msg("Share Collection")}
          </sl-menu-item>
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

          ${when(this.featureFlags.has("dedupeEnabled"), () =>
            this.appState.isAdmin
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
                ),
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
            `${this.localize.number(col.pageCount, { notation: "compact" })} ${pluralOf("pages", col.pageCount)}`,
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
        ${this.collection.runningUpdatesCount
          ? updatingOverlay({ class: "rounded-lg" })
          : nothing}
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
              : this.isCrawler
                ? html`<sl-tooltip content=${msg("Edit Description")}>
                    <sl-icon-button
                      class="text-base"
                      name="pencil"
                      @click=${() => (this.isEditingDescription = true)}
                    >
                    </sl-icon-button>
                  </sl-tooltip>`
                : nothing}
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
                              ${when(
                                this.isCrawler,
                                () => html`
                                  <sl-button
                                    size="small"
                                    @click=${() =>
                                      (this.isEditingDescription = true)}
                                    ?disabled=${!this.collection}
                                  >
                                    <sl-icon
                                      name="pencil"
                                      slot="prefix"
                                    ></sl-icon>
                                    ${msg("Add Description")}
                                  </sl-button>
                                `,
                              )}
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
        @rwp-page-loading=${(e: RwpPageLoadingEvent) => {
          if (
            !e.detail.loading &&
            "replayNotFoundError" in e.detail &&
            e.detail.replayNotFoundError
          ) {
            this.replayCurrentView = undefined;
          }
        }}
        @rwp-url-change=${(e: RwpUrlChangeEvent) => {
          if (!this.replayEmbed) {
            this.replayEmbed = e.currentTarget as ReplayWebPage;
          }
          if (!this.isRwpLoaded) {
            this.isRwpLoaded = true;
          }
          if (this.rwpDoFullReload) {
            void this.replayEmbed.fullReload();
            this.rwpDoFullReload = false;
          }

          const { url, ts } = e.detail;

          if (
            !(
              "replayNotFoundError" in e.detail && e.detail.replayNotFoundError
            ) &&
            url
          ) {
            this.replayCurrentView = { url, ts };
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

  /**
   * Navigate RWP to collection home URL.
   */
  private readonly goToHomepage = async () => {
    if (!this.collection) {
      console.debug("no this.collection");
      return;
    }

    if (!this.replayEmbed) {
      console.debug("no this.replayEmbed");
      return;
    }

    // TODO Requires https://github.com/webrecorder/replayweb.page/pull/521
    // this.replayEmbed.mainElement?.navigateReplayTo(
    //   this.collection.homeUrl || "pages",
    //   this.collection.homeUrlTs
    //     ? { ts: formatRwpTimestamp(this.collection.homeUrlTs) || "" }
    //     : undefined,
    // );
  };

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
        id: "update",
      });

      // Collection may be used in crawling default, request update
      this.dispatchEvent(
        new CustomEvent<BtrixRequestOrgUpdate["detail"]>(
          "btrix-request-org-update",
          {
            detail: { org: {} },
            bubbles: true,
            composed: true,
          },
        ),
      );
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn’t delete Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "update",
      });
    }
  }

  private async fetchCollection() {
    try {
      this.collection = await this.getCollection();

      if (this.timerId) window.clearTimeout(this.timerId);
      if (this.collection.runningUpdatesCount > 0) {
        this.timerId = window.setTimeout(() => {
          void this.fetchCollection();
        }, 1000 * POLL_INTERVAL_ACTIVE_SECONDS);
      } else {
        this.timerId = window.setTimeout(() => {
          void this.fetchCollection();
        }, 1000 * POLL_INTERVAL_SECONDS);
      }
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn’t retrieve Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "update",
      });
      console.error(e);
    }
  }

  private async getCollection() {
    const data = await this.api.fetch<Collection>(
      `/orgs/${this.orgId}/collections/${this.collectionId}/replay.json`,
    );

    return collectionSchema.parse(data);
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
          message: msg("Sorry, couldn’t retrieve web captures at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "update",
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
        id: "update",
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
          "Sorry, couldn’t remove item from Collection at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async updateName(name: string) {
    if (name === this.collection?.name) {
      return;
    }

    try {
      await this.api.fetch<Collection>(
        `/orgs/${this.orgId}/collections/${this.collectionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
            slug: slugifyStrict(name),
          }),
        },
      );

      this.notify.toast({
        message: msg("Name updated."),
        variant: "success",
        icon: "check2-circle",
        id: "update",
      });

      if (this.collection) {
        this.collection = {
          ...this.collection,
          name,
          slug: this.slugPreview || this.collection.slug || "",
        };
      }

      await this.fetchCollection();

      this.slugPreview = "";
    } catch (err) {
      console.debug(err);

      this.notify.toast({
        message: msg("Sorry, couldn’t save collection name at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async updateSummary(caption: string) {
    caption = caption.trim();
    if (caption === this.collection?.caption) return;
    try {
      await this.api.fetch<Collection>(
        `/orgs/${this.orgId}/collections/${this.collectionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            caption,
          }),
        },
      );

      this.notify.toast({
        message: msg("Summary updated."),
        variant: "success",
        icon: "check2-circle",
        id: "update",
      });

      if (this.collection) {
        this.collection = {
          ...this.collection,
          caption,
        };
      }

      void this.fetchCollection();
    } catch (err) {
      console.debug(err);

      this.notify.toast({
        message: msg("Sorry, couldn’t save collection summary at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "update",
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
        id: "update",
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
          "Sorry, couldn’t save collection description at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "update",
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
        id: "update",
      });
    } catch (err) {
      console.debug(err);

      this.notify.toast({
        message: msg("Sorry, couldn’t create index at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "update",
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
      this.refreshReplay();
      await this.fetchCollection();

      this.notify.toast({
        message: msg("Purging deduplication index..."),
        variant: "success",
        icon: "check2-circle",
        id: "update",
      });
    } catch (err) {
      const message =
        getIndexErrorMessage(err) ||
        msg("Sorry, couldn’t purge index at this time.");

      this.notify.toast({
        message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "update",
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
      this.refreshReplay();
      await this.fetchCollection();

      this.notify.toast({
        message: msg("Deleted deduplication index."),
        variant: "success",
        icon: "check2-circle",
        id: "update",
      });
    } catch (err) {
      const message =
        getIndexErrorMessage(err) ||
        msg("Sorry, couldn’t delete index at this time.");

      this.notify.toast({
        message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "update",
      });
    }
  }

  private async getPages(
    params: { url?: string; ts?: string } & APISortQuery & APIPaginationQuery,
    signal: AbortSignal,
  ) {
    const query = queryString.stringify({ ...params });

    return this.api.fetch<APIPaginatedList<PageSnapshot>>(
      `/orgs/${this.orgId}/collections/${this.collectionId}/pages?${query}`,
      { signal },
    );
  }

  private async uploadThumbnail(
    {
      url,
      timestamp,
      pageId,
    }: { url: string; timestamp: string; pageId: string },
    signal: AbortSignal,
  ) {
    const blob = await getThumbnailBlob(
      {
        collectionId: this.collectionId,
        rwp: this.replayEmbed,
        url,
        timestamp,
      },
      signal,
    );

    if (!blob) {
      throw new Error("thumbnail not found");
    }

    const fileName = `page-thumbnail_${pageId}.jpeg`;
    const file = new File([blob], fileName, {
      type: blob.type,
    });

    const searchParams = new URLSearchParams({
      filename: fileName,
      sourceUrl: url,
      sourceTs: timestamp,
      sourcePageId: pageId,
    });

    return this.api.upload(
      `/orgs/${this.orgId}/collections/${this.collectionId}/thumbnail?${searchParams.toString()}`,
      file,
      signal,
    );
  }

  private async updateThumbnail(
    {
      defaultThumbnailName,
    }: {
      defaultThumbnailName: string | null;
    },
    signal: AbortSignal,
  ) {
    return this.api.fetch<{ updated: boolean }>(
      `/orgs/${this.orgId}/collections/${this.collectionId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ defaultThumbnailName }),
        signal,
      },
    );
  }

  private async updateHomepage(
    params: { pageId?: string | null; url?: string; ts?: string },
    signal: AbortSignal,
  ) {
    return this.api.fetch(
      `/orgs/${this.orgId}/collections/${this.collectionId}/home-url`,
      {
        method: "POST",
        body: JSON.stringify(params),
        signal,
      },
    );
  }
}
