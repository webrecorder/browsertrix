import { localized, msg, str } from "@lit/localize";
import type { SlCheckbox, SlHideEvent } from "@shoelace-style/shoelace";
import { css, html, nothing } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { dedupeStatusIcon } from "../templates/dedupe-status-icon";

import type { ArchivedItemCheckedEvent } from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import { ReviewStatus, type ArchivedItem, type Crawl } from "@/types/crawler";
import { renderName } from "@/utils/crawler";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

/**
 * @slot actionCell - Action cell
 */
@customElement("btrix-archived-item-list-item")
@localized()
export class ArchivedItemListItem extends BtrixElement {
  static styles = css`
    :host {
      display: contents;
    }

    btrix-table-row {
      border-top: var(--btrix-border-top, 0);
      border-radius: var(--btrix-border-radius-top, 0)
        var(--btrix-border-radius-to, 0) var(--btrix-border-radius-bottom, 0)
        var(--btrix-border-radius-bottom, 0);
      height: 2.5rem;
    }

    sl-progress-ring {
      /* Setting size to var(--font-size-base) breaks in chrome,
      have cell contents inherit size from cell instead */
      --size: 1em;
      --track-width: 1px;
      --indicator-width: 2px;
    }
  `;

  @property({ type: Object, attribute: false })
  item?: ArchivedItem;

  @property({ type: Boolean })
  checkbox = false;

  @property({ type: Boolean })
  checked = false;

  @property({ type: Number })
  index = 0;

  @property({ type: String })
  href?: string;

  @query("sl-checkbox")
  readonly checkboxEl?: SlCheckbox;

  @query(".rowLink")
  private readonly rowLink?: HTMLAnchorElement;

  render() {
    if (!this.item) return;
    const checkboxId = `${this.item.id}-checkbox`;
    const rowName = renderName(this.item);
    const isUpload = this.item.type === "upload";
    const crawlStatus = isUpload
      ? CrawlStatus.getContent({ state: "complete" })
      : CrawlStatus.getContent(this.item as Crawl);
    const pageCount = isUpload
      ? this.item.pageCount
        ? +this.item.pageCount
        : 0
      : this.item.stats?.done
        ? +this.item.stats.done
        : 0;
    const pluralOfPageCount = pluralOf("pages", pageCount);
    let typeLabel = msg("Crawl");
    let typeIcon = "gear-wide-connected";

    if (isUpload) {
      typeLabel = msg("Upload");
      typeIcon = "upload";
    }

    const notApplicable = html`<sl-tooltip
      hoist
      content=${msg("Not Applicable")}
    >
      <sl-icon name="slash-lg" class="text-base text-neutral-300"></sl-icon>
    </sl-tooltip>`;

    const { activeQAStats, lastQAState } = this.item;
    const activeProgress = activeQAStats?.found
      ? Math.round((100 * activeQAStats.done) / activeQAStats.found)
      : 0;

    const qaStatus = CrawlStatus.getContent({
      state: lastQAState || undefined,
    });

    return html`
      <btrix-table-row
        class=${this.href || this.checkbox
          ? tw`cursor-pointer select-none whitespace-nowrap transition-colors duration-fast focus-within:bg-neutral-50 hover:bg-neutral-50`
          : ""}
      >
        ${this.checkbox
          ? html`
              <btrix-table-cell class="pr-0">
                <sl-checkbox
                  id=${checkboxId}
                  class="flex"
                  ?checked=${this.checked}
                  @sl-change=${(e: CustomEvent) => {
                    this.dispatchEvent(
                      new CustomEvent<ArchivedItemCheckedEvent["detail"]>(
                        "btrix-change",
                        {
                          detail: {
                            value: {
                              checked: (e.currentTarget as SlCheckbox).checked,
                            },
                          },
                        },
                      ),
                    );
                  }}
                ></sl-checkbox>
              </btrix-table-cell>
            `
          : nothing}
        <btrix-table-cell class="pr-0 text-base">
          ${isUpload
            ? html`<btrix-upload-status
                state=${this.item.state}
                hideLabel
              ></btrix-upload-status>`
            : html`
                <sl-tooltip
                  content=${msg(str`${typeLabel}: ${crawlStatus.label}`)}
                  @sl-hide=${(e: SlHideEvent) => e.stopPropagation()}
                  @sl-after-hide=${(e: SlHideEvent) => e.stopPropagation()}
                  hoist
                >
                  <sl-icon
                    class="size-4 text-base"
                    style="color: ${crawlStatus.cssColor}"
                    name=${typeIcon}
                    label=${typeLabel}
                  ></sl-icon>
                </sl-tooltip>
              `}
          <sl-tooltip
            hoist
            content=${activeQAStats
              ? msg(
                  str`QA Analysis: ${qaStatus.label} (${activeProgress}% finished)`,
                )
              : msg(
                  str`QA Analysis: ${isUpload ? "Not Applicable" : qaStatus.label || msg("None")}`,
                )}
          >
            ${activeQAStats
              ? html`
                  <sl-progress-ring
                    value="${activeProgress}"
                    style="color: ${qaStatus.cssColor};"
                  ></sl-progress-ring>
                `
              : html`
                  <sl-icon
                    class="text-base text-neutral-300"
                    style=${ifDefined(
                      lastQAState === "complete"
                        ? `color: ${qaStatus.cssColor}`
                        : undefined,
                    )}
                    name=${isUpload ? "slash-lg" : "microscope"}
                    library=${isUpload ? "default" : "app"}
                  ></sl-icon>
                `}
          </sl-tooltip>

          ${when(this.featureFlags.has("dedupeEnabled") && this.item, (item) =>
            dedupeStatusIcon(item),
          )}
        </btrix-table-cell>
        <btrix-table-cell
          rowClickTarget=${ifDefined(
            this.href ? "a" : this.checkbox ? "label" : undefined,
          )}
        >
          ${this.href
            ? html`<a
                class="rowLink overflow-hidden"
                href=${this.href}
                @click=${this.navigate.link}
              >
                ${rowName}
              </a>`
            : this.checkbox
              ? html`<label
                  for=${checkboxId}
                  @click=${() => {
                    // We need to simulate click anyway, since external label click
                    // won't work with the shoelace checkbox
                    this.checkboxEl?.click();
                  }}
                >
                  ${rowName}
                </label>`
              : html`<div>${rowName}</div>`}
        </btrix-table-cell>
        <btrix-table-cell class="tabular-nums">
          <sl-tooltip
            content=${msg(str`By ${this.item.userName}`)}
            @click=${this.onTooltipClick}
            hoist
          >
            <btrix-format-date
              class="truncate"
              .date=${this.item.finished}
              month="2-digit"
              day="2-digit"
              year="numeric"
            ></btrix-format-date>
          </sl-tooltip>
        </btrix-table-cell>
        <btrix-table-cell class="tabular-nums">
          <sl-tooltip
            hoist
            content=${this.localize.bytes(this.item.fileSize || 0, {
              unitDisplay: "long",
            })}
            @click=${this.onTooltipClick}
          >
            <span class="truncate">
              ${this.localize.bytes(this.item.fileSize || 0, {
                unitDisplay: "narrow",
              })}
            </span>
          </sl-tooltip>
        </btrix-table-cell>
        <btrix-table-cell class="tabular-nums">
          <sl-tooltip
            hoist
            @click=${this.onTooltipClick}
            content="${isUpload
              ? this.localize.number(pageCount)
              : msg(
                  str`${this.localize.number(
                    pageCount,
                  )} crawled, ${this.localize.number(this.item.stats?.found ? +this.item.stats.found : 0)} found`,
                )} ${pluralOfPageCount}"
          >
            <div class="min-w-4">
              ${this.localize.number(pageCount, {
                notation: "compact",
              })}
              ${pluralOfPageCount}
            </div>
          </sl-tooltip>
        </btrix-table-cell>
        <btrix-table-cell>
          ${isUpload
            ? notApplicable
            : html`<sl-tooltip
                hoist
                @click=${this.onTooltipClick}
                content=${this.item.reviewStatus
                  ? msg(
                      str`Rated ${this.item.reviewStatus} / ${ReviewStatus.Excellent}`,
                    )
                  : msg("No QA review submitted")}
              >
                <btrix-qa-review-status
                  .status=${this.item.reviewStatus}
                ></btrix-qa-review-status>
              </sl-tooltip>`}
        </btrix-table-cell>
        <slot name="actionCell"></slot>
      </btrix-table-row>
    `;
  }

  // FIXME Tooltips are enabled by styling them in in table.stylesheet.css
  // to have a z-index higher than the anchor link overlay.
  // Should probably fix this in table-cell or table-row instead
  private onTooltipClick() {
    this.rowLink?.click();
  }
}
