import { localized, msg, str } from "@lit/localize";
import type { SlSelectEvent } from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { guard } from "lit/directives/guard.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { PageChangeEvent } from "@/components/ui/pagination";
import { ClipboardController } from "@/controllers/clipboard";
import { SelectCollectionAccess } from "@/features/collections/select-collection-access";
import { pageNav, type Breadcrumb } from "@/layouts/pageHeader";
import { RouteNamespace } from "@/routes";
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
const DESCRIPTION_MAX_HEIGHT_PX = 200;
const INITIAL_ITEMS_PAGE_SIZE = 20;
const TABS = ["replay", "items"] as const;
export type Tab = (typeof TABS)[number];

@localized()
@customElement("btrix-collection-detail")
export class CollectionDetail extends BtrixElement {
  @property({ type: String })
  collectionId!: string;

  @property({ type: String })
  collectionTab?: Tab = TABS[0];

  @state()
  private collection?: Collection;

  @state()
  private archivedItems?: APIPaginatedList<ArchivedItem>;

  @state()
  private openDialogName?: "delete" | "editMetadata" | "editItems";

  @state()
  private isDescriptionExpanded = false;

  @state()
  private showShareSettings = false;

  @state()
  private showEmbedCode = false;

  @query(".description")
  private readonly description?: HTMLElement | null;

  @query(".descriptionExpandBtn")
  private readonly descriptionExpandBtn?: HTMLElement | null;

  @query("replay-web-page")
  private readonly replayEmbed?: ReplayWebPage | null;

  // Use to cancel requests
  private getArchivedItemsController: AbortController | null = null;

  private readonly clipboardController = new ClipboardController(this);

  private readonly tabLabels: Record<
    Tab,
    { icon: { name: string; library: string }; text: string }
  > = {
    replay: {
      icon: { name: "replaywebpage", library: "app" },
      text: msg("Replay"),
    },
    items: {
      icon: { name: "list-ul", library: "default" },
      text: msg("Archived Items"),
    },
  };

  private get shareLink() {
    return `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}/${RouteNamespace.PublicOrgs}/${this.orgSlug}/collections/${this.collectionId}`;
  }

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
    if (changedProperties.has("collection") && this.collection) {
      void this.checkTruncateDescription();
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
        ${when(this.collection, (collection) =>
          collection.access === CollectionAccess.Private
            ? html`
                <sl-button
                  variant=${collection.crawlCount ? "primary" : "default"}
                  size="small"
                  @click=${() => (this.showShareSettings = true)}
                >
                  <sl-icon name="box-arrow-up" slot="prefix"></sl-icon>
                  ${msg("Share")}
                </sl-button>
              `
            : html`
                <sl-button-group>
                  <sl-tooltip
                    content=${this.clipboardController.isCopied
                      ? ClipboardController.text.copied
                      : collection.access === CollectionAccess.Unlisted
                        ? msg("Copy unlisted link")
                        : msg("Copy public link")}
                  >
                    <sl-button
                      variant=${collection.crawlCount ? "primary" : "default"}
                      size="small"
                      @click=${() => {
                        void this.clipboardController.copy(this.shareLink);
                      }}
                    >
                      <sl-icon
                        name=${this.clipboardController.isCopied
                          ? "check-lg"
                          : "link-45deg"}
                      >
                      </sl-icon>
                      ${msg("Copy Link")}
                    </sl-button>
                  </sl-tooltip>
                  <sl-dropdown distance="4" placement="bottom-end">
                    <sl-button
                      slot="trigger"
                      size="small"
                      variant=${collection.crawlCount ? "primary" : "default"}
                      caret
                    >
                    </sl-button>
                    <sl-menu>
                      <sl-menu-item
                        @click=${() => {
                          this.showEmbedCode = true;
                          this.showShareSettings = true;
                        }}
                      >
                        <sl-icon slot="prefix" name="code-slash"></sl-icon>
                        ${msg("View Embed Code")}
                      </sl-menu-item>
                      <btrix-menu-item-link href=${this.shareLink}>
                        ${collection.access === CollectionAccess.Unlisted
                          ? html`
                              <sl-icon
                                slot="prefix"
                                name=${SelectCollectionAccess.Options.unlisted
                                  .icon}
                              ></sl-icon>
                              ${msg("View Unlisted Page")}
                            `
                          : html`
                              <sl-icon
                                slot="prefix"
                                name=${SelectCollectionAccess.Options.public
                                  .icon}
                              ></sl-icon>
                              ${msg("View Public Page")}
                            `}
                      </btrix-menu-item-link>
                      <sl-divider></sl-divider>
                      <sl-menu-item
                        @click=${() => {
                          this.showShareSettings = true;
                        }}
                      >
                        <sl-icon slot="prefix" name="eye-fill"></sl-icon>
                        ${msg("Change Link Visibility")}
                      </sl-menu-item>
                    </sl-menu>
                  </sl-dropdown>
                </sl-button-group>
              `,
        )}
        ${when(this.isCrawler, this.renderActions)}
      </header>
      <div class="mb-3 rounded-lg border px-4 py-2">
        ${this.renderInfoBar()}
      </div>
      <div class="mb-3 flex items-center justify-between">
        ${this.renderTabs()}
        ${when(
          this.isCrawler,
          () => html`
            <sl-button
              variant=${!this.collection || this.collection.crawlCount
                ? "default"
                : "primary"}
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
      ${choose(
        this.collectionTab,
        [
          ["replay", () => guard([this.collection], this.renderReplay)],
          [
            "items",
            () => guard([this.archivedItems], this.renderArchivedItems),
          ],
        ],

        () => html`<btrix-not-found></btrix-not-found>`,
      )}
      <div class="my-7">${this.renderDescription()}</div>

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
      )}
      ${this.renderShareDialog()}`;
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

  private getPublicReplaySrc() {
    return new URL(
      `/api/orgs/${this.orgId}/collections/${this.collectionId}/public/replay.json`,
      window.location.href,
    ).href;
  }

  private renderShareDialog() {
    return html`
      <btrix-dialog
        .label=${msg(str`Share “${this.collection?.name}”`)}
        .open=${this.showShareSettings}
        @sl-hide=${() => {
          this.showShareSettings = false;
          this.showEmbedCode = false;
        }}
        style="--width: 32rem;"
      >
        <div class="mb-5">
          ${when(
            this.collection,
            (collection) => html`
              <btrix-select-collection-access
                value=${ifDefined(collection.access)}
                ?readOnly=${!this.isCrawler}
                @sl-select=${(e: SlSelectEvent) =>
                  void this.updateVisibility(
                    (e.target as SelectCollectionAccess).value,
                  )}
              ></btrix-select-collection-access>
            `,
          )}
        </div>
        ${this.renderShareLink()} ${this.renderEmbedCode()}
        <div slot="footer" class="flex justify-end gap-2">
          <sl-button
            size="small"
            @click=${() => (this.showShareSettings = false)}
          >
            ${msg("Done")}
          </sl-button>
        </div>
      </btrix-dialog>
    `;
  }

  private readonly renderShareLink = () => {
    return html`
      <btrix-details
        ?open=${!this.showEmbedCode &&
        this.collection &&
        this.collection.access !== CollectionAccess.Private}
      >
        <span slot="title">${msg("Link to Share")}</span>
        <btrix-copy-field
          class="my-3"
          .value="${this.shareLink}"
          hideContentFromScreenReaders
          hoist
        >
          <sl-tooltip slot="prefix" content=${msg("Open in New Tab")} hoist>
            <sl-icon-button
              href=${this.shareLink}
              name="box-arrow-up-right"
              target="_blank"
              class="m-px"
            >
            </sl-icon-button>
          </sl-tooltip>
        </btrix-copy-field>
      </btrix-details>
    `;
  };

  private readonly renderEmbedCode = () => {
    const replaySrc = this.getPublicReplaySrc();
    const embedCode = `<replay-web-page source="${replaySrc}"></replay-web-page>`;
    const importCode = `importScripts("https://replayweb.page/sw.js");`;

    return html`
      <btrix-details ?open=${this.showEmbedCode}>
        <span slot="title">${msg("Embed Code")}</span>
        ${when(
          this.collection?.access === CollectionAccess.Private,
          () => html`
            <btrix-alert variant="warning" class="my-3">
              ${msg("Change the visibility setting to embed this collection.")}
            </btrix-alert>
          `,
        )}
        <p class="my-3">
          ${msg(
            html`To embed this collection into an existing webpage, add the
            following embed code:`,
          )}
        </p>
        <div class="relative mb-5 rounded border bg-slate-50 p-3 pr-9">
          <btrix-code value=${embedCode}></btrix-code>
          <div class="absolute right-1 top-1">
            <btrix-copy-button
              .getValue=${() => embedCode}
              content=${msg("Copy Embed Code")}
              hoist
              raised
            ></btrix-copy-button>
          </div>
        </div>
        <p class="mb-3">
          ${msg(
            html`Add the following JavaScript to your
              <code class="text-[0.9em]">/replay/sw.js</code>:`,
          )}
        </p>
        <div class="relative mb-5 rounded border bg-slate-50 p-3 pr-9">
          <btrix-code language="javascript" value=${importCode}></btrix-code>
          <div class="absolute right-1 top-1">
            <btrix-copy-button
              .getValue=${() => importCode}
              content=${msg("Copy JS")}
              hoist
              raised
            ></btrix-copy-button>
          </div>
        </div>
        <p>
          ${msg(
            html`See
              <a
                class="text-primary"
                href="https://replayweb.page/docs/embedding"
                target="_blank"
              >
                our embedding guide</a
              >
              for more details.`,
          )}
        </p>
      </btrix-details>
    `;
  };

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
        ${TABS.map((tabName) => {
          const isSelected = tabName === this.collectionTab;
          return html`
            <btrix-navigation-button
              .active=${isSelected}
              aria-selected="${isSelected}"
              href=${`${this.navigate.orgBasePath}/collections/view/${this.collectionId}/${tabName}`}
              @click=${this.navigate.link}
            >
              <sl-icon
                name=${this.tabLabels[tabName].icon.name}
                library=${this.tabLabels[tabName].icon.library}
              ></sl-icon>
              ${this.tabLabels[tabName].text}</btrix-navigation-button
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
            <sl-icon name="pencil" slot="prefix"></sl-icon>
            ${msg("Edit Metadata")}
          </sl-menu-item>
          <sl-menu-item @click=${() => (this.openDialogName = "editItems")}>
            <sl-icon name="ui-checks" slot="prefix"></sl-icon>
            ${msg("Select Archived Items")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-item
            @click=${() => {
              this.showShareSettings = true;
            }}
          >
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
        ${this.renderDetailItem(
          msg("Total Size"),
          (col) =>
            html`<sl-format-bytes
              value=${col.totalSize || 0}
              display="narrow"
            ></sl-format-bytes>`,
        )}
        ${this.renderDetailItem(
          msg("Total Pages"),
          (col) =>
            `${this.localize.number(col.pageCount)} ${pluralOf("pages", col.pageCount)}`,
        )}
        ${this.renderDetailItem(
          msg("Last Updated"),
          (col) =>
            html`<sl-format-date
              date=${col.modified}
              month="2-digit"
              day="2-digit"
              year="2-digit"
              hour="2-digit"
              minute="2-digit"
            ></sl-format-date>`,
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
        <header class="flex items-center justify-between">
          <h2 class="mb-1 h-8 min-h-fit text-lg font-semibold leading-none">
            ${msg("Description")}
          </h2>
          ${when(
            this.isCrawler,
            () => html`
              <sl-icon-button
                class="text-base"
                name="pencil"
                @click=${() => (this.openDialogName = "editMetadata")}
                label=${msg("Edit description")}
              ></sl-icon-button>
            `,
          )}
        </header>
        <main>
          ${when(
            this.collection,
            () => html`
              <main class="rounded-lg border">
                ${this.collection?.description
                  ? html`<div
                        class="description mx-auto max-w-prose overflow-hidden py-5 transition-all"
                        style=${`max-height: ${DESCRIPTION_MAX_HEIGHT_PX}px`}
                      >
                        <btrix-markdown-viewer
                          value=${this.collection.description}
                        ></btrix-markdown-viewer>
                      </div>
                      <div
                        role="button"
                        class="descriptionExpandBtn hidden border-t p-2 text-right font-medium text-neutral-500 transition-colors hover:bg-neutral-50"
                        @click=${this.toggleTruncateDescription}
                      >
                        <span class="mr-1 inline-block align-middle"
                          >${this.isDescriptionExpanded
                            ? msg("Less")
                            : msg("More")}</span
                        >
                        <sl-icon
                          class="inline-block align-middle text-base"
                          name=${this.isDescriptionExpanded
                            ? "chevron-double-up"
                            : "chevron-double-down"}
                        ></sl-icon>
                      </div> `
                  : html`<div class="p-5 text-center text-neutral-400">
                      ${msg("No description added.")}
                    </div>`}
              </main>
            `,
            () =>
              html`<div
                class="flex items-center justify-center rounded border text-3xl"
                style=${`max-height: ${DESCRIPTION_MAX_HEIGHT_PX}px`}
              >
                <sl-spinner></sl-spinner>
              </div>`,
          )}
        </main>
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
      <div class="rounded border p-5">
        <p class="text-center text-neutral-500">
          ${this.archivedItems?.page && this.archivedItems.page > 1
            ? msg("Page not found.")
            : msg("This Collection doesn’t have any archived items, yet.")}
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

  private async checkTruncateDescription() {
    await this.updateComplete;

    window.requestAnimationFrame(() => {
      if (
        this.description?.scrollHeight ??
        0 > (this.description?.clientHeight ?? 0)
      ) {
        this.descriptionExpandBtn?.classList.remove("hidden");
      }
    });
  }

  private readonly toggleTruncateDescription = () => {
    const description = this.description;
    if (!description) {
      console.debug("no .description");
      return;
    }
    this.isDescriptionExpanded = !this.isDescriptionExpanded;
    if (this.isDescriptionExpanded) {
      description.style.maxHeight = `${description.scrollHeight}px`;
    } else {
      description.style.maxHeight = `${DESCRIPTION_MAX_HEIGHT_PX}px`;
      description.closest("section")?.scrollIntoView({
        behavior: "smooth",
      });
    }
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
        message: msg("Updated collection visibility."),
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
      });
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't delete Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
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
      });
    }
  }
}
