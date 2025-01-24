import { localized, msg, str } from "@lit/localize";
import clsx from "clsx";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { guard } from "lit/directives/guard.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";
import type { Embed as ReplayWebPage } from "replaywebpage";

import { BtrixElement } from "@/classes/BtrixElement";
import type { MarkdownEditor } from "@/components/ui/markdown-editor";
import type { PageChangeEvent } from "@/components/ui/pagination";
import type { EditDialogTab } from "@/features/collections/collection-edit-dialog";
import { SelectCollectionAccess } from "@/features/collections/select-collection-access";
import type { ShareCollection } from "@/features/collections/share-collection";
import { pageNav, pageTitle, type Breadcrumb } from "@/layouts/pageHeader";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import { CollectionAccess, type Collection } from "@/types/collection";
import type { ArchivedItem, Crawl, Upload } from "@/types/crawler";
import type { CrawlState } from "@/types/crawlState";
import { pluralOf } from "@/utils/pluralize";
import { formatRwpTimestamp } from "@/utils/replay";
import { tw } from "@/utils/tailwind";

const ABORT_REASON_THROTTLE = "throttled";
const INITIAL_ITEMS_PAGE_SIZE = 20;

export enum Tab {
  Replay = "replay",
  About = "about",
  Items = "items",
}

@customElement("btrix-collection-detail")
@localized()
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
  private openDialogName?: "delete" | "edit" | "editItems";

  @state()
  private editTab?: EditDialogTab;

  @state()
  private isEditingDescription = false;

  @state()
  private isRwpLoaded = false;

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
      text: msg("About"),
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
    return html`
      <div class="mb-7">${this.renderBreadcrumbs()}</div>
      <header class=${clsx(tw`mt-5 flex flex-col gap-3 lg:flex-row`)}>
        <div
          class="-mb-2 -ml-2 -mr-1 -mt-1 flex flex-none flex-col gap-2 self-start rounded-lg pb-2 pl-2 pr-1 pt-1 transition-colors has-[sl-icon-button:hover]:bg-primary-50"
        >
          <div class="flex flex-wrap items-center gap-2.5">
            ${this.renderAccessIcon()}${pageTitle(this.collection?.name)}
            ${this.collection &&
            html`<sl-icon-button
              name="pencil"
              aria-label=${msg("Edit Collection")}
              @click=${async () => {
                this.openDialogName = "edit";
                this.editTab = "about";
              }}
            ></sl-icon-button>`}
          </div>
          ${this.collection?.caption
            ? html`<div class="text-pretty text-neutral-600">
                ${this.collection.caption}
              </div>`
            : nothing}
        </div>

        <div class="ml-auto flex flex-shrink-0 items-center gap-2">
          <btrix-share-collection
            orgSlug=${this.orgSlugState || ""}
            collectionId=${this.collectionId}
            .collection=${this.collection}
            @btrix-change=${(e: CustomEvent) => {
              e.stopPropagation();
              void this.fetchCollection();
            }}
          ></btrix-share-collection>
          ${when(this.isCrawler, this.renderActions)}
        </div>
      </header>

      <div class="mt-3 rounded-lg border px-4 py-2">
        ${this.renderInfoBar()}
      </div>
      <div class="flex items-center justify-between py-3">
        ${this.renderTabs()}
        ${when(this.isCrawler, () =>
          choose(this.collectionTab, [
            [
              Tab.Replay,
              () => html`
                <sl-tooltip
                  content=${this.collection?.crawlCount
                    ? msg("Choose what page viewers see first in replay")
                    : msg("Add items to select a home page")}
                  ?disabled=${Boolean(this.collection?.crawlCount)}
                >
                  <sl-button
                    size="small"
                    @click=${() => {
                      this.openDialogName = "edit";
                      this.editTab = "homepage";
                    }}
                    ?disabled=${!this.collection?.crawlCount ||
                    !this.isRwpLoaded}
                  >
                    ${!this.collection ||
                    Boolean(this.collection.crawlCount && !this.isRwpLoaded)
                      ? html`<sl-spinner slot="prefix"></sl-spinner>`
                      : html`<sl-icon name="gear" slot="prefix"></sl-icon>`}
                    ${msg("Configure View")}
                  </sl-button>
                </sl-tooltip>
              `,
            ],
            [
              Tab.Items,
              () => html`
                <sl-button
                  size="small"
                  @click=${() => (this.openDialogName = "editItems")}
                  ?disabled=${!this.collection}
                >
                  <sl-icon name="ui-checks" slot="prefix"></sl-icon>
                  ${msg("Select Items")}
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

      <btrix-collection-edit-dialog
        .collection=${this.collection}
        .tab=${this.editTab ?? "about"}
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
        ?replayLoaded=${this.isRwpLoaded}
      ></btrix-collection-edit-dialog>
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
      <sl-button-group>
        <sl-button
          variant="primary"
          size="small"
          @click=${() => {
            this.openDialogName = "edit";
          }}
        >
          <sl-icon name="pencil" slot="prefix"></sl-icon>
          ${msg("Edit Collection")}
        </sl-button>
      </sl-button-group>
      <sl-dropdown distance="4">
        <sl-button slot="trigger" size="small" caret
          >${msg("Actions")}</sl-button
        >
        <sl-menu>
          <sl-menu-item @click=${() => (this.openDialogName = "edit")}>
            <sl-icon name="pencil" slot="prefix"></sl-icon>
            ${msg("Edit Collection")}
          </sl-menu-item>
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
              this.editTab = "homepage";
            }}
            ?disabled=${!this.collection?.crawlCount}
          >
            <sl-icon name="gear" slot="prefix"></sl-icon>
            ${msg("Configure Replay View")}
          </sl-menu-item>
          <sl-menu-item
            @click=${async () => {
              if (this.collectionTab !== Tab.About) {
                this.navigate.to(
                  `${this.navigate.orgBasePath}/collections/view/${this.collectionId}/${Tab.About}`,
                );
                await this.updateComplete;
              }

              this.isEditingDescription = true;
            }}
          >
            <sl-icon name="pencil-square" slot="prefix"></sl-icon>
            ${msg("Edit About Section")}
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
            ?disabled=${!this.collection?.totalSize}
          >
            <sl-icon name="cloud-download" slot="prefix"></sl-icon>
            ${msg("Download Collection")}
            ${when(
              this.collection,
              (collection) => html`
                <btrix-badge
                  slot="suffix"
                  class="font-monostyle text-xs text-neutral-500"
                  >${this.localize.bytes(
                    collection.totalSize || 0,
                  )}</btrix-badge
                >
              `,
            )}
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
        ${when(this.collection?.created, (created) =>
          // Collections created before 49516bc4 is released may not have date in db
          created
            ? this.renderDetailItem(
                msg("Date Created"),
                () =>
                  html`<btrix-format-date
                    date=${created}
                    month="long"
                    day="numeric"
                    year="numeric"
                    hour="numeric"
                    minute="numeric"
                  ></btrix-format-date>`,
              )
            : nothing,
        )}
        ${this.renderDetailItem(
          msg("Last Updated"),
          (col) =>
            html`<btrix-format-date
              date=${col.modified}
              month="long"
              day="numeric"
              year="numeric"
              hour="numeric"
              minute="numeric"
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

  // TODO Consolidate with collection.ts
  private renderAbout() {
    const dateRange = (collection: Collection) => {
      if (!collection.dateEarliest || !collection.dateLatest) {
        return msg("n/a");
      }
      const format: Intl.DateTimeFormatOptions = {
        month: "long",
        year: "numeric",
      };
      const dateEarliest = this.localize.date(collection.dateEarliest, format);
      const dateLatest = this.localize.date(collection.dateLatest, format);

      if (dateEarliest === dateLatest) return dateLatest;

      return msg(str`${dateEarliest} to ${dateLatest}`, {
        desc: "Date range formatted to show full month name and year",
      });
    };
    const skeleton = html`<sl-skeleton class="w-24"></sl-skeleton>`;

    const metadata = html`
      <btrix-desc-list>
        <btrix-desc-list-item label=${msg("Collection Period")}>
          <span class="font-sans"
            >${this.collection ? dateRange(this.collection) : skeleton}</span
          >
        </btrix-desc-list-item>
      </btrix-desc-list>
    `;

    return html`
      <div class="flex flex-1 flex-col gap-10 lg:flex-row">
        <section class="flex w-full max-w-4xl flex-col leading-relaxed">
          <header class="mb-3 flex min-h-8 items-end justify-between">
            <h2 class="text-base font-semibold leading-none">
              ${msg("Description")}
            </h2>
            ${when(
              this.collection?.description && !this.isEditingDescription,
              () => html`
                <sl-button
                  size="small"
                  @click=${() => (this.isEditingDescription = true)}
                >
                  <sl-icon name="pencil" slot="prefix"></sl-icon>
                  ${msg("Edit Description")}
                </sl-button>
              `,
            )}
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
                              <p class="mb-3">
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
        <section class="flex-1">
          <btrix-section-heading>
            <h2>${msg("Metadata")}</h2>
          </btrix-section-heading>
          <div class="mt-5">${metadata}</div>
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
