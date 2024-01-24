import { html, css, nothing, type TemplateResult } from "lit";
import {
  customElement,
  property,
  state,
  queryAssignedElements,
} from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import { TailwindElement } from "@/classes/TailwindElement";
import type { ArchivedItem } from "@/types/crawler";
import { renderName } from "@/utils/crawler";
import { NavigateController } from "@/controllers/navigate";

const NAME_WIDTH_CSS = css`26rem`;

/**
 * @slot checkboxCell - Checkbox cell
 * @slot actionCell - Action cell
 * @slot namePrefix - Prefix name in cell
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
      position: relative;
      height: 2.5rem;
    }

    btrix-table-cell {
      overflow: hidden;
    }

    .clickRegionCell {
      display: grid;
      grid-template-columns: subgrid;
    }

    .clickRegion {
      position: absolute;
      inset: 0;
      grid-column: var(--btrix-click-cell-grid-column);
    }

    .name {
      width: ${NAME_WIDTH_CSS};
    }
  `;

  @property({ type: Object })
  item?: ArchivedItem;

  @property({ type: Number })
  index = 0;

  @property({ type: String })
  href?: string;

  @state()
  private checkboxID: string | null = null;

  private navigate = new NavigateController(this);

  render() {
    if (!this.item) return;
    const rowName = html`
      <btrix-table-cell class="name" role="generic">
        <slot name="namePrefix"></slot>
        ${renderName(this.item)}
      </btrix-table-cell>
    `;
    return html`
      <btrix-table-row
        class=${this.href
          ? "cursor-pointer transition-colors hover:bg-neutral-50 focus-within:bg-neutral-50"
          : ""}
      >
        <slot
          name="checkboxCell"
          @slotchange=${(e: Event) => {
            const cell = (e.target as HTMLSlotElement).assignedElements()[0];
            if (!cell) return;

            const checkbox = cell.querySelector("sl-checkbox");
            if (!checkbox) return;

            let id = checkbox.getAttribute("id");
            if (!id) {
              id = `${this.item?.id}-checkbox`;
              checkbox.setAttribute("id", id);
            }
            this.checkboxID = id;
          }}
        ></slot>
        <btrix-table-cell class="clickRegionCell">
          ${this.href
            ? html`<a
                class="clickRegion"
                href=${this.href}
                @click=${this.navigate.link}
              >
                ${rowName}
              </a>`
            : this.checkboxID
            ? html`<label class="clickRegion" for=${this.checkboxID}>
                ${rowName}
              </label>`
            : html`<div class="clickRegion">${rowName}</div>`}
        </btrix-table-cell>
        <btrix-table-cell>
          <sl-format-date
            class="truncate"
            date=${`${this.item.finished}Z`}
            month="2-digit"
            day="2-digit"
            year="2-digit"
            hour="2-digit"
            minute="2-digit"
          ></sl-format-date>
        </btrix-table-cell>
        <btrix-table-cell>
          <sl-format-bytes
            class="truncate"
            value=${this.item.fileSize || 0}
            display="narrow"
          ></sl-format-bytes>
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.item.type === "crawl"
            ? html`<div class="truncate">
                ${(this.item.stats?.done || 0).toLocaleString()}
              </div>`
            : html`<span class="text-neutral-400">${msg("n/a")}</span>`}
        </btrix-table-cell>
        <btrix-table-cell>
          <div class="truncate">${this.item.userName}</div>
        </btrix-table-cell>
        <slot name="actionCell"></slot>
      </btrix-table-row>
    `;
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
  `;

  @queryAssignedElements({ selector: "btrix-archived-item-list-item" })
  items!: Array<ArchivedItemListItem>;

  @state()
  private hasCheckboxCell = false;

  @state()
  private hasActionCell = false;

  render() {
    return html`
      <style>
        btrix-table {
          --btrix-table-grid-auto-columns: ${`${
            this.hasCheckboxCell ? "min-content" : ""
          } ${NAME_WIDTH_CSS} 12rem 1fr 1fr 1fr ${
            this.hasActionCell ? "min-content" : ""
          }`.trim()};
          --btrix-click-cell-grid-column: ${this.hasCheckboxCell ? 2 : 1} /
            -${this.hasActionCell ? 2 : 1};
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
            <btrix-table-header-cell>${msg("Name")}</btrix-table-header-cell>
            <btrix-table-header-cell>
              ${msg("Date Created")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>${msg("Size")}</btrix-table-header-cell>
            <btrix-table-header-cell
              >${msg("Pages Crawled")}</btrix-table-header-cell
            >
            <btrix-table-header-cell>
              ${msg("Created By")}
            </btrix-table-header-cell>
            <slot
              name="actionCell"
              @slotchange=${(e: Event) =>
                (this.hasActionCell =
                  (e.target as HTMLSlotElement).assignedElements().length > 0)}
            ></slot>
          </btrix-table-head>
          <btrix-table-body class="border rounded overflow-hidden">
            <slot></slot>
          </btrix-table-body>
        </btrix-table>
      </div>
    `;
  }
}
