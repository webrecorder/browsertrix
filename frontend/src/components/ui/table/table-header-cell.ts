import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

import { TableCell } from "./table-cell";

@customElement("btrix-table-header-cell")
export class TableHeaderCell extends TableCell {
  render() {
    return html`<div
      class="cell"
      role="columnheader"
      aria-sort="none"
      part="base"
    >
      <slot></slot>
    </div>`;
  }
}
