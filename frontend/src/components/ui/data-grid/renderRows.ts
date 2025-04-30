import { type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";

import type { GridItem, GridRowId, GridRows } from "./types";

export function renderRows<T = GridItem>(
  rows: GridRows<GridItem>,
  renderRow: ({ id, item }: { id: GridRowId; item: T }) => TemplateResult,
) {
  return repeat(
    rows,
    ([id]) => id,
    ([id, item]) => renderRow({ id, item: item as T }),
  );
}
