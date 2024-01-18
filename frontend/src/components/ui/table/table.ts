import { LitElement, html, css } from "lit";
import {
  customElement,
  query,
  property,
  queryAssignedElements,
} from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { type TableHead } from "./table-head";

/**
 * Low-level component for displaying content as a table.
 * To style tables, use TailwindCSS utility classes.
 *
 * @example Usage:
 * ```ts
 * <btrix-table>
 *   <btrix-table-head class="border-b">
 *     <btrix-table-header-cell class="border-r">col 1 </btrix-table-header-cell>
 *     <btrix-table-header-cell>col 2</btrix-table-header-cell>
 *   </btrix-table-head>
 *   <btrix-table-body>
 *     <btrix-table-row class="border-b">
 *       <btrix-table-cell class="border-r">row 1 col 1</btrix-table-cell>
 *       <btrix-table-cell>row 1 col 2</btrix-table-cell>
 *     </btrix-table-row>
 *     <btrix-table-row>
 *       <btrix-table-cellclass="border-r">row 2 col 1</btrix-table-cell>
 *       <btrix-table-cell>row 2 col 2</btrix-table-cell>
 *     </btrix-table-row>
 *   </btrix-table-body>
 * </btrix-table>
 * ```
 *
 * Table columns will be automatically sized according to its content.
 * To specify column size, use `--btrix-table-grid-auto-columns`.
 *
 * @slot head
 * @slot
 * @csspart head
 * @cssproperty --btrix-cell-gap
 * @cssproperty --btrix-cell-padding-top
 * @cssproperty --btrix-cell-padding-left
 * @cssproperty --btrix-cell-padding-right
 * @cssproperty --btrix-cell-padding-bottom
 * @cssproperty --btrix-table-grid-auto-columns
 */
@customElement("btrix-table")
export class Table extends TailwindElement {
  static styles = css`
    :host {
      --btrix-cell-gap: 0;
      --btrix-cell-padding-top: 0;
      --btrix-cell-padding-bottom: 0;
      --btrix-cell-padding-left: 0;
      --btrix-cell-padding-right: 0;

      display: grid;
      grid-auto-columns: var(--btrix-table-grid-auto-columns, auto);
    }
  `;

  @property({ type: String, reflect: true, noAccessor: true })
  role = "table";

  @queryAssignedElements({ selector: "btrix-table-head" })
  private head!: Array<TableHead>;

  render() {
    return html`<slot @slotchange=${this.onSlotChange}></slot>`;
  }

  private async onSlotChange() {
    const headEl = this.head[0];
    if (!headEl) return;
    await headEl.updateComplete;

    this.style.setProperty(
      "--btrix-table-grid-column",
      `span ${headEl.colCount}`
    );
  }
}
