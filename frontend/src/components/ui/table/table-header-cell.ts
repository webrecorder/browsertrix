import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TableCell } from "./table-cell";

import type { SortDirection as Direction } from "@/types/utils";

export type SortValues = "ascending" | "descending" | "none";
export const SortDirection = new Map<Direction, SortValues>([
  [-1, "descending"],
  [1, "ascending"],
]);

@customElement("btrix-table-header-cell")
export class TableHeaderCell extends TableCell {
  @property({ type: String, reflect: true, noAccessor: true })
  role = "columnheader";

  @property({ type: String, reflect: true, noAccessor: true })
  scope?: "row" | "col";

  @property({ type: String, reflect: true })
  ariaSort: SortValues = "none";

  render() {
    return html` <slot></slot> `;
  }
}
