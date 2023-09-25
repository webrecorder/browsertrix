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

  private gbFormatter = Intl.NumberFormat("en", {
    notation: "compact",
    style: "unit",
    unit: "gigabyte",
    unitDisplay: "narrow",
  });

  private readonly colors = {
    default: "neutral",
    crawls: "sky",
    uploads: "lime",
    browserProfiles: "fuchsia",
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
              ${when(
                metrics.storageQuotaBytes,
                () => this.renderStorageMeter(metrics),
                () => html`
                  <div class="font-semibold mb-3">
                    <sl-format-bytes
                      value=${metrics.storageUsedBytes ?? 0}
                    ></sl-format-bytes>
                    ${msg("Used")}
                  </div>
                `
              )}
              <dl>
                ${this.renderStat({
                  value: metrics.archivedItemCount,
                  singleLabel: msg("Archived Item"),
                  pluralLabel: msg("Archived Items"),
                  iconProps: { name: "file-zip-fill" },
                })}
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
    return html`
      <div class="font-semibold mb-1">
        ${msg(
          str`${Math.round(
            (metrics.storageUsedBytes / metrics.storageQuotaBytes) * 100
          )}% used`
        )}
      </div>
      <div class="mb-2">
        <btrix-meter
          value=${metrics.storageUsedBytes}
          max=${maxBytes}
          valueText=${msg("gigabyte")}
          valueLabel=${this.bytesLabel(metrics.storageUsedBytes)}
          maxLabel=${this.bytesLabel(metrics.storageQuotaBytes)}
        >
          <btrix-meter-bar
            value=${(metrics.storageUsedCrawls / metrics.storageUsedBytes) *
            100}
            style="--background-color:var(--sl-color-${this.colors.crawls}-400)"
          >
            <div class="text-center">
              <div>${msg("Crawls")}</div>
              <div class="text-xs opacity-80">
                ${this.bytesLabel(metrics.storageUsedCrawls)}
              </div>
            </div>
          </btrix-meter-bar>
          <btrix-meter-bar
            value=${(metrics.storageUsedUploads / metrics.storageUsedBytes) *
            100}
            style="--background-color:var(--sl-color-${this.colors
              .uploads}-400)"
          >
            <div class="text-center">
              <div>${msg("Uploads")}</div>
              <div class="text-xs opacity-80">
                ${this.bytesLabel(metrics.storageUsedUploads)}
              </div>
            </div>
          </btrix-meter-bar>
          <btrix-meter-bar
            value=${(metrics.storageUsedProfiles / metrics.storageUsedBytes) *
            100}
            style="--background-color:var(--sl-color-${this.colors
              .browserProfiles}-400)"
          >
            <div class="text-center">
              <div>${msg("Browser Profiles")}</div>
              <div class="text-xs opacity-80">
                ${this.bytesLabel(metrics.storageUsedProfiles)}
              </div>
            </div>
          </btrix-meter-bar>
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
    value: number;
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

  private bytesLabel(n: number) {
    return this.gbFormatter.format(n / BYTES_PER_GB);
  }

  private async fetchMetrics() {
    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/metrics`,
        this.authState!
      );

      // TODO remove after testing
      data.storageUsedCrawls = data.storageUsedBytes * 0.25;
      data.storageUsedUploads = data.storageUsedBytes * 0.25;
      data.storageUsedProfiles = data.storageUsedBytes * 0.5;

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
