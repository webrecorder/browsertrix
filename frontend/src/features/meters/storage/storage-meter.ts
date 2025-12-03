import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { storageColors } from "./colors";
import { tooltipRow } from "./tooltip";

import { BtrixElement } from "@/classes/BtrixElement";
import { type Color } from "@/features/meters/utils/colors";
import { renderLegendColor } from "@/features/meters/utils/legend";
import { tooltipContent } from "@/features/meters/utils/tooltip";
import { type Metrics } from "@/types/org";

const STORAGE_TYPES = ["crawls", "uploads", "browserProfiles", "misc"] as const;
type StorageType = (typeof STORAGE_TYPES)[number];

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

    const values = {
      crawls: metrics.storageUsedCrawls,
      uploads: metrics.storageUsedUploads,
      browserProfiles: metrics.storageUsedProfiles,
      misc: misc,
    } satisfies Record<StorageType, number>;

    const titles = {
      crawls: msg("Crawls"),
      uploads: msg("Uploads"),
      browserProfiles: msg("Profiles"),
      misc: msg("Miscellaneous"),
    } satisfies Record<StorageType, string>;

    const nonZeroValues = STORAGE_TYPES.filter((type) => values[type] > 0);

    const renderBar = (
      values: Record<StorageType, number>,
      titles: Record<StorageType, string>,
      colors: Record<StorageType, { primary: Color; border: Color }>,
      key: StorageType,
    ) => {
      return html`
        <btrix-meter-bar
          value=${(values[key] / metrics.storageUsedBytes) * 100}
          style="--background-color:var(--sl-color-${colors[key].primary})"
        >
          ${tooltipContent({
            title: html`${renderLegendColor(colors[key])}${titles[key]}`,
            value: this.localize.bytes(values[key], {
              unitDisplay: "narrow",
            }),
            content: html`${nonZeroValues.map((type) =>
                tooltipRow(
                  titles[type],
                  values[type],
                  type === key,
                  colors[type],
                ),
              )}
              <hr class="my-2" />
              ${tooltipRow(msg("All used storage"), metrics.storageUsedBytes)}`,
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
              ${nonZeroValues.map((type) =>
                when(values[type], () =>
                  renderBar(values, titles, storageColors, type),
                ),
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
