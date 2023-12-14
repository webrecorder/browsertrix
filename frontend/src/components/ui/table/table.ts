import { LitElement, html, css } from "lit";
import { customElement, query, queryAssignedElements } from "lit/decorators.js";
import { type TableHeaderCell } from "./table-header-cell";
import { type TableRow } from "./table-row";

/**
 * @example Usage:
 * ```ts
 * <btrix-table>
 *   <btrix-table-header-cell slot="head">col 1 </btrix-table-header-cell>
 *   <btrix-table-header-cell slot="head">col 2</btrix-table-header-cell>
 *   <btrix-table-row>
 *     <btrix-table-cell>row 1 col 1</btrix-table-cell>
 *     <btrix-table-cell>row 1 col 2</btrix-table-cell>
 *   </btrix-table-row>
 *   <btrix-table-row>
 *     <btrix-table-cell>row 2 col 1</btrix-table-cell>
 *     <btrix-table-cell>row 2 col 2</btrix-table-cell>
 *   </btrix-table-row>
 * </btrix-table>
 * ```
 */
@customElement("btrix-table")
export class Table extends LitElement {
  static styles = css`
    .table {
      display: grid;
      grid-template-columns: min-content;
    }

    .head,
    .body {
      grid-column: var(--btrix-table-grid-column);
      display: grid;
      grid-template-columns: subgrid;
    }
  `;

  @queryAssignedElements({
    slot: "head",
    selector: "btrix-table-header-cell",
  })
  private headerCells!: Array<TableHeaderCell>;

  render() {
    return html`
      <div class="table" role="table">
        <div class="head" role="rowgroup" part="head">
          <btrix-table-row class="headerRow">
            <slot name="head"></slot>
          </btrix-table-row>
        </div>
        <div class="body" role="rowgroup" part="body">
          <slot @slotchange=${this.onSlotChange}></slot>
        </div>
      </div>
    `;
  }

  private onSlotChange() {
    this.style.setProperty(
      "--btrix-table-grid-column",
      `span ${this.headerCells.length || 1}`
    );
  }
}
