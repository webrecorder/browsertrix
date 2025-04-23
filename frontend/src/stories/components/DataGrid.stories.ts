import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { defaultArgs, renderComponent, type RenderProps } from "./DataGrid";

import { GridColumnType } from "@/components/ui/data-grid/types";

const meta = {
  title: "Components/Data Grid",
  component: "btrix-data-grid",
  tags: ["autodocs"],
  render: renderComponent,
  argTypes: {},
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Basic: Story = {
  args: {},
};

export const WithRepeatKey: Story = {
  args: {
    repeatKey: "id",
  },
};

export const Labeled: Story = {
  args: {
    label: "My Data",
  },
};

export const StickyHeader: Story = {
  args: {
    stickyHeader: true,
  },
};

export const EditRows: Story = {
  args: {
    editRows: true,
  },
  render: (args) => html`
    <form @submit=${console.log}>${renderComponent(args)}</form>
  `,
};

export const EditCells: Story = {
  args: {
    editCells: true,
    items: defaultArgs.items.map((item) => ({
      ...item,
      a: `${(item as Record<string, string>).a} (not editable)`,
    })),
  },
  render: (args) => html`
    <form @submit=${console.log}>${renderComponent(args)}</form>
  `,
};

export const EditAll: Story = {
  args: {
    editCells: true,
    editRows: true,
    columns: [
      {
        field: "id",
        label: "ID",
      },
      {
        field: "title",
        label: "Title",
        editable: true,
        inputPlaceholder: "Enter title",
      },
      {
        field: "count",
        label: "Count",
        editable: true,
        inputType: GridColumnType.Number,
        inputPlaceholder: "Enter count",
      },
      {
        field: "url",
        label: "URL",
        editable: true,
        inputType: GridColumnType.URL,
        inputPlaceholder: "Enter URL",
      },
      {
        field: "status",
        label: "Status",
        editable: true,
        inputType: GridColumnType.Select,
        renderSelectOptions() {
          return html`
            <sl-option value="Pending">Pending</sl-option>
            <sl-option value="Approved">Approved</sl-option>
          `;
        },
      },
    ],
    items: [
      {
        id: "title-1",
        title: "Title 1",
        count: 2,
        url: "https://example.com/title-1",
        status: "Approved",
      },
      {
        id: "title-2",
        title: "Title 2",
        count: 1,
        url: "https://example.com/title-2",
        status: "Pending",
      },
    ],
  },
  render: (args) => html`
    <form @submit=${console.log}>${renderComponent(args)}</form>
  `,
};
