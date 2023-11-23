import type { TemplateResult } from "lit";
import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

type CellContent = string | TemplateResult<1>;

/**
 * Styled data table
 *
 * Usage example:
 * ```ts
 * <btrix-data-table
 *   .columns=${[html`A`, html`B`, html`C`]}
 *   .rows=${[
 *     [html`1a`, html`1b`, html`1c`],
 *     [html`2a`, html`2b`, html`2c`],
 *   ]}
 *   .columnWidths=${["100%", "20rem"]}
 * >
 * </btrix-data-table>
 * ```
 */
@customElement("btrix-data-table")
export class DataTable extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .table {
      display: table;
      table-layout: fixed;
      font-family: var(--font-monostyle-family);
      font-variation-settings: var(--font-monostyle-variation);
      width: 100%;
    }

    .thead {
      display: table-header-group;
    }

    .tbody {
      display: table-row-group;
    }

    .row {
      display: table-row;
    }

    .cell {
      display: table-cell;
      vertical-align: middle;
    }

    .cell:nth-of-type(n + 2) {
      border-left: 1px solid var(--sl-panel-border-color);
    }

    .cell[role="cell"] {
      border-top: 1px solid var(--sl-panel-border-color);
    }

    .cell.padSmall {
      padding: var(--sl-spacing-2x-small);
    }

    .cell.padded {
      padding: var(--sl-spacing-x-small);
    }

    .thead .row {
      background-color: var(--sl-color-neutral-50);
      color: var(--sl-color-neutral-700);
      font-size: var(--sl-font-size-x-small);
      line-height: 1rem;
      text-transform: uppercase;
    }
  `;

  @property({ type: Array })
  columns: CellContent[] = [];

  @property({ type: Array })
  rows: Array<CellContent[]> = [];

  // Array of CSS widths
  @property({ type: Array })
  columnWidths: string[] = [];

  render() {
    return html`
      <div role="table" class="table">
        <div role="rowgroup" class="thead">
          <div role="row" class="row">
            ${this.columns.map(this.renderColumnHeader)}
          </div>
        </div>
        <div role="rowgroup" class="tbody">
          ${this.rows.map(this.renderRow)}
        </div>
      </div>
    `;
  }

  private renderColumnHeader = (cell: CellContent, index: number) => html`
    <div
      role="columnheader"
      class="cell padded"
      style=${this.columnWidths[index]
        ? `width: ${this.columnWidths[index]}`
        : ""}
    >
      ${cell}
    </div>
  `;

  private renderRow = (cells: CellContent[]) => html`
    <div role="row" class="row">${cells.map(this.renderCell)}</div>
  `;

  private renderCell = (cell: CellContent) => {
    const shouldPadSmall =
      typeof cell === "string"
        ? false
        : // TODO better logic to check template component
          cell.strings[0].startsWith("<sl-");
    return html`
      <div role="cell" class="cell ${shouldPadSmall ? "padSmall" : "padded"}">
        ${cell}
      </div>
    `;
  };
}
