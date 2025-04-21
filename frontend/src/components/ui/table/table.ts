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
 * Table columns are automatically sized according to their content.
 * To specify column sizes, use the `grid-cols-[<value>]` Tailwind class
 * to modify the CSS `grid-template-columns` property.
 *
 * @slot head
 * @slot
 * @csspart head
 * @cssproperty --btrix-table-column-gap
 * @cssproperty --btrix-table-grid-template-columns
 */
@customElement("btrix-table")
export class Table extends LitElement {
  static styles = css`
    :host {
      display: grid;
      column-gap: var(--btrix-table-column-gap, 0);
      grid-template-columns: var(--btrix-table-grid-template-columns);
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

    console.log(
      "--btrix-table-grid-template-columns:",
      this.style.getPropertyValue("--btrix-table-grid-template-columns"),
    );

    if (!this.style.getPropertyValue("--btrix-table-grid-template-columns")) {
      // `grid-template-columns` must be defined in order for spanning all
      // columns in a subgrid to work.
      // See https://github.com/w3c/csswg-drafts/issues/2402
      this.style.setProperty(
        "--btrix-table-grid-template-columns",
        `repeat(${headEl.colCount}, auto)`,
      );
    }
  }
}
