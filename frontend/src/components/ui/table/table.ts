import { css, html, LitElement } from "lit";
import {
  customElement,
  property,
  queryAssignedElements,
} from "lit/decorators.js";

import { type TableHead } from "./table-head";
import tableCSS from "./table.stylesheet.css";

import { theme } from "@/theme";

// Add table CSS to theme CSS to make it available throughout the app,
// to both shadow and light dom components.
// TODO Remove once all `LiteElement`s are migrated over to `TailwindElement`
tableCSS.split("}").forEach((rule: string) => {
  if (!rule.trim()) return;
  theme.insertRule(`${rule}}`);
});

/**
 * Low-level component for displaying content into columns and rows.
 * To style tables, use TailwindCSS utility classes.
 * To render styled, tabular data, use `<btrix-data-table>`.
 *
 * Table columns will be automatically sized according to its content.
 * To specify column size, use `grid-template-columns`.
 *
 * @slot head
 * @slot
 * @csspart head
 * @cssproperty --btrix-column-gap
 * @cssproperty --btrix-cell-gap
 * @cssproperty --btrix-cell-padding-top
 * @cssproperty --btrix-cell-padding-left
 * @cssproperty --btrix-cell-padding-right
 * @cssproperty --btrix-cell-padding-bottom
 */
@customElement("btrix-table")
export class Table extends LitElement {
  static styles = css`
    :host {
      --btrix-column-gap: 0;
      --btrix-cell-gap: 0;
      --btrix-cell-padding-top: 0;
      --btrix-cell-padding-bottom: 0;
      --btrix-cell-padding-left: 0;
      --btrix-cell-padding-right: 0;

      display: grid;
      column-gap: var(--btrix-column-gap, 0);
    }
  `;

  @property({ type: String, reflect: true, noAccessor: true })
  role = "table";

  @queryAssignedElements({ selector: "btrix-table-head" })
  private readonly head!: TableHead[];

  render() {
    return html`<slot @slotchange=${this.onSlotChange}></slot>`;
  }

  private async onSlotChange() {
    const headEl = this.head[0] as TableHead | undefined;
    if (!headEl) return;
    await headEl.updateComplete;

    this.style.setProperty(
      "--btrix-table-grid-column",
      `span ${headEl.colCount}`,
    );
  }
}
