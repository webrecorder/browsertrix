import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("btrix-table-header-cell")
export class TableHeaderCell extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .cell {
      height: 100%;
      box-sizing: border-box;
    }
  `;

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
