import type { PropertyValues, TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import type { SlSelectEvent } from "@shoelace-style/shoelace";

import LiteElement, { html } from "../../utils/LiteElement";
import type { AuthState } from "../../utils/AuthService";
import type { OrgData } from "../../utils/orgs";
import type { SelectNewDialogEvent } from "./index";
import {
  humanizeExecutionSeconds,
  humanizeSeconds,
} from "../../utils/executionTimeFormatter";

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
  profileCount: number;
  workflowsRunningCount: number;
  maxConcurrentCrawls: number;
  workflowsQueuedCount: number;
  collectionsCount: number;
  publicCollectionsCount: number;
};
const BYTES_PER_GB = 1e9;

@localized()
export class Dashboard extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Object })
  org: OrgData | null = null;

  @state()
  private metrics?: Metrics;

  private readonly colors = {
    default: "neutral",
    crawls: "green",
    uploads: "sky",
    browserProfiles: "indigo",
    runningTime: "blue",
  };

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("orgId")) {
      this.fetchMetrics();
    }
  }

  render() {
    const hasQuota = Boolean(this.metrics?.storageQuotaBytes);
    const quotaReached =
      this.metrics &&
      this.metrics.storageQuotaBytes > 0 &&
      this.metrics.storageUsedBytes >= this.metrics.storageQuotaBytes;

    return html`<header
        class="flex items-center justify-end gap-2 pb-3 mb-7 border-b"
      >
        <h1 class="min-w-0 text-xl font-semibold leading-8 mr-auto">
          ${this.org?.name}
        </h1>
        <sl-icon-button
          href=${`${this.orgBasePath}/settings`}
          class="text-lg"
          name="gear"
          label="Edit org settings"
          @click=${this.navLink}
        ></sl-icon-button>
        <sl-dropdown
          distance="4"
          placement="bottom-end"
          @sl-select=${(e: SlSelectEvent) => {
            this.dispatchEvent(
              <SelectNewDialogEvent>new CustomEvent("select-new-dialog", {
                detail: e.detail.item.value,
              })
            );
          }}
        >
          <sl-button slot="trigger" size="small" caret>
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
        </sl-dropdown>
      </header>
      <main>
        <div class="flex flex-col md:flex-row gap-6">
          ${this.renderCard(
            msg("Storage"),
            (metrics) => html`
              ${this.renderStorageMeter(metrics)}
              <dl>
                ${this.renderStat({
                  value: metrics.crawlCount,
                  secondaryValue: hasQuota
                    ? ""
                    : html`<sl-format-bytes
                        value=${metrics.storageUsedCrawls}
                      ></sl-format-bytes>`,
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
                    : html`<sl-format-bytes
                        value=${metrics.storageUsedUploads}
                      ></sl-format-bytes>`,
                  singleLabel: msg("Upload"),
                  pluralLabel: msg("Uploads"),
                  iconProps: { name: "upload", color: this.colors.uploads },
                })}
                ${this.renderStat({
                  value: metrics.profileCount,
                  secondaryValue: hasQuota
                    ? ""
                    : html`<sl-format-bytes
                        value=${metrics.storageUsedProfiles}
                      ></sl-format-bytes>`,
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
                    : html`<sl-format-bytes
                        value=${metrics.storageUsedBytes}
                      ></sl-format-bytes>`,
                  singleLabel: msg("Archived Item"),
                  pluralLabel: msg("Archived Items"),
                  iconProps: { name: "file-zip-fill" },
                })}
              </dl>
            `
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
                  iconProps: { name: "hourglass-split", color: "purple" },
                })}
                ${this.renderStat({
                  value: metrics.pageCount,
                  singleLabel: msg("Page Crawled"),
                  pluralLabel: msg("Pages Crawled"),
                  iconProps: { name: "file-richtext-fill" },
                })}
              </dl>
            `
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
            `
          )}
        </div>
        <section class="mt-10">${this.renderUsageHistory()}</section>
      </main> `;
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
            <sl-format-bytes value=${value} display="narrow"></sl-format-bytes>
            | ${this.renderPercentage(value / metrics.storageUsedBytes)}
          </div>
        </div>
      </btrix-meter-bar>
    `;
    return html`
      <div class="font-semibold mb-1">
        ${when(
          isStorageFull,
          () => html`
            <div class="flex gap-2 items-center">
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
                  <sl-format-bytes
                    value=${metrics.storageQuotaBytes -
                    metrics.storageUsedBytes}
                  ></sl-format-bytes>
                  ${msg("Available")}
                `
              : ""
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
                  this.colors.crawls
                )
              )}
              ${when(metrics.storageUsedUploads, () =>
                renderBar(
                  metrics.storageUsedUploads,
                  msg("Uploads"),
                  this.colors.uploads
                )
              )}
              ${when(metrics.storageUsedProfiles, () =>
                renderBar(
                  metrics.storageUsedProfiles,
                  msg("Profiles"),
                  this.colors.browserProfiles
                )
              )}
              <div slot="available" class="flex-1">
                <sl-tooltip class="text-center">
                  <div slot="content">
                    <div>${msg("Available")}</div>
                    <div class="text-xs opacity-80">
                      ${this.renderPercentage(
                        (metrics.storageQuotaBytes - metrics.storageUsedBytes) /
                          metrics.storageQuotaBytes
                      )}
                    </div>
                  </div>
                  <div class="w-full h-full"></div>
                </sl-tooltip>
              </div>
              <sl-format-bytes
                slot="valueLabel"
                value=${metrics.storageUsedBytes}
                display="narrow"
              ></sl-format-bytes>
              <sl-format-bytes
                slot="maxLabel"
                value=${metrics.storageQuotaBytes}
                display="narrow"
              ></sl-format-bytes>
            </btrix-meter>
          </div>
        `
      )}
    `;
  }

  private renderCrawlingMeter(metrics: Metrics) {
    let quotaSeconds = 0;
    if (this.org!.quotas && this.org!.quotas.maxExecMinutesPerMonth) {
      quotaSeconds = this.org!.quotas.maxExecMinutesPerMonth * 60;
    }

    let usageSeconds = 0;
    const now = new Date();
    if (this.org!.crawlExecSeconds) {
      const actualUsage =
        this.org!.crawlExecSeconds[
          `${now.getFullYear()}-${now.getUTCMonth() + 1}`
        ];
      if (actualUsage) {
        usageSeconds = actualUsage;
      }
    }

    const hasQuota = Boolean(quotaSeconds);
    const isReached = hasQuota && usageSeconds >= quotaSeconds;

    if (isReached) {
      usageSeconds = quotaSeconds;
    }

    const renderBar = (
      /** Time in Seconds */
      value: number,
      label: string,
      color: string
    ) => html`
      <btrix-meter-bar
        value=${(value / usageSeconds) * 100}
        style="--background-color:var(--sl-color-${color}-400)"
      >
        <div class="text-center">
          <div>${label}</div>
          <div class="text-xs opacity-80">
            ${humanizeExecutionSeconds(value)} |
            ${this.renderPercentage(value / quotaSeconds)}
          </div>
        </div>
      </btrix-meter-bar>
    `;
    return html`
      <div class="font-semibold mb-1">
        ${when(
          isReached,
          () => html`
            <div class="flex gap-2 items-center">
              <sl-icon
                class="text-danger"
                name="exclamation-triangle"
              ></sl-icon>
              <span>${msg("Monthly Execution Minutes Quota Reached")}</span>
            </div>
          `,
          () =>
            hasQuota
              ? html`
                  <span class="inline-flex items-center">
                    ${humanizeExecutionSeconds(quotaSeconds - usageSeconds)}
                    ${msg("Available")}
                  </span>
                `
              : ""
        )}
      </div>
      ${when(
        hasQuota,
        () => html`
          <div class="mb-2">
            <btrix-meter
              value=${isReached ? quotaSeconds : usageSeconds}
              max=${ifDefined(quotaSeconds || undefined)}
              valueText=${msg("time")}
            >
              ${when(usageSeconds, () =>
                renderBar(
                  usageSeconds,
                  msg("Monthly Execution Time Used"),
                  isReached ? "warning" : this.colors.runningTime
                )
              )}
              <div slot="available" class="flex-1">
                <sl-tooltip class="text-center">
                  <div slot="content">
                    <div>${msg("Monthly Execution Time Available")}</div>
                    <div class="text-xs opacity-80">
                      ${humanizeExecutionSeconds(quotaSeconds - usageSeconds)} |
                      ${this.renderPercentage(
                        (quotaSeconds - usageSeconds) / quotaSeconds
                      )}
                    </div>
                  </div>
                  <div class="w-full h-full"></div>
                </sl-tooltip>
              </div>
              <span slot="valueLabel">
                ${humanizeExecutionSeconds(usageSeconds, "short")}
              </span>
              <span slot="maxLabel">
                ${humanizeExecutionSeconds(quotaSeconds, "short")}
              </span>
            </btrix-meter>
          </div>
        `
      )}
    `;
  }

  private renderCard(
    title: string,
    renderContent: (metric: Metrics) => TemplateResult,
    renderFooter?: (metric: Metrics) => TemplateResult
  ) {
    return html`
      <section class="flex-1 flex flex-col border rounded p-4">
        <h2 class="text-lg font-semibold leading-none border-b pb-3 mb-3">
          ${title}
        </h2>
        <div class="flex-1">
          ${when(
            this.metrics,
            () => renderContent(this.metrics!),
            this.renderCardSkeleton
          )}
        </div>
        ${when(renderFooter && this.metrics, () =>
          renderFooter!(this.metrics!)
        )}
      </section>
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
      <div class="flex items-center justify-between mb-2 last:mb-0">
        <div class="flex items-center">
          <sl-icon
            class="text-base text-neutral-500 mr-2"
            name=${iconProps.name}
            library=${ifDefined(iconProps.library)}
            style="color:var(--sl-color-${iconProps.color ||
            this.colors.default}-500)"
          ></sl-icon>
          <dt class="order-last">
            ${value === 1 ? stat.singleLabel : stat.pluralLabel}
          </dt>
          <dd class="mr-1">
            ${typeof value === "number" ? value.toLocaleString() : value}
          </dd>
        </div>
        ${when(
          stat.secondaryValue,
          () =>
            html`
              <div class="text-xs text-neutral-500 font-monostyle">
                ${stat.secondaryValue}
              </div>
            `
        )}
      </div>
    `;
  }

  private renderCardSkeleton = () =>
    html`
      <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
      <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
      <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
      <sl-skeleton class="mb-3" effect="sheen"></sl-skeleton>
    `;

  // TODO fix style when data-table is converted to slots
  readonly usageTableCols = [
    msg("Month"),
    html`
      ${msg("Execution Time")}
      <sl-tooltip>
        <div slot="content" style="text-transform: initial">
          ${msg("Total running time of all crawler instances")}
        </div>
        <sl-icon name="info-circle" style="vertical-align: -.175em"></sl-icon>
      </sl-tooltip>
    `,
    html`
      ${msg("Elapsed Time")}
      <sl-tooltip>
        <div slot="content" style="text-transform: initial">
          ${msg("Total time elapsed between when crawls started and ended")}
        </div>
        <sl-icon name="info-circle" style="vertical-align: -.175em"></sl-icon>
      </sl-tooltip>
    `,
  ];

  private renderUsageHistory() {
    if (!this.org) return;
    const rows = Object.entries(this.org.usage || {})
      // Sort latest
      .reverse()
      .map(([mY, crawlTime]) => {
        const value = this.org!.crawlExecSeconds?.[mY];
        return [
          html`
            <sl-format-date
              date="${mY}-01T00:00:00.000Z"
              time-zone="utc"
              month="long"
              year="numeric"
            >
            </sl-format-date>
          `,
          value ? humanizeExecutionSeconds(value) : "--",
          humanizeSeconds(crawlTime || 0),
        ];
      });
    return html`
      <btrix-details>
        <span slot="title">${msg("Usage History")}</span>
        <div class="border rounded overflow-hidden">
          <btrix-data-table
            .columns=${this.usageTableCols}
            .rows=${rows}
          ></btrix-data-table>
        </div>
      </btrix-details>
    `;
  }

  private renderPercentage(ratio: number) {
    const percent = ratio * 100;
    if (percent < 1) return `<1%`;
    return `${percent.toFixed(2)}%`;
  }

  private async fetchMetrics() {
    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/metrics`,
        this.authState!
      );

      this.metrics = data;
    } catch (e: any) {
      this.notify({
        message: msg("Sorry, couldn't retrieve org metrics at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}
customElements.define("btrix-dashboard", Dashboard);
