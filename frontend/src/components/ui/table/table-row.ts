import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("btrix-table-row")
export class TableRow extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .row {
      grid-column: var(--btrix-table-grid-column);
      display: grid;
      grid-template-columns: subgrid;
    }
  `;

  render() {
    return html`<div
      class="row"
      role="row"
      part="base"
      tabindex=${
        /* Inherit tabindex, which won't work with display:contents */ this
          .tabIndex
      }
    >
      <slot></slot>
    </div>`;
  }
}
