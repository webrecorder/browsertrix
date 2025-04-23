import { serialize } from "@shoelace-style/shoelace";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { nanoid } from "nanoid";

import type { DataGrid } from "@/components/ui/data-grid/data-grid";

import "@/components/ui/data-grid";

export type RenderProps = Pick<
  DataGrid,
  // TODO Get from type
  "columns" | "items" | "repeatKey" | "editable" | "label"
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
  label,
}: RenderProps) => {
  return html`
    <btrix-data-grid
      name="test"
      .columns=${columns || defaultArgs.columns}
      .items=${items || defaultArgs.items}
      repeatKey=${ifDefined(repeatKey)}
      label=${ifDefined(label)}
      ?editable=${editable}
      @btrix-change=${(e: CustomEvent) => {
        const el = e.target as DataGrid;

        if (el.form) {
          console.log("form values:", serialize(el.form));
        }
      }}
    >
    </btrix-data-grid>
  `;
};
