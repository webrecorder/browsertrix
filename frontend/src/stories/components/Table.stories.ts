import type { Meta, StoryObj } from "@storybook/web-components";
import clsx from "clsx";
import { html } from "lit";

import {
  defaultArgs,
  renderBody,
  renderHead,
  renderTable,
  type RenderProps,
  type TableData,
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
 * Tables can be styled to have borders using a combination of Tailwind classes. For example, to add borders between rows (aka horizontal rules):
 */
export const StylingBorders: Story = {
  name: "Styling - Borders",
  args: {
    classes: clsx(
      defaultArgs.classes,
      tw`[--btrix-table-cell-padding-x:var(--sl-spacing-small)]`,
    ),
    head: renderHead({
      ...data,
      classes: tw`[--btrix-table-cell-padding-bottom:var(--sl-spacing-2x-small)]`,
    }),
    body: renderBody({
      ...data,
      classes: tw`rounded border [--btrix-table-cell-padding-y:var(--sl-spacing-x-small)] [&>*:not(:first-child)]:border-t`,
    }),
  },
};

/**
 * Use `--btrix-row-gap` to add space between rows.
 */
export const StylingRowGap: Story = {
  name: "Styling - Row gap",
  args: {
    classes: clsx(
      defaultArgs.classes,
      tw`[--btrix-row-gap:var(--sl-spacing-x-small)] [--btrix-table-cell-padding:var(--sl-spacing-x-small)]`,
    ),
    head: renderHead({
      ...data,
      classes: tw`[--btrix-table-cell-padding-bottom:var(--sl-spacing-2x-small)]`,
    }),
    body: renderBody({
      ...data,
      classes: tw`*:rounded *:border`,
    }),
  },
};

const paddedTableData = {
  columns: {
    a: { title: "A" },
    b: { title: "B" },
    c: {
      title: "C",
      renderItem: () => html`
        <btrix-table-cell
          class="[--btrix-table-cell-padding-left:0] [--btrix-table-cell-padding:0]"
        >
          Cell without padding
        </btrix-table-cell>
      `,
    },
  },
  rows: [
    {
      classes: tw`[--btrix-table-cell-padding:var(--sl-spacing-small)]`,
      data: {
        a: "Cell with small padding",
        b: "Cell with small padding",
      },
    },
    {
      classes: tw`[--btrix-table-cell-padding:var(--sl-spacing-large)]`,
      data: {
        a: "Cell with large padding",
        b: "Cell with large padding",
      },
    },
    {
      classes: tw`[--btrix-table-cell-padding-left:var(--sl-spacing-x-large)]`,
      data: {
        a: "Cell with only left padding",
        b: "Cell with only left padding",
      },
    },
  ],
} satisfies TableData;

/**
 * Cell padding can be set for the entire table or customized per-cell.
 */
export const StylingPadding: Story = {
  name: "Styling - Padding",
  args: {
    classes: tw`relative h-full w-full rounded border`,
    head: renderHead({
      ...paddedTableData,
      classes: tw`[&>*:not(:first-child)]:border-l`,
    }),
    body: renderBody({
      ...paddedTableData,
      classes: tw`overflow-auto *:border-t [&>*>*:not(:first-child)]:border-l`,
    }),
  },
};
