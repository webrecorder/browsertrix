import { css, html } from "lit";
import {
  customElement,
  property,
  queryAssignedElements,
} from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

export const ALLOWED_ROW_CLICK_TARGET_TAG = ["a", "label"] as const;

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
 * @cssproperty --btrix-table-cell-gap
 * @cssproperty --btrix-table-cell-padding
 * @cssproperty --btrix-table-cell-padding-x
 * @cssproperty --btrix-table-cell-padding-y
 * @cssproperty --btrix-table-cell-padding-top
 * @cssproperty --btrix-table-cell-padding-left
 * @cssproperty --btrix-table-cell-padding-right
 * @cssproperty --btrix-table-cell-padding-bottom
 */
@customElement("btrix-table-cell")
export class TableCell extends TailwindElement {
  static styles = css`
    :host {
      --cell-padding: var(--btrix-table-cell-padding, 0);
      --cell-padding-x: var(--btrix-table-cell-padding-x, var(--cell-padding));
      --cell-padding-y: var(--btrix-table-cell-padding-y, var(--cell-padding));

      display: flex;
      gap: var(--btrix-table-cell-gap, 0);
      align-items: center;
      height: 100%;
      box-sizing: border-box;
      padding: var(--btrix-table-cell-padding-top, var(--cell-padding-y))
        var(--btrix-table-cell-padding-right, var(--cell-padding-x))
        var(--btrix-table-cell-padding-bottom, var(--cell-padding-y))
        var(--btrix-table-cell-padding-left, var(--cell-padding-x));
    }
  `;

  @property({ type: String, reflect: true, noAccessor: true })
  role = "cell";

  @property({ type: String })
  rowClickTarget?: (typeof ALLOWED_ROW_CLICK_TARGET_TAG)[number];

  @queryAssignedElements({ selector: ".rowClickTarget" })
  public rowClickTargetEl?: HTMLElement[];

  render() {
    return html`<slot @slotchange=${this.handleSlotChange}></slot>`;
  }

  private handleSlotChange(e: Event) {
    if (!this.rowClickTarget) return;
    const elems = (e.target as HTMLSlotElement).assignedElements();
    const rowClickTarget = elems.find(
      (el) => el.tagName.toLowerCase() === this.rowClickTarget,
    );

    if (!rowClickTarget) return;

    // Styled in table.css
    rowClickTarget.classList.add("rowClickTarget");
  }
}
