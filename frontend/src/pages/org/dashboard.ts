import { localized, msg } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import type {
  SlChangeEvent,
  SlRadioGroup,
  SlSelectEvent,
} from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { SelectNewDialogEvent } from ".";

import { BtrixElement } from "@/classes/BtrixElement";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { type CollectionSavedEvent } from "@/features/collections/collection-edit-dialog";
import { colors } from "@/features/meters/colors";
import { pageHeading } from "@/layouts/page";
import { pageHeader } from "@/layouts/pageHeader";
import { RouteNamespace } from "@/routes";
import type { APIPaginatedList, APISortQuery } from "@/types/api";
import { CollectionAccess, type Collection } from "@/types/collection";
import { type Metrics } from "@/types/org";
import { SortDirection } from "@/types/utils";
import { richText } from "@/utils/rich-text";
import { tw } from "@/utils/tailwind";
import { timeoutCache } from "@/utils/timeoutCache";
import { toShortUrl } from "@/utils/url-helpers";
import { cached } from "@/utils/weakCache";

enum CollectionGridView {
  All = "all",
  Public = "public",
}

const PAGE_SIZE = 16;

@customElement("btrix-dashboard")
@localized()
export class Dashboard extends BtrixElement {
  @property({ type: Boolean })
  isCrawler?: boolean;

  @state()
  private metrics?: Metrics;

  @state()
  collectionRefreshing: string | null = null;

  @state()
  collectionsView = CollectionGridView.Public;

  @state()
  collectionPage = parsePage(new URLSearchParams(location.search).get("page"));

  // Used for busting cache when updating visible collection
  cacheBust = 0;

  private readonly collections = new Task(this, {
    task: cached(
      async ([orgId, collectionsView, collectionPage]) => {
        if (!orgId) throw new Error("orgId required");

        const collections = await this.getCollections({
          orgId,
          access:
            collectionsView === CollectionGridView.Public
              ? CollectionAccess.Public
              : undefined,
          page: collectionPage,
        });
        this.collectionRefreshing = null;
        return collections;
      },
      { cacheConstructor: timeoutCache(300) },
    ),
    args: () =>
      [
        this.orgId,
        this.collectionsView,
        this.collectionPage,
        this.cacheBust,
      ] as const,
  });

  willUpdate(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (changedProperties.has("appState.orgSlug") && this.orgId) {
      void this.fetchMetrics();
    }
  }

  firstUpdated() {
    if (this.orgId) {
      void this.fetchMetrics();
    }
  }

  render() {
    const quotaReached =
      this.metrics &&
      this.metrics.storageQuotaBytes > 0 &&
      this.metrics.storageUsedBytes >= this.metrics.storageQuotaBytes;

    return html`
      ${pageHeader({
        title: this.userOrg?.name,
        secondary: html`
          ${when(
            this.org?.publicDescription,
            (publicDescription) => html`
              <div class="text-pretty text-stone-600">
                ${richText(publicDescription)}
              </div>
            `,
          )}
          ${when(this.org?.publicUrl, (urlStr) => {
            let url: URL;
            try {
              url = new URL(urlStr);
            } catch {
              return nothing;
            }

            return html`
              <div
                class="flex items-center gap-1.5 text-pretty text-neutral-700"
              >
                <sl-icon
                  name="globe"
                  class="size-4 text-stone-400"
                  label=${msg("Website")}
                ></sl-icon>
                <a
                  class="truncate font-medium leading-none text-stone-500 transition-colors hover:text-stone-600"
                  href="${url.href}"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  ${toShortUrl(url.href, null)}
                </a>
              </div>
            `;
          })}
        `,
        actions: html`
          ${when(
            this.appState.isAdmin,
            () =>
              html`<sl-tooltip content=${msg("Edit Org Settings")}>
                <sl-icon-button
                  href=${`${this.navigate.orgBasePath}/settings`}
                  class="size-8 text-base"
                  name="gear"
                  @click=${this.navigate.link}
                ></sl-icon-button>
              </sl-tooltip>`,
          )}
          ${when(
            this.isCrawler,
            () =>
              html` <sl-dropdown
                distance="4"
                placement="bottom-end"
                @sl-select=${(e: SlSelectEvent) => {
                  const { value } = e.detail.item;

                  if (value === "workflow") {
                    this.navigate.to(
                      `${this.navigate.orgBasePath}/workflows/new`,
                    );
                  } else {
                    this.dispatchEvent(
                      new CustomEvent("select-new-dialog", {
                        detail: e.detail.item.value,
                      }) as SelectNewDialogEvent,
                    );
                  }
                }}
              >
                <sl-button
                  slot="trigger"
                  size="small"
                  variant="primary"
                  caret
                  ?disabled=${this.org?.readOnly}
                >
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                  ${msg("Create New...")}
                </sl-button>
                <sl-menu>
                  <sl-menu-item value="workflow"
                    >${msg("Crawl Workflow")}</sl-menu-item
                  >
                  <sl-menu-item
                    value="upload"
                    ?disabled=${!this.metrics || quotaReached}
                    >${msg("Upload")}</sl-menu-item
                  >
                  <sl-menu-item value="collection">
                    ${msg("Collection")}
                  </sl-menu-item>
                  <sl-menu-item
                    value="browser-profile"
                    ?disabled=${!this.metrics || quotaReached}
                  >
                    ${msg("Browser Profile")}
                  </sl-menu-item>
                </sl-menu>
              </sl-dropdown>`,
          )}
        `,
        classNames: tw`border-b-transparent lg:mb-2`,
      })}
      <main>
        <div class="mb-10 flex flex-col gap-6 md:flex-row">
          ${this.renderCard(
            msg("Storage"),
            (metrics) => html`
              ${this.renderStorageMeter(metrics)}
              <dl>
                ${this.renderStat({
                  value: metrics.crawlCount,
                  secondaryValue: this.localize.bytes(
                    metrics.storageUsedCrawls,
                  ),
                  singleLabel: msg("Crawl"),
                  pluralLabel: msg("Crawls"),

                  iconProps: {
                    name: "gear-wide-connected",
                    class: colors.crawls,
                  },
                  button: {
                    url: "/items/crawl",
                  },
                })}
                ${this.renderStat({
                  value: metrics.uploadCount,
                  secondaryValue: this.localize.bytes(
                    metrics.storageUsedUploads,
                  ),
                  singleLabel: msg("Upload"),
                  pluralLabel: msg("Uploads"),

                  iconProps: { name: "upload", class: colors.uploads },
                  button: {
                    url: "/items/upload",
                  },
                })}
                ${this.renderStat({
                  value: metrics.profileCount,
                  secondaryValue: this.localize.bytes(
                    metrics.storageUsedProfiles,
                  ),
                  singleLabel: msg("Browser Profile"),
                  pluralLabel: msg("Browser Profiles"),
                  iconProps: {
                    name: "window-fullscreen",
                    class: colors.browserProfiles,
                  },
                  button: {
                    url: "/browser-profiles",
                  },
                })}
                ${metrics.storageUsedSeedFiles || metrics.storageUsedThumbnails
                  ? this.renderMiscStorage(metrics)
                  : nothing}

                <sl-divider class="my-4"></sl-divider>
                ${this.renderStat({
                  value: metrics.archivedItemCount,
                  singleLabel: msg("Archived Item"),
                  pluralLabel: msg("Archived Items"),
                  iconProps: {
                    name: "file-zip-fill",
                    class: colors.archivedItems,
                  },
                  button: {
                    url: "/items",
                  },
                })}
                ${when(
                  metrics.storageUsedBytes && !metrics.storageQuotaBytes,
                  () => html`
                    ${this.renderStat({
                      value: this.localize.bytes(metrics.storageUsedBytes, {
                        compactDisplay: "short",
                      }),
                      singleLabel: msg("Total"),
                      iconProps: {
                        name: "database-fill",
                      },
                    })}
                  `,
                )}
              </dl>
            `,
          )}
          ${this.renderCard(
            msg("Crawling"),
            (metrics) => html`
              ${this.renderCrawlingMeter(metrics)}
              <dl>
                ${this.renderStat({
                  value:
                    metrics.workflowsRunningCount && metrics.maxConcurrentCrawls
                      ? `${metrics.workflowsRunningCount} / ${metrics.maxConcurrentCrawls}`
                      : metrics.workflowsRunningCount,
                  singleLabel: msg("Crawl Running"),
                  pluralLabel: msg("Crawls Running"),
                  iconProps: {
                    name: "dot",
                    library: "app",
                    class: metrics.workflowsRunningCount
                      ? tw`animate-pulse text-green-600`
                      : tw`text-neutral-600`,
                  },
                  button: {
                    url: "/workflows?isCrawlRunning=true",
                  },
                })}
                ${this.renderStat({
                  value: metrics.workflowsQueuedCount,
                  singleLabel: msg("Crawl Workflow Waiting"),
                  pluralLabel: msg("Crawl Workflows Waiting"),
                  iconProps: {
                    name: "hourglass-split",
                    class: tw`text-violet-600`,
                  },
                })}
                <sl-divider class="my-4"></sl-divider>
                ${this.renderStat({
                  value: metrics.crawlPageCount,
                  singleLabel: msg("Page Crawled"),
                  pluralLabel: msg("Pages Crawled"),
                  iconProps: {
                    name: "file-richtext-fill",
                    class: colors.crawls,
                  },
                })}
                ${this.renderStat({
                  value: metrics.uploadPageCount,
                  singleLabel: msg("Page Uploaded"),
                  pluralLabel: msg("Pages Uploaded"),
                  iconProps: {
                    name: "file-richtext-fill",
                    class: colors.uploads,
                  },
                })}
                ${this.renderStat({
                  value: metrics.pageCount,
                  singleLabel: msg("Page Total"),
                  pluralLabel: msg("Pages Total"),
                  iconProps: { name: "file-richtext-fill" },
                })}
              </dl>
            `,
          )}
          ${this.renderCard(
            msg("Collections"),
            (metrics) => html`
              <dl>
                ${this.renderStat({
                  value: metrics.collectionsCount,
                  singleLabel: msg("Collection Total"),
                  pluralLabel: msg("Collections Total"),
                  iconProps: { name: "collection-fill" },
                  button: {
                    url: "/collections",
                  },
                })}
                ${this.renderStat({
                  value: metrics.publicCollectionsCount,
                  singleLabel: msg("Shareable Collection"),
                  pluralLabel: msg("Shareable Collections"),
                  iconProps: {
                    name: "people-fill",
                    class: tw`text-emerald-600`,
                  },
                })}
              </dl>
            `,
          )}
        </div>

        <section class="mb-16">
          <header class="mb-1.5 flex items-center justify-between">
            <div class="flex items-center gap-2">
              ${pageHeading({
                content:
                  this.collectionsView === CollectionGridView.Public
                    ? msg("Public Collections")
                    : msg("All Collections"),
              })}
              ${
                this.collectionsView === CollectionGridView.Public
                  ? html` <span class="text-sm text-neutral-400"
                      >—
                      <a
                        href=${`/${RouteNamespace.PublicOrgs}/${this.orgSlugState}`}
                        class="inline-flex h-8 items-center text-sm font-medium text-primary-500 transition hover:text-primary-600"
                        @click=${this.navigate.link}
                      >
                        ${this.org?.enablePublicProfile
                          ? msg("Visit public collections gallery")
                          : msg("Preview public collections gallery")}
                      </a>
                      <!-- TODO Refactor clipboard code, get URL in a nicer way? -->
                      ${this.org?.enablePublicProfile
                        ? html`<btrix-copy-button
                            value=${new URL(
                              `/${RouteNamespace.PublicOrgs}/${this.orgSlugState}`,
                              window.location.toString(),
                            ).toString()}
                            content=${msg(
                              "Copy Link to Public Collections Gallery",
                            )}
                            class="inline-block"
                          ></btrix-copy-button>`
                        : nothing}
                    </span>`
                  : nothing
              }
            </div>
            <div class="flex items-center gap-2">
              ${when(
                this.appState.isCrawler,
                () => html`
                  <sl-tooltip content=${msg("Manage Collections")}>
                    <sl-icon-button
                      href=${`${this.navigate.orgBasePath}/collections`}
                      class="size-8 text-base"
                      name="collection"
                      @click=${this.navigate.link}
                    ></sl-icon-button>
                  </sl-tooltip>
                `,
              )}

              <sl-radio-group
                value=${this.collectionsView}
                size="small"
                @sl-change=${(e: SlChangeEvent) => {
                  this.collectionPage = 1;
                  this.collectionsView = (e.target as SlRadioGroup)
                    .value as CollectionGridView;
                }}
              >
                <sl-tooltip content=${msg("Public Collections")}>
                  <sl-radio-button pill value=${CollectionGridView.Public}>
                    <sl-icon
                      name="globe"
                      label=${msg("Public Collections")}
                    ></sl-icon> </sl-radio-button
                ></sl-tooltip>
                <sl-tooltip content=${msg("All Collections")}>
                  <sl-radio-button pill value=${CollectionGridView.All}>
                    <sl-icon
                      name="asterisk"
                      label=${msg("All Collections")}
                    ></sl-icon> </sl-radio-button
                ></sl-tooltip>
              </sl-radio-group>
            </div>
          </header>
          <div class="relative rounded-lg border p-10">
            <btrix-collections-grid-with-edit-dialog
              .collections=${this.collections.value?.items}
              .collectionRefreshing=${this.collectionRefreshing}
              ?showVisibility=${this.collectionsView === CollectionGridView.All}
              @btrix-collection-saved=${async (e: CollectionSavedEvent) => {
                this.collectionRefreshing = e.detail.id;
                void this.collections.run([
                  this.orgId,
                  this.collectionsView,
                  this.collectionPage,
                  ++this.cacheBust,
                ]);
              }}
            >
              ${this.renderNoPublicCollections()}
              <span slot="empty-text"
                >${
                  this.collectionsView === CollectionGridView.Public
                    ? msg("No public collections yet.")
                    : msg("No collections yet.")
                }</span
              >
              ${
                this.collections.value &&
                this.collections.value.total >
                  this.collections.value.items.length
                  ? html`
                      <btrix-pagination
                        page=${this.collectionPage}
                        size=${PAGE_SIZE}
                        totalCount=${this.collections.value.total}
                        @page-change=${(e: PageChangeEvent) => {
                          this.collectionPage = e.detail.page;
                        }}
                        slot="pagination"
                      >
                      </btrix-pagination>
                    `
                  : nothing
              }
            </btrix-collections-grid>
            ${
              this.collections.status === TaskStatus.PENDING &&
              this.collections.value
                ? html`<div
                    class="absolute inset-0 rounded-lg bg-stone-50/75 p-24 text-center text-4xl"
                  >
                    <sl-spinner></sl-spinner>
                  </div>`
                : nothing
            }
          </div>
        </section>
      </main>
    `;
  }

  private renderMiscStorage(metrics: Metrics) {
    return html`
      <div class="mb-2 flex items-center gap-2 last:mb-0">
        <dt class="mr-auto flex items-center tabular-nums">
          <sl-icon
            class=${clsx(tw`mr-2 text-base`, colors.misc)}
            name="box2"
          ></sl-icon>
          ${msg("Miscellaneous")}
          <btrix-popover
            content=${msg(
              "Total size of all supplementary files in use by your organization, such as workflow URL list files and custom collection thumbnails.",
            )}
          >
            <sl-icon
              name="info-circle"
              class="ml-1.5 text-neutral-500"
            ></sl-icon>
          </btrix-popover>
        </dt>
        <dd class="font-monostyle text-xs text-neutral-500">
          ${this.localize.bytes(
            metrics.storageUsedSeedFiles + metrics.storageUsedThumbnails,
          )}
        </dd>
      </div>
    `;
  }

  private renderNoPublicCollections() {
    if (!this.org || !this.metrics) return;

    let button: TemplateResult;

    if (this.metrics.collectionsCount) {
      button = html`
        <sl-button
          @click=${() => {
            this.navigate.to(`${this.navigate.orgBasePath}/collections`);
          }}
        >
          <sl-icon slot="prefix" name="collection-fill"></sl-icon>
          ${msg("Manage Collections")}
        </sl-button>
      `;
    } else {
      button = html`
        <sl-button
          @click=${() => {
            this.dispatchEvent(
              new CustomEvent("select-new-dialog", {
                detail: "collection",
              }) as SelectNewDialogEvent,
            );
          }}
        >
          <sl-icon slot="prefix" name="plus-lg"></sl-icon>
          ${msg("Create a Collection")}
        </sl-button>
      `;
    }

    return html`<div slot="empty-actions">${button}</div>`;
  }

  private renderStorageMeter(metrics: Metrics) {
    return html`<btrix-storage-meter
      .metrics=${metrics}
    ></btrix-storage-meter>`;
  }

  private renderCrawlingMeter(metrics: Metrics) {
    return html`<btrix-execution-minute-meter
      .metrics=${metrics}
    ></btrix-execution-minute-meter>`;
  }

  private renderCard(
    title: string,
    renderContent: (metric: Metrics) => TemplateResult,
    renderFooter?: (metric: Metrics) => TemplateResult,
  ) {
    return html`
      <btrix-card class="flex-1">
        <span slot="title">${title}</span>
        ${when(
          this.metrics,
          () => renderContent(this.metrics!),
          this.renderCardSkeleton,
        )}
        ${when(
          renderFooter && this.metrics,
          () => html`<div slot="footer">${renderFooter!(this.metrics!)}</div>`,
        )}
      </btrix-card>
    `;
  }

  private renderStat(stat: {
    value: number | string | TemplateResult | null;
    secondaryValue?: number | string | TemplateResult;
    button?: { label?: string | TemplateResult; url: string };
    singleLabel: string;
    pluralLabel?: string;
    iconProps: { name: string; library?: string; class?: string };
  }) {
    const { value, iconProps } = stat;
    return html`
      <div class="mb-2 flex items-center gap-2 last:mb-0">
        <div class="mr-auto flex items-center tabular-nums">
          <sl-icon
            class=${clsx(
              "mr-2 text-base",
              iconProps.class ?? "text-neutral-600",
            )}
            name=${iconProps.name}
            library=${ifDefined(iconProps.library)}
          ></sl-icon>
          <dt class="order-last">
            ${value === 1
              ? stat.singleLabel
              : stat.pluralLabel ?? stat.singleLabel}
          </dt>
          <dd class="mr-1">
            ${typeof value === "number" ? this.localize.number(value) : value}
          </dd>
        </div>
        ${when(
          stat.secondaryValue,
          () => html`
            <div class="font-monostyle text-xs text-neutral-500">
              ${stat.secondaryValue}
            </div>
          `,
        )}
        ${when(
          stat.button,
          (button) =>
            html`<btrix-button
              size="x-small"
              href=${`${this.navigate.orgBasePath}${button.url}`}
              @click=${this.navigate.link}
              >${button.label ??
              html`<sl-tooltip content=${msg("View All")} placement="right"
                ><sl-icon name="arrow-right-circle"></sl-icon
              ></sl-tooltip>`}</btrix-button
            >`,
        )}
      </div>
    `;
  }

  private readonly renderCardSkeleton = () => html`
    <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
    <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
    <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
    <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
  `;

  private async fetchMetrics() {
    try {
      const data = await this.api.fetch<Metrics | undefined>(
        `/orgs/${this.orgId}/metrics`,
      );

      this.metrics = data;
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve org metrics at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "metrics-retrieve-error",
      });
    }
  }

  private async getCollections({
    orgId,
    access,
    page,
  }: {
    orgId: string;
    access?: CollectionAccess;
    page?: number;
  }) {
    const params: APISortQuery<Collection> & {
      access?: CollectionAccess;
      page?: number;
      pageSize?: number;
    } = {
      sortBy: "dateLatest",
      sortDirection: SortDirection.Descending,
      access,
      page,
      pageSize: PAGE_SIZE,
    };
    const query = queryString.stringify(params);

    const data = await this.api.fetch<APIPaginatedList<Collection>>(
      `/orgs/${orgId}/collections?${query}`,
    );

    return data;
  }
}
