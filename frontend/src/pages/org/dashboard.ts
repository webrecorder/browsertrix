import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlSelectEvent } from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { SelectNewDialogEvent } from ".";

import { BtrixElement } from "@/classes/BtrixElement";
import { ClipboardController } from "@/controllers/clipboard";
import { pageHeading } from "@/layouts/page";
import { pageHeader } from "@/layouts/pageHeader";
import { RouteNamespace } from "@/routes";
import type { APIPaginatedList, APISortQuery } from "@/types/api";
import { CollectionAccess, type Collection } from "@/types/collection";
import { SortDirection } from "@/types/utils";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";
import { tw } from "@/utils/tailwind";

type Metrics = {
  storageUsedBytes: number;
  storageUsedCrawls: number;
  storageUsedUploads: number;
  storageUsedProfiles: number;
  storageQuotaBytes: number;
  archivedItemCount: number;
  crawlCount: number;
  uploadCount: number;
  pageCount: number;
  crawlPageCount: number;
  uploadPageCount: number;
  profileCount: number;
  workflowsRunningCount: number;
  maxConcurrentCrawls: number;
  workflowsQueuedCount: number;
  collectionsCount: number;
  publicCollectionsCount: number;
};

@customElement("btrix-dashboard")
@localized()
export class Dashboard extends BtrixElement {
  @property({ type: Boolean })
  isCrawler?: boolean;

  @state()
  private metrics?: Metrics;

  private readonly colors = {
    default: "neutral",
    crawls: "green",
    uploads: "sky",
    browserProfiles: "indigo",
    runningTime: "blue",
  };

  private readonly publicCollections = new Task(this, {
    task: async ([orgId]) => {
      if (!orgId) throw new Error("orgId required");

      const collections = await this.getPublicCollections({ orgId });
      return collections;
    },
    args: () => [this.orgId] as const,
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
    const hasQuota = Boolean(this.metrics?.storageQuotaBytes);
    const quotaReached =
      this.metrics &&
      this.metrics.storageQuotaBytes > 0 &&
      this.metrics.storageUsedBytes >= this.metrics.storageQuotaBytes;

    return html`
      ${pageHeader({
        title: this.userOrg?.name,
        actions: html`
          ${when(
            this.appState.isAdmin,
            () =>
              html`<sl-tooltip content=${msg("Change Org Settings")}>
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
                  secondaryValue: hasQuota
                    ? ""
                    : this.localize.bytes(metrics.storageUsedCrawls),
                  singleLabel: msg("Crawl"),
                  pluralLabel: msg("Crawls"),
                  iconProps: {
                    name: "gear-wide-connected",
                    color: this.colors.crawls,
                  },
                })}
                ${this.renderStat({
                  value: metrics.uploadCount,
                  secondaryValue: hasQuota
                    ? ""
                    : this.localize.bytes(metrics.storageUsedUploads),
                  singleLabel: msg("Upload"),
                  pluralLabel: msg("Uploads"),
                  iconProps: { name: "upload", color: this.colors.uploads },
                })}
                ${this.renderStat({
                  value: metrics.profileCount,
                  secondaryValue: hasQuota
                    ? ""
                    : this.localize.bytes(metrics.storageUsedProfiles),
                  singleLabel: msg("Browser Profile"),
                  pluralLabel: msg("Browser Profiles"),
                  iconProps: {
                    name: "window-fullscreen",
                    color: this.colors.browserProfiles,
                  },
                })}
                <sl-divider
                  style="--spacing:var(--sl-spacing-small)"
                ></sl-divider>
                ${this.renderStat({
                  value: metrics.archivedItemCount,
                  secondaryValue: hasQuota
                    ? ""
                    : this.localize.bytes(metrics.storageUsedBytes),
                  singleLabel: msg("Archived Item"),
                  pluralLabel: msg("Archived Items"),
                  iconProps: { name: "file-zip-fill" },
                })}
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
                    color: metrics.workflowsRunningCount ? "green" : "neutral",
                  },
                })}
                ${this.renderStat({
                  value: metrics.workflowsQueuedCount,
                  singleLabel: msg("Crawl Workflow Waiting"),
                  pluralLabel: msg("Crawl Workflows Waiting"),
                  iconProps: { name: "hourglass-split", color: "violet" },
                })}
                <sl-divider
                  style="--spacing:var(--sl-spacing-small)"
                ></sl-divider>
                ${this.renderStat({
                  value: metrics.crawlPageCount,
                  singleLabel: msg("Page Crawled"),
                  pluralLabel: msg("Pages Crawled"),
                  iconProps: {
                    name: "file-richtext-fill",
                    color: this.colors.crawls,
                  },
                })}
                ${this.renderStat({
                  value: metrics.uploadPageCount,
                  singleLabel: msg("Page Uploaded"),
                  pluralLabel: msg("Pages Uploaded"),
                  iconProps: {
                    name: "file-richtext-fill",
                    color: this.colors.uploads,
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
                })}
                ${this.renderStat({
                  value: metrics.publicCollectionsCount,
                  singleLabel: msg("Shareable Collection"),
                  pluralLabel: msg("Shareable Collections"),
                  iconProps: { name: "people-fill", color: "emerald" },
                })}
              </dl>
            `,
          )}
        </div>

        <section class="mb-16">
          <header class="mb-1.5 flex items-center justify-between">
            ${pageHeading({
              content: msg("Public Collections"),
            })}
            ${when(
              this.appState.isCrawler,
              () => html`
                <btrix-overflow-dropdown>
                  <sl-menu>
                    <btrix-menu-item-link
                      href=${`${this.navigate.orgBasePath}/collections`}
                    >
                      <sl-icon slot="prefix" name="collection-fill"></sl-icon>
                      ${msg("Manage Collections")}
                    </btrix-menu-item-link>
                    <btrix-menu-item-link
                      href=${`/${RouteNamespace.PublicOrgs}/${this.orgSlugState}`}
                    >
                      <sl-icon slot="prefix" name="globe2"></sl-icon>
                      ${this.org?.enablePublicProfile
                        ? msg("Visit Public Collections Gallery")
                        : msg("Preview Public Collections Gallery")}
                    </btrix-menu-item-link>
                    ${when(this.org, (org) =>
                      org.enablePublicProfile
                        ? html`
                            <sl-menu-item
                              @click=${() => {
                                ClipboardController.copyToClipboard(
                                  `${window.location.protocol}//${window.location.hostname}${
                                    window.location.port
                                      ? `:${window.location.port}`
                                      : ""
                                  }/${RouteNamespace.PublicOrgs}/${this.orgSlugState}`,
                                );
                                this.notify.toast({
                                  message: msg("Link copied"),
                                });
                              }}
                            >
                              <sl-icon name="copy" slot="prefix"></sl-icon>
                              ${msg("Copy Link to Public Gallery")}
                            </sl-menu-item>
                          `
                        : this.appState.isAdmin
                          ? html`
                              <sl-divider></sl-divider>
                              <btrix-menu-item-link
                                href=${`${this.navigate.orgBasePath}/settings`}
                              >
                                <sl-icon slot="prefix" name="gear"></sl-icon>
                                ${msg("Update Org Profile")}
                              </btrix-menu-item-link>
                            `
                          : nothing,
                    )}
                  </sl-menu>
                </btrix-overflow-dropdown>
              `,
            )}
          </header>
          <div class="rounded-lg border p-10">
            <btrix-collections-grid
              slug=${this.orgSlugState || ""}
              .collections=${this.publicCollections.value}
            >
              ${this.renderNoPublicCollections()}
            </btrix-collections-grid>
          </div>
        </section>
      </main>
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
    const hasQuota = Boolean(metrics.storageQuotaBytes);
    const isStorageFull =
      hasQuota && metrics.storageUsedBytes >= metrics.storageQuotaBytes;
    const renderBar = (value: number, label: string, color: string) => html`
      <btrix-meter-bar
        value=${(value / metrics.storageUsedBytes) * 100}
        style="--background-color:var(--sl-color-${color}-400)"
      >
        <div class="text-center">
          <div>${label}</div>
          <div class="text-xs opacity-80">
            ${this.localize.bytes(value, {
              unitDisplay: "narrow",
            })}
            | ${this.renderPercentage(value / metrics.storageUsedBytes)}
          </div>
        </div>
      </btrix-meter-bar>
    `;
    return html`
      <div class="mb-1 font-semibold">
        ${when(
          isStorageFull,
          () => html`
            <div class="flex items-center gap-2">
              <sl-icon
                class="text-danger"
                name="exclamation-triangle"
              ></sl-icon>
              <span>${msg("Storage is Full")}</span>
            </div>
          `,
          () =>
            hasQuota
              ? html`
                  ${this.localize.bytes(
                    metrics.storageQuotaBytes - metrics.storageUsedBytes,
                  )}
                  ${msg("Available")}
                `
              : "",
        )}
      </div>
      ${when(
        hasQuota,
        () => html`
          <div class="mb-2">
            <btrix-meter
              value=${metrics.storageUsedBytes}
              max=${ifDefined(metrics.storageQuotaBytes || undefined)}
              valueText=${msg("gigabyte")}
            >
              ${when(metrics.storageUsedCrawls, () =>
                renderBar(
                  metrics.storageUsedCrawls,
                  msg("Crawls"),
                  this.colors.crawls,
                ),
              )}
              ${when(metrics.storageUsedUploads, () =>
                renderBar(
                  metrics.storageUsedUploads,
                  msg("Uploads"),
                  this.colors.uploads,
                ),
              )}
              ${when(metrics.storageUsedProfiles, () =>
                renderBar(
                  metrics.storageUsedProfiles,
                  msg("Profiles"),
                  this.colors.browserProfiles,
                ),
              )}
              <div slot="available" class="flex-1">
                <sl-tooltip class="text-center">
                  <div slot="content">
                    <div>${msg("Available")}</div>
                    <div class="text-xs opacity-80">
                      ${this.renderPercentage(
                        (metrics.storageQuotaBytes - metrics.storageUsedBytes) /
                          metrics.storageQuotaBytes,
                      )}
                    </div>
                  </div>
                  <div class="h-full w-full"></div>
                </sl-tooltip>
              </div>
              <span slot="valueLabel"
                >${this.localize.bytes(metrics.storageUsedBytes, {
                  unitDisplay: "narrow",
                })}</span
              >
              <span slot="maxLabel"
                >${this.localize.bytes(metrics.storageQuotaBytes, {
                  unitDisplay: "narrow",
                })}</span
              >
            </btrix-meter>
          </div>
        `,
      )}
    `;
  }

  private renderCrawlingMeter(_metrics: Metrics) {
    if (!this.org) return;

    let quotaSeconds = 0;

    if (this.org.quotas.maxExecMinutesPerMonth) {
      quotaSeconds = this.org.quotas.maxExecMinutesPerMonth * 60;
    }

    let quotaSecondsAllTypes = quotaSeconds;

    let quotaSecondsExtra = 0;
    if (this.org.extraExecSecondsAvailable) {
      quotaSecondsExtra = this.org.extraExecSecondsAvailable;
      quotaSecondsAllTypes += this.org.extraExecSecondsAvailable;
    }

    let quotaSecondsGifted = 0;
    if (this.org.giftedExecSecondsAvailable) {
      quotaSecondsGifted = this.org.giftedExecSecondsAvailable;
      quotaSecondsAllTypes += this.org.giftedExecSecondsAvailable;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
    const currentPeriod = `${currentYear}-${currentMonth}`;

    let usageSeconds = 0;
    if (this.org.monthlyExecSeconds) {
      const actualUsage = this.org.monthlyExecSeconds[currentPeriod];
      if (actualUsage) {
        usageSeconds = actualUsage;
      }
    }

    if (usageSeconds > quotaSeconds) {
      usageSeconds = quotaSeconds;
    }

    let usageSecondsAllTypes = 0;
    if (this.org.monthlyExecSeconds) {
      const actualUsage = this.org.monthlyExecSeconds[currentPeriod];
      if (actualUsage) {
        usageSecondsAllTypes = actualUsage;
      }
    }

    let usageSecondsExtra = 0;
    if (this.org.extraExecSeconds) {
      const actualUsageExtra = this.org.extraExecSeconds[currentPeriod];
      if (actualUsageExtra) {
        usageSecondsExtra = actualUsageExtra;
      }
    }
    const maxExecSecsExtra = this.org.quotas.extraExecMinutes * 60;
    // Cap usage at quota for display purposes
    if (usageSecondsExtra > maxExecSecsExtra) {
      usageSecondsExtra = maxExecSecsExtra;
    }
    if (usageSecondsExtra) {
      // Quota for extra = this month's usage + remaining available
      quotaSecondsAllTypes += usageSecondsExtra;
      quotaSecondsExtra += usageSecondsExtra;
    }

    let usageSecondsGifted = 0;
    if (this.org.giftedExecSeconds) {
      const actualUsageGifted = this.org.giftedExecSeconds[currentPeriod];
      if (actualUsageGifted) {
        usageSecondsGifted = actualUsageGifted;
      }
    }
    const maxExecSecsGifted = this.org.quotas.giftedExecMinutes * 60;
    // Cap usage at quota for display purposes
    if (usageSecondsGifted > maxExecSecsGifted) {
      usageSecondsGifted = maxExecSecsGifted;
    }
    if (usageSecondsGifted) {
      // Quota for gifted = this month's usage + remaining available
      quotaSecondsAllTypes += usageSecondsGifted;
      quotaSecondsGifted += usageSecondsGifted;
    }

    const hasQuota = Boolean(quotaSecondsAllTypes);
    const isReached = hasQuota && usageSecondsAllTypes >= quotaSecondsAllTypes;

    const maxTotalTime = quotaSeconds + quotaSecondsExtra + quotaSecondsGifted;
    if (isReached) {
      usageSecondsAllTypes = maxTotalTime;
      quotaSecondsAllTypes = maxTotalTime;
    }

    const hasExtra =
      usageSecondsExtra ||
      this.org.extraExecSecondsAvailable ||
      usageSecondsGifted ||
      this.org.giftedExecSecondsAvailable;

    const renderBar = (
      /** Time in Seconds */
      used: number,
      quota: number,
      label: string,
      color: string,
      divided = true,
    ) => {
      if (divided) {
        return html` <btrix-divided-meter-bar
          value=${(used / quotaSecondsAllTypes) * 100}
          quota=${(quota / quotaSecondsAllTypes) * 100}
          style="--background-color:var(--sl-color-${color}-400); --quota-background-color:var(--sl-color-${color}-100)"
        >
          <div class="text-center">
            <div>${label}</div>
            <div class="text-xs opacity-80">
              ${humanizeExecutionSeconds(used, { displaySeconds: true })} /
              ${humanizeExecutionSeconds(quota, { displaySeconds: true })}
            </div>
          </div>
        </btrix-divided-meter-bar>`;
      } else {
        return html`<btrix-meter-bar
          value=${100}
          style="--background-color:var(--sl-color-${color}-400);"
        >
          <div class="text-center">
            <div>${label}</div>
            <div class="text-xs opacity-80">
              ${humanizeExecutionSeconds(used, { displaySeconds: true })} |
              ${this.renderPercentage(used / quota)}
            </div>
          </div>
        </btrix-meter-bar>`;
      }
    };
    return html`
      <div class="mb-1 font-semibold">
        ${when(
          isReached,
          () => html`
            <div class="flex items-center gap-2">
              <sl-icon
                class="text-danger"
                name="exclamation-triangle"
              ></sl-icon>
              <span>${msg("Execution Minutes Quota Reached")}</span>
            </div>
          `,
          () =>
            hasQuota && this.org
              ? html`
                  <span class="inline-flex items-center">
                    ${humanizeExecutionSeconds(
                      quotaSeconds -
                        usageSeconds +
                        this.org.extraExecSecondsAvailable +
                        this.org.giftedExecSecondsAvailable,
                      { style: "short", round: "down" },
                    )}
                    <span class="ml-1">${msg("remaining")}</span>
                  </span>
                `
              : "",
        )}
      </div>
      ${when(
        hasQuota && this.org,
        (org) => html`
          <div class="mb-2">
            <btrix-meter
              value=${org.giftedExecSecondsAvailable ||
              org.extraExecSecondsAvailable ||
              isReached
                ? quotaSecondsAllTypes
                : usageSeconds}
              max=${quotaSecondsAllTypes}
              valueText=${msg("time")}
            >
              ${when(usageSeconds || quotaSeconds, () =>
                renderBar(
                  usageSeconds > quotaSeconds ? quotaSeconds : usageSeconds,
                  hasExtra ? quotaSeconds : quotaSecondsAllTypes,
                  msg("Monthly Execution Time Used"),
                  "green",
                  hasExtra ? true : false,
                ),
              )}
              ${when(usageSecondsGifted || org.giftedExecSecondsAvailable, () =>
                renderBar(
                  usageSecondsGifted > quotaSecondsGifted
                    ? quotaSecondsGifted
                    : usageSecondsGifted,
                  quotaSecondsGifted,
                  msg("Gifted Execution Time Used"),
                  "blue",
                ),
              )}
              ${when(usageSecondsExtra || org.extraExecSecondsAvailable, () =>
                renderBar(
                  usageSecondsExtra > quotaSecondsExtra
                    ? quotaSecondsExtra
                    : usageSecondsExtra,
                  quotaSecondsExtra,
                  msg("Extra Execution Time Used"),
                  "red",
                ),
              )}
              <div slot="available" class="flex-1">
                <sl-tooltip class="text-center">
                  <div slot="content">
                    <div>${msg("Monthly Execution Time Remaining")}</div>
                    <div class="text-xs opacity-80">
                      ${humanizeExecutionSeconds(quotaSeconds - usageSeconds, {
                        displaySeconds: true,
                      })}
                      |
                      ${this.renderPercentage(
                        (quotaSeconds - usageSeconds) / quotaSeconds,
                      )}
                    </div>
                  </div>
                  <div class="h-full w-full"></div>
                </sl-tooltip>
              </div>
              <span slot="valueLabel">
                ${humanizeExecutionSeconds(usageSecondsAllTypes, {
                  style: "short",
                })}
              </span>
              <span slot="maxLabel">
                ${humanizeExecutionSeconds(quotaSecondsAllTypes, {
                  style: "short",
                })}
              </span>
            </btrix-meter>
          </div>
        `,
      )}
    `;
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
    value: number | string | TemplateResult;
    secondaryValue?: number | string | TemplateResult;
    singleLabel: string;
    pluralLabel: string;
    iconProps: { name: string; library?: string; color?: string };
  }) {
    const { value, iconProps } = stat;
    return html`
      <div class="mb-2 flex items-center justify-between last:mb-0">
        <div class="flex items-center">
          <sl-icon
            class="mr-2 text-base text-neutral-500"
            name=${iconProps.name}
            library=${ifDefined(iconProps.library)}
            style="color:var(--sl-color-${iconProps.color ||
            this.colors.default}-500)"
          ></sl-icon>
          <dt class="order-last">
            ${value === 1 ? stat.singleLabel : stat.pluralLabel}
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
      </div>
    `;
  }

  private readonly renderCardSkeleton = () => html`
    <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
    <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
    <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
    <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
  `;

  private renderPercentage(ratio: number) {
    const percent = ratio * 100;
    if (percent < 1) return `<1%`;
    return `${percent.toFixed(2)}%`;
  }

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

  private async getPublicCollections({ orgId }: { orgId: string }) {
    const params: APISortQuery<Collection> & {
      access: CollectionAccess;
    } = {
      sortBy: "dateLatest",
      sortDirection: SortDirection.Descending,
      access: CollectionAccess.Public,
    };
    const query = queryString.stringify(params);

    const data = await this.api.fetch<APIPaginatedList<Collection>>(
      `/orgs/${orgId}/collections?${query}`,
    );

    return data.items;
  }
}
