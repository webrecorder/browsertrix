import { css, html, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

type CellContent = string | TemplateResult<1>;

/**
 * Styled tables for handling lists of tabular data.
 * Data tables are less flexible than `<btrix-table>` but require less configuration.
 */
@customElement("btrix-data-table")
export class DataTable extends TailwindElement {
  // postcss-lit-disable-next-line
  static styles = css`
    btrix-table {
      --btrix-table-cell-gap: var(--sl-spacing-x-small);
      --btrix-table-cell-padding: var(--sl-spacing-x-small);
    }
  `;

  @property({ type: Array })
  columns: CellContent[] = [];

  @property({ type: Array })
  rows: CellContent[][] = [];

  /**
   * Array of CSS grid track widths
   * https://developer.mozilla.org/en-US/docs/Web/CSS/grid-auto-columns#values
   */
  @property({ type: Array })
  columnWidths: string[] = [];

  /**
   * Table border style
   */
  @property({ type: String })
  border?: "grid" | "horizontal";

  render() {
    const gridAutoColumnsStyle = this.columnWidths.length
      ? `--btrix-table-grid-template-columns: ${this.columnWidths.join(" ")}`
      : "";

    return html`
      <btrix-table
        class="relative h-full w-full rounded border"
        style=${gridAutoColumnsStyle}
      >
        <btrix-table-head
          class="sticky top-0 z-10 rounded-t-[0.1875rem] border-b bg-neutral-50"
        >
          ${this.columns.map(
            (content, i) => html`
              <btrix-table-header-cell class=${i > 0 ? "border-l" : ""}>
                ${content}
              </btrix-table-header-cell>
            `,
          )}
        </btrix-table-head>
        <btrix-table-body class="overflow-auto">
          ${this.rows.map(
            (cells, i) => html`
              <btrix-table-row class=${i > 0 ? "border-t" : ""}>
                ${cells.map(
                  (content, ii) =>
                    html`<btrix-table-cell class=${ii > 0 ? "border-l" : ""}
                      >${content}</btrix-table-cell
                    >`,
                )}
              </btrix-table-row>
            `,
          )}
        </btrix-table-body>
      </btrix-table>
    `;
  }
}
