import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { storageColors } from "./colors";

import { BtrixElement } from "@/classes/BtrixElement";
import { type Color } from "@/features/meters/utils/colors";
import { renderLegendColor } from "@/features/meters/utils/legend";
import { tooltipContent } from "@/features/meters/utils/tooltip";
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
      title: string,
      colors: { primary: Color; border: Color },
    ) => {
      const percentageOfUsed = renderPercentage(
        metrics.storageUsedBytes === 0 ? 0 : value / metrics.storageUsedBytes,
      );
      const percentageOfAvailable = renderPercentage(
        value / metrics.storageQuotaBytes,
      );
      return html`
        <btrix-meter-bar
          value=${(value / metrics.storageUsedBytes) * 100}
          style="--background-color:var(--sl-color-${colors.primary})"
        >
          ${tooltipContent({
            title: html`${renderLegendColor(colors)}${title}`,
            value: this.localize.bytes(value, {
              unitDisplay: "narrow",
            }),
            content: html`<p>
              ${msg(html`${percentageOfUsed} of used storage`)}
              <br />
              ${msg(html`${percentageOfAvailable} of available storage`)}
            </p>`,
          })}
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
                  storageColors.crawls,
                ),
              )}
              ${when(metrics.storageUsedUploads, () =>
                renderBar(
                  metrics.storageUsedUploads,
                  msg("Uploads"),
                  storageColors.uploads,
                ),
              )}
              ${when(metrics.storageUsedProfiles, () =>
                renderBar(
                  metrics.storageUsedProfiles,
                  msg("Profiles"),
                  storageColors.browserProfiles,
                ),
              )}
              ${when(misc, () =>
                renderBar(misc, msg("Miscellaneous"), storageColors.misc),
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
