import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { defaultArgs, renderDataTable, type RenderProps } from "./DataTable";

// import { tw } from "@/utils/tailwind";

const meta = {
  title: "Components/Data Table",
  component: "btrix-data-table",
  render: renderDataTable,
  tags: ["autodocs"],
  argTypes: {},
  args: defaultArgs,
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

/**
 * By default, data tables are rendered with borders between cells.
 */
export const BasicTable: Story = {
  args: {},
};

/**
 * Column widths automatically adjust to their content, unless overridden with `columnWidths`.
 */
export const ColumnWidths: Story = {
  args: {
    columnWidths: ["1fr", "5rem", "10rem"],
  },
};

/**
 * By default, cells are padded and gaps are added to elements between cells.
 */
export const CellGap: Story = {
  args: {
    columns: [
      html`Month
        <sl-tooltip content="This is a description of month">
          <sl-icon name="info-circle"></sl-icon>
        </sl-tooltip>`,
      html`Elapsed Time
        <sl-tooltip content="This is a description of elapsed time">
          <sl-icon name="info-circle"></sl-icon>
        </sl-tooltip>`,
      html`Execution Time
        <sl-tooltip content="This is a description of execution time">
          <sl-icon name="info-circle"></sl-icon>
        </sl-tooltip>`,
    ],
    rows: [
      ["February 2025", "7 minutes", "5 minutes"],
      ["January 2025", "10 minutes", "3 minutes"],
      [
        "December 2024",
        "2 minutes",
        html`--
          <sl-tooltip content="This is a description of this cell">
            <sl-icon name="question-circle"></sl-icon>
          </sl-tooltip>`,
      ],
    ],
  },
};
