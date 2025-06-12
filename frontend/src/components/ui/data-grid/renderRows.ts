import { type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { EmptyObject } from "type-fest";

import type { GridItem, GridRowId, GridRows } from "./types";

export function renderRows<T = GridItem>(
  rows: GridRows<T | EmptyObject>,
  renderRow: (
    { id, item }: { id: GridRowId; item: T | EmptyObject },
    index: number,
  ) => TemplateResult,
) {
  return repeat(
    rows,
    ([id]) => id,
    ([id, item], i) => renderRow({ id, item }, i),
  );
}
