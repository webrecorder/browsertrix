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
  };

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("orgId")) {
      this.fetchMetrics();
    }
  }

  render() {
    return html`<header
        class="flex items-center justify-between gap-2 pb-3 mb-7 border-b"
      >
        <h1 class="min-w-0 text-xl font-semibold leading-8">
          ${this.org?.name}
        </h1>
        <div>
          <sl-icon-button
            href=${`/orgs/${this.orgId}/settings`}
            class="text-lg"
            name="gear"
            label="Edit org settings"
            @click=${this.navLink}
          ></sl-icon-button>
        </div>
      </header>
      <main>
        <div class="flex flex-col md:flex-row gap-6">
          ${this.renderCard(
            msg("Storage"),
            (metrics) => html`
              ${when(metrics.storageQuotaBytes, () =>
                this.renderStorageMeter(metrics)
              )}
              <dl>
                ${when(
                  !metrics.storageQuotaBytes,
                  () => html`
                    ${this.renderStat({
                      value: html`<sl-format-bytes
                        value=${metrics.storageUsedBytes ?? 0}
                        display="narrow"
                      ></sl-format-bytes>`,
                      singleLabel: msg("of Data Stored"),
                      pluralLabel: msg("of Data Stored"),
                      iconProps: { name: "device-hdd-fill" },
                    })}
                    <sl-divider
                      style="--spacing:var(--sl-spacing-small)"
                    ></sl-divider>
                  `
                )}
                ${this.renderStat({
                  value: metrics.crawlCount,
                  singleLabel: msg("Crawl"),
                  pluralLabel: msg("Crawls"),
                  iconProps: {
                    name: "gear-wide-connected",
                    color: this.colors.crawls,
                  },
                })}
                ${this.renderStat({
                  value: metrics.uploadCount,
                  singleLabel: msg("Upload"),
                  pluralLabel: msg("Uploads"),
                  iconProps: { name: "upload", color: this.colors.uploads },
                })}
                ${this.renderStat({
                  value: metrics.profileCount,
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
                  singleLabel: msg("Archived Item"),
                  pluralLabel: msg("Archived Items"),
                  iconProps: { name: "file-zip-fill" },
                })}
              </dl>
            `,
            (metrics) => html`<footer class="mt-4 flex justify-end">
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
                <sl-button
                  slot="trigger"
                  size="small"
                  caret
                  ?disabled=${metrics.storageQuotaBytes > 0 &&
                  metrics.storageUsedBytes >= metrics.storageQuotaBytes}
                >
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                  ${msg("Add New...")}
                </sl-button>
                <sl-menu>
                  <sl-menu-item value="browser-profile">
                    ${msg("Browser Profile")}
                  </sl-menu-item>
                  <sl-menu-item value="upload">${msg("Upload")}</sl-menu-item>
                </sl-menu>
              </sl-dropdown>
            </footer> `
          )}
          ${this.renderCard(
            msg("Crawling"),
            (metrics) => html`
              <dl>
                ${this.renderStat({
                  value: metrics.workflowsRunningCount,
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
            `,
            (metrics) => html`
              <footer class="mt-4 flex justify-end">
                <sl-button
                  href=${`/orgs/${this.orgId}/workflows?new&jobType=`}
                  size="small"
                  @click=${this.navLink}
                >
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>${msg(
                    "New Workflow"
                  )}
                </sl-button>
              </footer>
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
            `,
            (metrics) => html`
              <footer class="mt-4 flex justify-end">
                <sl-button
                  href=${`/orgs/${this.orgId}/collections/new`}
                  size="small"
                  @click=${this.navLink}
                >
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>${msg(
                    "New Collection"
                  )}
                </sl-button>
              </footer>
            `
          )}
        </div>
      </main> `;
  }

  private renderStorageMeter(metrics: Metrics) {
    // Account for usage that exceeds max
    const maxBytes = Math.max(
      metrics.storageUsedBytes,
      metrics.storageQuotaBytes
    );
    const isStorageFull = metrics.storageUsedBytes >= metrics.storageQuotaBytes;
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
          () => html`
            <sl-format-bytes
              value=${maxBytes - metrics.storageUsedBytes}
            ></sl-format-bytes>
            ${msg("Available")}
          `
        )}
      </div>
      <div class="mb-2">
        <btrix-meter
          value=${metrics.storageUsedBytes}
          max=${maxBytes}
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
            <sl-tooltip>
              <div slot="content" class="text-xs opacity-80">
                ${this.renderPercentage(
                  (metrics.storageQuotaBytes - metrics.storageUsedBytes) /
                    metrics.storageQuotaBytes
                )}
              </div>
              <div class="w-full h-full" role="none"></div>
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
    `;
  }

  private renderCard(
    title: string,
    renderContent: (metric: Metrics) => TemplateResult,
    renderFooter?: (metric: Metrics) => TemplateResult
  ) {
    return html`
      <section
        class="flex-1 flex flex-col border rounded p-4 transition-opacity delay-75 ${this
          .metrics
          ? "opacity-100"
          : "opacity-0"}"
      >
        <h2 class="text-lg font-semibold leading-none border-b pb-3 mb-3">
          ${title}
        </h2>
        <div class="flex-1">
          ${when(this.metrics, () => renderContent(this.metrics!))}
        </div>
        ${when(renderFooter && this.metrics, () =>
          renderFooter!(this.metrics!)
        )}
      </section>
    `;
  }

  private renderStat(stat: {
    value: number | string | TemplateResult;
    singleLabel: string;
    pluralLabel: string;
    iconProps: { name: string; library?: string; color?: string };
  }) {
    return html`
      <div class="flex items-center mb-2 last:mb-0">
        <sl-icon
          class="text-base text-neutral-500 mr-2"
          name=${stat.iconProps.name}
          library=${ifDefined(stat.iconProps.library)}
          style="color:var(--sl-color-${stat.iconProps.color ||
          this.colors.default}-500)"
        ></sl-icon>
        <dt class="order-last">
          ${stat.value === 1 ? stat.singleLabel : stat.pluralLabel}
        </dt>
        <dd class="mr-1">${stat.value.toLocaleString()}</dd>
      </div>
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
