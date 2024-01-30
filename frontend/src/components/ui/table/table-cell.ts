import {
  LitElement,
  html,
  css,
  unsafeCSS,
  type PropertyValues,
  nothing,
} from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * @example Usage as row click target:
 * ```ts
 * <style>
 *  btrix-table {
 *    grid-template-columns: 20px [clickable-start] 50px 100px [clickable-end];
 *  }
 * </style>
 * <btrix-table-cell rowClickTarget="a">
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

  @property({ type: String })
  rowClickTarget = "";

  render() {
    return html` ${this.rowClickTarget
        ? html`<style>
            :host {
              display: grid;
              grid-template-columns: subgrid;
            }

            ::slotted(${unsafeCSS(this.rowClickTarget)}) {
              position: absolute;
              inset: 0;
              grid-column: clickable-start / clickable-end;
            }
          </style>`
        : nothing}
      <slot></slot>`;
  }
}
