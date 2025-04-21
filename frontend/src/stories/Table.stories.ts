import type { Meta, StoryObj } from "@storybook/web-components";

import {
  defaultArgs,
  renderBody,
  renderHead,
  renderTable,
  type RenderProps,
} from "./Table";
import data from "./Table.data";

import type { Table as TableComponent } from "@/components/ui/table/table";
import { tw } from "@/utils/tailwind";

const meta = {
  title: "Components/Table",
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
    classes: { table: { disable: true } },
  },
  args: defaultArgs,
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<TableComponent>;

/**
 * By default, tables do not have any visual separators between rows or columns.
 */
export const BasicTable: Story = {
  args: {},
};

/**
 * Tables can be styled to have borders between rows (aka horizontal rules) using Tailwind.
 */
export const StylingBorderedTable: Story = {
  name: "Styling - Borders",
  args: {
    classes: tw`relative h-full w-full rounded border`,
    head: renderHead({
      ...data,
      classes: tw`sticky top-0 z-10 rounded-t-[0.1875rem] border-b bg-neutral-50`,
    }),
    body: renderBody({
      ...data,
      classes: "overflow-auto [&>*:not(:first-child)]:border-t",
    }),
  },
};
