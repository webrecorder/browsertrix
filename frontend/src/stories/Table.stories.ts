import type { Meta, StoryObj } from "@storybook/web-components";

import { defaultArgs, renderTable, type RenderProps } from "./Table";

import type { Table as TableComponent } from "@/components/ui/table/table";

const meta = {
  component: "btrix-table",
  subcomponents: {
    TableRow: "btrix-table-row",
  },
  render: renderTable,
  tags: ["autodocs"],
  argTypes: {
    columns: { table: { disable: true } },
    rows: { table: { disable: true } },
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
