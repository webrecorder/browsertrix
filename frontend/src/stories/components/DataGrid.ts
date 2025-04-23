// import { serialize } from "@shoelace-style/shoelace";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { nanoid } from "nanoid";

import type { DataGrid } from "@/components/ui/data-grid/data-grid";

import "@/components/ui/data-grid";

export type RenderProps = Pick<DataGrid, keyof DataGrid>;

const columns = "abcde".split("").map((field, i) => ({
  field,
  label: field.toUpperCase(),
  editable: i > 0,
})) satisfies RenderProps["columns"];
const items = Array.from({ length: 5 }).map((_, i) => ({
  ...columns.reduce(
    (obj, { field, label }) => ({
      ...obj,
      [field]: `${label}${i + 1}`,
    }),
    {},
  ),
  id: nanoid(),
})) satisfies RenderProps["items"];

export const defaultArgs = { columns, items } satisfies Pick<
  RenderProps,
  "columns" | "items"
>;

export const renderComponent = ({
  columns,
  items,
  repeatKey,
  label,
  stickyHeader,
  editRows,
  editCells,
}: Partial<RenderProps>) => {
  return html`
    <btrix-data-grid
      name="test"
      .columns=${columns || defaultArgs.columns}
      .items=${items || defaultArgs.items}
      repeatKey=${ifDefined(repeatKey)}
      label=${ifDefined(label)}
      ?stickyHeader=${stickyHeader}
      ?editRows=${editRows}
      ?editCells=${editCells}
      @btrix-change=${(e: CustomEvent) => {
        const el = e.target as DataGrid;

        console.log("el:", el);

        // if (el.form) {
        //   console.log("form values:", serialize(el.form));
        // }
      }}
    >
    </btrix-data-grid>
  `;
};
