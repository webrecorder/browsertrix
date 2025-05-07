import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { nanoid } from "nanoid";

import type { DataGrid } from "@/components/ui/data-grid/data-grid";
import type { BtrixRowClickEvent } from "@/components/ui/data-grid/events/btrix-row-click";

import "@/components/ui/data-grid";

export type RenderProps = Pick<DataGrid, keyof DataGrid>;

export const makeItems = (n: number) =>
  Array.from({ length: n }).map((_, i) => ({
    ...columns.reduce(
      (obj, { field, label }) => ({
        ...obj,
        [field]: `${label}${i + 1}`,
      }),
      {},
    ),
    id: nanoid(),
  })) satisfies RenderProps["items"];

const columns = "abcde".split("").map((field, i) => ({
  field,
  label: field.toUpperCase(),
  editable: i > 0,
})) satisfies RenderProps["columns"];
const items = makeItems(10);

export const defaultArgs = { columns, items } satisfies Pick<
  RenderProps,
  "columns" | "items"
>;

export const renderComponent = ({
  columns,
  items,
  formControlLabel,
  stickyHeader,
  rowsAddible,
  addRowsInputValue,
  rowsRemovable,
  rowsClickable,
  editCells,
  defaultItem,
}: Partial<RenderProps>) => {
  return html`
    <btrix-data-grid
      .columns=${columns || defaultArgs.columns}
      .items=${items || defaultArgs.items}
      .defaultItem=${defaultItem}
      formControlLabel=${ifDefined(formControlLabel)}
      stickyHeader=${ifDefined(stickyHeader)}
      ?rowsAddible=${rowsAddible}
      addRowsInputValue=${ifDefined(addRowsInputValue)}
      ?rowsRemovable=${rowsRemovable}
      ?rowsClickable=${rowsClickable}
      ?editCells=${editCells}
      @btrix-row-click=${(e: BtrixRowClickEvent) => {
        console.log("row clicked:", e.detail);
      }}
    >
    </btrix-data-grid>
  `;
};
