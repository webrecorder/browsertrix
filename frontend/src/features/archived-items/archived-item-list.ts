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

function renderName(item: ArchivedItem) {
  if (item.name) return html`<span>${item.name}</span>`;
  if (item.firstSeed && item.seedCount) {
    const remainder = item.seedCount - 1;
    let nameSuffix: string | TemplateResult<1> = "";
    if (remainder) {
      if (remainder === 1) {
        nameSuffix = html`<span class="ml-1"
          >${msg(str`+${remainder} URL`)}</span
        >`;
      } else {
        nameSuffix = html`<span class="ml-1"
          >${msg(str`+${remainder} URLs`)}</span
        >`;
      }
    }
    return html`
      <div class="overflow-hidden whitespace-nowrap flex">
        <span class="truncate min-w-0">${item.firstSeed}</span>
        <span>${nameSuffix}</span>
      </div>
    `;
  }

  return html`<span class="text-neutral-500">${msg("(unnamed item)")}</span>`;
}

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
  `;

  @property({ type: Object })
  item?: ArchivedItem;

  @property({ type: Number })
  index = 0;

  @queryAssignedElements({
    slot: "checkbox",
    selector: "sl-checkbox",
    flatten: true,
  })
  checkbox!: Array<SlCheckbox>;

  render() {
    if (!this.item) return;
    return html`
      <btrix-table-row tabindex="0" @click=${() => this.checkbox[0]?.click()}>
        <btrix-table-cell class="p-0">
          <slot name="checkbox"></slot>
        </btrix-table-cell>
        <btrix-table-cell>
          <slot name="prefix"></slot>
          ${renderName(this.item)}
        </btrix-table-cell>
        <btrix-table-cell>
          <sl-format-date
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
            value=${this.item.fileSize || 0}
            display="narrow"
          ></sl-format-bytes>
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.item.type === "crawl"
            ? this.item.stats?.done
            : html`<span class="text-neutral-400">${msg("n/a")}</span>`}
        </btrix-table-cell>
        <btrix-table-cell><span>${this.item.userName}</span></btrix-table-cell>
        <btrix-table-cell>
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
      --btrix-table-grid-auto-columns: min-content minmax(26rem, auto)
        minmax(12rem, auto) 1fr 1fr 1fr min-content;
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
            <btrix-table-header-cell
              ><slot name="actions"></slot
            ></btrix-table-header-cell>
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
