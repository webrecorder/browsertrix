import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * @example Usage as row click target:
 * ```ts
 * <btrix-table-cell>
 *  <a href="#">Clicking the row clicks me</a>
 * </btrix-table-cell>
 * ```
 *
 * @cssproperty --btrix-cell-gap
 * @cssproperty --btrix-cell-padding-top
 * @cssproperty --btrix-cell-padding-left
 * @cssproperty --btrix-cell-padding-right
 * @cssproperty --btrix-cell-padding-bottom
 */
@customElement("btrix-table-cell")
export class TableCell extends LitElement {
  static styles = css`
    :host {
      display: flex;
      gap: var(--btrix-cell-gap, 0);
      align-items: center;
      height: 100%;
      box-sizing: border-box;
      padding: var(--btrix-cell-padding-top) var(--btrix-cell-padding-right)
        var(--btrix-cell-padding-bottom) var(--btrix-cell-padding-left);
    }
  `;

  @property({ type: String, reflect: true, noAccessor: true })
  role = "cell";

  render() {
    return html`<slot></slot>`;
  }
}
