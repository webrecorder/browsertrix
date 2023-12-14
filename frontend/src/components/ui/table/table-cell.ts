import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("btrix-table-cell")
export class TableCell extends LitElement {
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
    return html`<div class="cell" role="cell" part="base">
      <slot></slot>
    </div>`;
  }
}
