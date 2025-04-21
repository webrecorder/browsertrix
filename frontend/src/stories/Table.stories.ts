import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { defaultArgs, renderTable, type RenderProps } from "./Table";

import type { Table as TableComponent } from "@/components/ui/table/table";

const meta = {
  component: "btrix-table",
  subcomponents: {
    TableHead: "btrix-table-head",
    TableHeaderCell: "btrix-table-header-cell",
    TableBody: "btrix-table-body",
    TableRow: "btrix-table-row",
    TableCell: "btrix-table-cell",
  },
  render: renderTable,
  tags: ["autodocs"],
  argTypes: {
    head: { table: { disable: true } },
    body: { table: { disable: true } },
  },
  args: defaultArgs,
  parameters: {
    options: {
      showPanel: false,
    },
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<TableComponent>;

export const BasicTable: Story = {
  args: {},
};

export const BorderedTable: Story = {
  args: {
    head: html``,
  },
};
