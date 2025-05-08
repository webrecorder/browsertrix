import { Directive, type PartInfo } from "lit/directive.js";

import type { DataGridCell } from "./data-grid-cell";
import type { GridColumn } from "./types";

/**
 * Directive for replacing `renderCell` and `renderEditCell`
 * methods with custom render functions.
 */
export class CellDirective extends Directive {
  private readonly element?: DataGridCell;

  constructor(partInfo: PartInfo & { element?: DataGridCell }) {
    super(partInfo);
    this.element = partInfo.element;
  }

  render(col: GridColumn) {
    if (!this.element) return;

    if (col.renderCell) {
      this.element.renderCell = col.renderCell;
    }

    if (col.renderEditCell) {
      this.element.renderEditCell = col.renderEditCell;
    }
  }
}
