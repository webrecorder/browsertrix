import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { nanoid } from "nanoid";

import type { DataGrid } from "@/components/ui/data-grid/data-grid";

import "@/components/ui/data-grid";

export type RenderProps = Pick<
  DataGrid,
  "columns" | "items" | "repeatKey" | "editable"
>;

const columns = "abcde".split("").map((field) => ({
  field,
  label: field.toUpperCase(),
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
  editable,
}: RenderProps) => {
  return html`
    <btrix-data-grid
      .columns=${columns || defaultArgs.columns}
      .items=${items || defaultArgs.items}
      repeatKey=${ifDefined(repeatKey)}
      ?editable=${editable}
    >
    </btrix-data-grid>
  `;
};
