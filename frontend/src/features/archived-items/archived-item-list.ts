import { localized, msg, str } from "@lit/localize";
import type { SlCheckbox, SlHideEvent } from "@shoelace-style/shoelace";
import { css, html, nothing, type TemplateResult } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { CrawlStatus } from "./crawl-status";

import { TailwindElement } from "@/classes/TailwindElement";
import { NavigateController } from "@/controllers/navigate";
import { ReviewStatus, type ArchivedItem, type Crawl } from "@/types/crawler";
import { renderName } from "@/utils/crawler";
import { formatNumber, getLocale } from "@/utils/localization";

export type CheckboxChangeEventDetail = {
  checked: boolean;
};

/**
 * @slot actionCell - Action cell
 * @fires btrix-checkbox-change
 */
@localized()
@customElement("btrix-archived-item-list-item")
export class ArchivedItemListItem extends TailwindElement {
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
  `;

  @property({ type: Object, attribute: false })
  item?: ArchivedItem;

  @property({ type: String, attribute: false })
  listType: ArchivedItem["type"] | null = null;

  @property({ type: Boolean })
  checkbox = false;

  @property({ type: Boolean })
  checked = false;

  @property({ type: Boolean })
  showStatus = false;

  @property({ type: Number })
  index = 0;

  @property({ type: String })
  href?: string;

  @query("sl-checkbox")
  readonly checkboxEl?: SlCheckbox;

  @query(".rowLink")
  private readonly rowLink?: HTMLAnchorElement;

  private readonly navigate = new NavigateController(this);

  render() {
    if (!this.item) return;
    const checkboxId = `${this.item.id}-checkbox`;
    const rowName = renderName(this.item);
    const isUpload = this.item.type === "upload";
    const crawlStatus = CrawlStatus.getContent(this.item.state, this.item.type);
    let typeLabel = msg("Crawl");
    let typeIcon = "gear-wide-connected";

    if (isUpload) {
      typeLabel = msg("Upload");
      typeIcon = "upload";
    }

    const notApplicable = html`<span class="text-neutral-400"
      >${msg("n/a")}</span
    >`;

    return html`
      <btrix-table-row
        class=${this.href || this.checkbox
          ? "cursor-pointer select-none transition-colors hover:bg-neutral-50 focus-within:bg-neutral-50"
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
                      new CustomEvent<CheckboxChangeEventDetail>(
                        "btrix-checkbox-change",
                        {
                          detail: {
                            checked: (e.currentTarget as SlCheckbox).checked,
                          },
                        },
                      ),
                    );
                  }}
                ></sl-checkbox>
              </btrix-table-cell>
            `
          : nothing}
        <btrix-table-cell class="pr-0">
          ${this.showStatus
            ? html`
                <btrix-crawl-status
                  state=${this.item.state}
                  hideLabel
                  ?isUpload=${isUpload}
                ></btrix-crawl-status>
              `
            : html`
                <sl-tooltip
                  content=${msg(str`${typeLabel}: ${crawlStatus.label}`)}
                  @sl-hide=${(e: SlHideEvent) => e.stopPropagation()}
                  @sl-after-hide=${(e: SlHideEvent) => e.stopPropagation()}
                >
                  <sl-icon
                    style="color: ${crawlStatus.cssColor}"
                    name=${typeIcon}
                    label=${typeLabel}
                  ></sl-icon>
                </sl-tooltip>
              `}
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
        <btrix-table-cell>
          <sl-tooltip content=${msg(str`By ${this.item.userName}`)}>
            <sl-format-date
              lang=${getLocale()}
              class="truncate"
              date=${`${this.item.finished}Z`}
              month="2-digit"
              day="2-digit"
              year="2-digit"
              hour="2-digit"
              minute="2-digit"
            ></sl-format-date>
          </sl-tooltip>
        </btrix-table-cell>
        <btrix-table-cell>
          <sl-tooltip
            content=${formatNumber(this.item.fileSize || 0, {
              style: "unit",
              unit: "byte",
              unitDisplay: "long",
            })}
          >
            <sl-format-bytes
              class="truncate"
              value=${this.item.fileSize || 0}
              display="narrow"
            ></sl-format-bytes>
          </sl-tooltip>
        </btrix-table-cell>
        ${this.listType === "upload"
          ? nothing
          : html`
              <btrix-table-cell>
                ${isUpload
                  ? notApplicable
                  : html`<sl-tooltip
                      @click=${this.onTooltipClick}
                      content=${msg(
                        str`${formatNumber(
                          this.item.stats?.done ? +this.item.stats.done : 0,
                        )} crawled, ${formatNumber(this.item.stats?.found ? +this.item.stats.found : 0)} found`,
                      )}
                    >
                      <div>
                        ${formatNumber(
                          this.item.stats?.done ? +this.item.stats.done : 0,
                          {
                            notation: "compact",
                          },
                        )}
                      </div>
                    </sl-tooltip>`}
              </btrix-table-cell>
              <btrix-table-cell>
                ${isUpload
                  ? notApplicable
                  : html`<sl-tooltip
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
              <btrix-table-cell>
                ${isUpload
                  ? notApplicable
                  : html`<sl-tooltip
                      @click=${this.onTooltipClick}
                      content=${msg(
                        str`${formatNumber((this.item as Crawl).qaRunCount)} QA analysis run(s)`,
                      )}
                    >
                      <div>
                        ${formatNumber((this.item as Crawl).qaRunCount, {
                          notation: "compact",
                        })}
                      </div>
                    </sl-tooltip>`}
              </btrix-table-cell>
            `}

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

/**
 * @example Usage:
 * ```ts
 * <btrix-archived-item-list>
 *   <btrix-archived-item-list-item .item=${item}
 *   ></btrix-archived-item-list-item>
 * </btrix-archived-item-list>
 * ```
 *
 * @slot checkboxCell
 * @slot actionCell
 */
@localized()
@customElement("btrix-archived-item-list")
export class ArchivedItemList extends TailwindElement {
  static styles = css`
    btrix-table {
      --btrix-cell-gap: var(--sl-spacing-x-small);
      --btrix-cell-padding-left: var(--sl-spacing-small);
      --btrix-cell-padding-right: var(--sl-spacing-small);
    }

    btrix-table-body ::slotted(*:nth-of-type(n + 2)) {
      --btrix-border-top: 1px solid var(--sl-panel-border-color);
    }

    btrix-table-body ::slotted(*:first-of-type) {
      --btrix-border-radius-top: var(--sl-border-radius-medium);
    }

    btrix-table-body ::slotted(*:last-of-type) {
      --btrix-border-radius-bottom: var(--sl-border-radius-medium);
    }
  `;

  @property({ type: String })
  listType: ArchivedItem["type"] | null = null;

  @queryAssignedElements({ selector: "btrix-archived-item-list-item" })
  public items!: ArchivedItemListItem[];

  @state()
  private hasCheckboxCell = false;

  @state()
  private hasActionCell = false;

  render() {
    const headerCols: { cssCol: string; cell: TemplateResult<1> | symbol }[] = [
      {
        cssCol: "min-content",
        cell: html`<btrix-table-header-cell>
          <span class="sr-only">${msg("Type")}</span>
        </btrix-table-header-cell>`,
      },
      {
        cssCol: "[clickable-start] 50ch",
        cell: html`<btrix-table-header-cell>
          ${msg("Name")}
        </btrix-table-header-cell>`,
      },
      {
        cssCol: "12rem",
        cell: html`<btrix-table-header-cell>
          ${msg("Date Created")}
        </btrix-table-header-cell>`,
      },
      {
        cssCol: "1fr",
        cell: html`<btrix-table-header-cell>
          ${msg("Size")}
        </btrix-table-header-cell>`,
      },
    ];
    if (this.listType !== "upload") {
      headerCols.push(
        {
          cssCol: "1fr",
          cell: html`<btrix-table-header-cell>
            ${msg("Pages Crawled")}
          </btrix-table-header-cell>`,
        },
        {
          cssCol: "1fr",
          cell: html`<btrix-table-header-cell>
            ${msg("QA Rating")}
          </btrix-table-header-cell>`,
        },
        {
          cssCol: "1fr",
          cell: html`<btrix-table-header-cell>
            ${msg("Analysis Runs")}
          </btrix-table-header-cell>`,
        },
      );
    }
    if (this.hasCheckboxCell) {
      headerCols.unshift({
        cssCol: "min-content",
        cell: nothing, // renders into slot
      });
    }
    if (this.hasActionCell) {
      headerCols.push({
        cssCol: "[clickable-end] min-content",
        cell: nothing, // renders into slot
      });
    }

    return html`
      <style>
        btrix-table {
          grid-template-columns: ${headerCols
            .map(({ cssCol }) => cssCol)
            .join(" ")};
        }
      </style>
      <div class="overflow-auto">
        <btrix-table>
          <btrix-table-head class="mb-2">
            <slot
              name="checkboxCell"
              @slotchange=${(e: Event) =>
                (this.hasCheckboxCell =
                  (e.target as HTMLSlotElement).assignedElements().length > 0)}
            ></slot>
            ${headerCols.map(({ cell }) => cell)}
            <slot
              name="actionCell"
              @slotchange=${(e: Event) =>
                (this.hasActionCell =
                  (e.target as HTMLSlotElement).assignedElements().length > 0)}
            ></slot>
          </btrix-table-head>
          <btrix-table-body class="rounded border">
            <slot
              @slotchange=${() => {
                this.items.forEach((row) => {
                  row.listType = this.listType;
                });
              }}
            ></slot>
          </btrix-table-body>
        </btrix-table>
      </div>
    `;
  }
}
