import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("btrix-table-cell")
export class TableCell extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .cell {
      display: flex;
      gap: var(--btrix-cell-gap, 0);
      align-items: center;
      height: 100%;
      box-sizing: border-box;
      padding: var(--btrix-cell-padding-top) var(--btrix-cell-padding-right)
        var(--btrix-cell-padding-bottom) var(--btrix-cell-padding-left);
      border-top: var(--btrix-cell-border-top);
      border-left: var(--btrix-cell-border-left);
      border-right: var(--btrix-cell-border-right);
      border-bottom: var(--btrix-cell-border-bottom);
    }
  `;

  render() {
    return html`<div class="cell" role="cell" part="base">
      <slot></slot>
    </div>`;
  }
}
