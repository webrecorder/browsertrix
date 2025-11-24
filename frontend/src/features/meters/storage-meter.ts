import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { colors } from "./colors";

import { BtrixElement } from "@/classes/BtrixElement";
import { renderPercentage } from "@/strings/numbers";
import { type Metrics } from "@/types/org";

@customElement("btrix-storage-meter")
@localized()
export class StorageMeter extends BtrixElement {
  @property({ type: Object })
  metrics?: Metrics;

  render() {
    if (!this.metrics) return;
    return this.renderStorageMeter(this.metrics);
  }

  private readonly renderStorageMeter = (metrics: Metrics) => {
    const hasQuota = Boolean(metrics.storageQuotaBytes);
    const isStorageFull =
      hasQuota && metrics.storageUsedBytes >= metrics.storageQuotaBytes;
    const misc = metrics.storageUsedSeedFiles + metrics.storageUsedThumbnails;

    const renderBar = (
      value: number,
      label: string,
      colorClassname: string,
    ) => {
      const percentageOfUsed = renderPercentage(
        value / metrics.storageUsedBytes,
      );
      const percentageOfAvailable = renderPercentage(
        value / metrics.storageQuotaBytes,
      );
      return html`
        <btrix-meter-bar
          value=${(value / metrics.storageUsedBytes) * 100}
          style="--background-color:var(--sl-color-${colorClassname.replace(
            "text-",
            "",
          )})"
        >
          <header class="flex justify-between gap-4 font-medium leading-none">
            <span>${label}</span>
            <span
              >${this.localize.bytes(value, {
                unitDisplay: "narrow",
              })}</span
            >
          </header>
          <hr class="my-2" />
          <p>
            ${msg(html`${percentageOfUsed} of used storage`)}
            <br />
            ${msg(html`${percentageOfAvailable} of available storage`)}
          </p>
        </btrix-meter-bar>
      `;
    };
    return html`
      <div class="mb-1 font-semibold">
        ${when(
          isStorageFull,
          () => html`
            <div class="flex items-center gap-2">
              <sl-icon class="text-danger" name="x-octagon"></sl-icon>
              <span>${msg("Storage is Full")}</span>
            </div>
          `,
          () =>
            hasQuota
              ? html`
                  ${this.localize.bytes(
                    metrics.storageQuotaBytes - metrics.storageUsedBytes,
                  )}
                  ${msg("available")}
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
                  colors.crawls,
                ),
              )}
              ${when(metrics.storageUsedUploads, () =>
                renderBar(
                  metrics.storageUsedUploads,
                  msg("Uploads"),
                  colors.uploads,
                ),
              )}
              ${when(metrics.storageUsedProfiles, () =>
                renderBar(
                  metrics.storageUsedProfiles,
                  msg("Profiles"),
                  colors.browserProfiles,
                ),
              )}
              ${when(misc, () =>
                renderBar(misc, msg("Miscellaneous"), colors.misc),
              )}
              <div slot="available" class="flex-1">
                <btrix-floating-popover placement="top" class="text-center">
                  <div slot="content">
                    <header
                      class="flex justify-between gap-4 font-medium leading-none"
                    >
                      <span>${msg("Available Storage")}</span>
                      <span
                        >${this.localize.bytes(
                          metrics.storageQuotaBytes - metrics.storageUsedBytes,
                          {
                            unitDisplay: "narrow",
                          },
                        )}</span
                      >
                    </header>
                  </div>
                  <div class="h-full w-full"></div>
                </btrix-floating-popover>
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
  };
}
