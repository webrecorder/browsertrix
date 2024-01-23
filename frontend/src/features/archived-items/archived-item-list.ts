import { html, css, nothing, type TemplateResult } from "lit";
import {
  customElement,
  property,
  queryAssignedElements,
} from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import type { SlCheckbox } from "@shoelace-style/shoelace";

import { TailwindElement } from "@/classes/TailwindElement";
import type { ArchivedItem } from "@/types/crawler";
import { renderName } from "@/utils/crawler";
import { NavigateController } from "@/controllers/navigate";

/**
 * @slot checkbox - Checkbox column content
 * @slot prefix - Archived item name prefix
 * @slot actions - Action column content
 */
@localized()
@customElement("btrix-archived-item-list-item")
export class ArchivedItemListItem extends TailwindElement {
  static styles = css`
    :host {
      grid-column: var(--btrix-table-grid-column);
      display: grid;
      grid-template-columns: subgrid;
      height: 2.5rem;
    }

    btrix-table-cell {
      overflow: hidden;
    }

    btrix-table-row {
      position: relative;
    }

    .clickCell {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      /* background: rgba(255, 0, 0, 0.1); */
      grid-column: 2 / -2;
      display: grid;
      grid-template-columns: subgrid;
    }

    .name {
      display: flex;
      gap: var(--btrix-cell-gap);
      /* background: rgba(0, 0, 255, 0.5); */
      grid-column: span 1;
      align-items: center;
    }
  `;

  @property({ type: Object })
  item?: ArchivedItem;

  @property({ type: Number })
  index = 0;

  @property({ type: String })
  href?: string;

  @queryAssignedElements({
    slot: "checkbox",
    selector: "sl-checkbox",
    flatten: true,
  })
  checkbox!: Array<SlCheckbox>;

  private navigate = new NavigateController(this);

  render() {
    if (!this.item) return;
    const rowName = html`
      <div class="name">
        <slot name="prefix"></slot>
        ${renderName(this.item)}
      </div>
    `;
    return html`
      <btrix-table-row tabindex="0" @click=${() => this.checkbox[0]?.click()}>
        <btrix-table-cell class="p-0">
          <slot name="checkbox"></slot>
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.href
            ? html`<a
                class="clickCell"
                href=${this.href}
                @click=${this.navigate.link}
              >
                ${rowName}
              </a>`
            : html`<div class="clickCell">${rowName}</div>`}
        </btrix-table-cell>
        <btrix-table-cell style="grid-column-start: 3">
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
        <btrix-table-cell class="px-1">
          <slot name="actions"></slot>
        </btrix-table-cell>
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
 * @slot checkbox
 * @slot actions
 */
@localized()
@customElement("btrix-archived-item-list")
export class ArchivedItemList extends TailwindElement {
  static styles = css`
    btrix-table {
      --btrix-cell-gap: var(--sl-spacing-x-small);
      --btrix-cell-padding-left: var(--sl-spacing-small);
      --btrix-cell-padding-right: var(--sl-spacing-small);
      --btrix-table-grid-auto-columns: min-content 26rem 12rem 1fr 1fr 1fr
        min-content;
    }
  `;

  @queryAssignedElements({ selector: "btrix-archived-item-list-item" })
  items!: Array<ArchivedItemListItem>;

  render() {
    return html`
      <div class="overflow-auto">
        <btrix-table>
          <btrix-table-head class="mb-2">
            <btrix-table-header-cell class="p-0">
              <slot name="checkbox"></slot>
            </btrix-table-header-cell>
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
            <btrix-table-header-cell class="px-1">
              <slot name="actions"></slot>
            </btrix-table-header-cell>
          </btrix-table-head>
          <btrix-table-body class="border rounded overflow-hidden">
            <slot @slotchange=${this.onSlotChange}></slot>
          </btrix-table-body>
        </btrix-table>
      </div>
    `;
  }

  private onSlotChange() {
    this.items.forEach((item, i) => {
      if (i === 0) {
        item.classList.remove("border-t");
      } else {
        item.classList.add("border-t");
      }
    });
  }
}
