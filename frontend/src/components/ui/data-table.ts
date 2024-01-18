import { html, css, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

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
export class DataTable extends TailwindElement {
  // postcss-lit-disable-next-line
  static styles = css`
    btrix-table {
      --btrix-cell-gap: var(--sl-spacing-x-small);
      --btrix-cell-padding-top: var(--sl-spacing-x-small);
      --btrix-cell-padding-bottom: var(--sl-spacing-x-small);
      --btrix-cell-padding-left: var(--sl-spacing-x-small);
      --btrix-cell-padding-right: var(--sl-spacing-x-small);
    }
  `;

  @property({ type: Array })
  columns: CellContent[] = [];

  @property({ type: Array })
  rows: Array<CellContent[]> = [];

  // Array of CSS grid track widths
  // https://developer.mozilla.org/en-US/docs/Web/CSS/grid-auto-columns#values
  @property({ type: Array })
  columnWidths: string[] = [];

  render() {
    const gridAutoColumnsStyle = `--btrix-table-grid-auto-columns: ${
      this.columnWidths.length
        ? this.columnWidths.join(" ")
        : "minmax(max-content, auto)"
    }`;
    return html`
      <btrix-table
        class="border rounded overflow-auto"
        style=${gridAutoColumnsStyle}
      >
        <btrix-table-head class="border-b rounded-t bg-neutral-50">
          ${this.columns.map(
            (content, i) => html`
              <btrix-table-header-cell class=${i > 0 ? "border-l" : ""}>
                ${content}
              </btrix-table-header-cell>
            `
          )}
        </btrix-table-head>
        <btrix-table-body>
          ${this.rows.map(
            (cells, i) => html`
              <btrix-table-row class=${i > 0 ? "border-t" : ""}>
                ${cells.map(
                  (content, ii) =>
                    html`<btrix-table-cell class=${ii > 0 ? "border-l" : ""}
                      >${content}</btrix-table-cell
                    >`
                )}
              </btrix-table-row>
            `
          )}
        </btrix-table-body>
      </btrix-table>
    `;
  }
}
