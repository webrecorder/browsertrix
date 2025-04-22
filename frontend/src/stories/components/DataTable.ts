import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { DataTable } from "@/components/ui/data-table";

import "@/components/ui/table";
import "@/components/ui/data-table";

export type RenderProps = DataTable & {
  classes?: string;
};

const columns = ["A", "B", "C"] satisfies RenderProps["columns"];
const rows = Array.from({ length: 5 }).map((_, i) =>
  columns.map((col) => `${col}${i + 1}`),
) satisfies RenderProps["columns"];

export const defaultArgs = {
  columns,
  rows,
} satisfies Pick<RenderProps, "columns" | "rows">;

export const renderDataTable = ({
  columns,
  rows,
  columnWidths,
  classes,
}: Partial<RenderProps>) => {
  return html`
    <btrix-data-table
      class=${ifDefined(classes)}
      .columns=${columns || []}
      .rows=${rows || []}
      .columnWidths=${columnWidths || []}
    >
    </btrix-data-table>
  `;
};
