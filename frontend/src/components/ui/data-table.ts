import { css, html, type TemplateResult } from "lit";
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
    :host {
      --btrix-cell-padding: var(--sl-spacing-x-small);
    }

    btrix-table {
      --btrix-cell-gap: var(--sl-spacing-x-small);
    }

    btrix-table-head {
      --padding: var(--sl-spacing-x-small);

      --btrix-cell-padding-top: var(--padding);
      --btrix-cell-padding-bottom: var(--padding);
      --btrix-cell-padding-left: var(--padding);
      --btrix-cell-padding-right: var(--padding);
    }

    btrix-table-body {
      --btrix-cell-padding-top: var(--btrix-cell-spacing);
      --btrix-cell-padding-bottom: var(--btrix-cell-spacing);
      --btrix-cell-padding-left: var(--btrix-cell-spacing);
      --btrix-cell-padding-right: var(--btrix-cell-spacing);
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
    const gridAutoColumnsStyle = `grid-template-columns: ${
      this.columnWidths.length
        ? this.columnWidths.join(" ")
        : "minmax(max-content, auto)"
    }`;
    return html`
      <btrix-table
        class="relative h-full w-full rounded border"
        style=${gridAutoColumnsStyle}
      >
        <btrix-table-head
          class="sticky top-0 z-10 rounded-t-[0.1875rem] border-b bg-slate-50"
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
