import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

@customElement("btrix-table-row")
export class TableRow extends TailwindElement {
  static styles = css`
    :host {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: subgrid;
      position: relative;
    }
  `;

  @property({ type: String, reflect: true, noAccessor: true })
  role = "row";

  render() {
    return html`<slot></slot>`;
  }
}
