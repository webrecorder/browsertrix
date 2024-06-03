import { localized, msg } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TableCell } from "./table-cell";

export const SortDirection = new Map([
  [-1, "descending"],
  [1, "ascending"],
]);

@localized()
@customElement("btrix-table-header-cell")
export class TableHeaderCell extends TableCell {
  @property({ type: Boolean })
  sortable = false;

  @property({ type: String, reflect: true, noAccessor: true })
  role = "columnheader";

  @property({ type: String, reflect: true })
  ariaSort: ARIAMixin["ariaSort"] = "none";

  render() {
    return html`
      <slot></slot>
      ${this.sortable ? this.renderSortIcon() : nothing}
    `;
  }

  private renderSortIcon() {
    if (this.ariaSort === "none") {
      return html`<sl-icon class="ml-1 text-base text-neutral-700"> </sl-icon>`;
    }

    return html`<sl-icon
      class="ml-1 text-base text-neutral-700"
      name=${this.ariaSort === "ascending" ? "sort-up-alt" : "sort-down"}
      label=${this.ariaSort === "ascending"
        ? msg("Ascending")
        : msg("Descending")}
    ></sl-icon>`;
  }
}
