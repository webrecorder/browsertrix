import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * @cssproperty --btrix-table-grid-column
 */
@customElement("btrix-table-body")
export class TableBody extends LitElement {
  static styles = css`
    :host {
      grid-column: var(--btrix-table-grid-column);
      display: grid;
      grid-template-columns: subgrid;
      color: var(--sl-color-neutral-900);
    }
  `;

  @property({ type: String, reflect: true, noAccessor: true })
  role = "rowgroup";

  render() {
    return html`<slot></slot>`;
  }
}
