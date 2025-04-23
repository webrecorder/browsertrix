import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { defaultArgs, renderComponent, type RenderProps } from "./DataGrid";

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

export const Editable: Story = {
  args: {
    editable: true,
    columns: defaultArgs.columns.map((col) => ({
      ...col,
      renderItem: (item) => html`Item: ${item[col.field]}`,
    })),
  },
  render: (args) => html`
    <form @submit=${console.log}>${renderComponent(args)}</form>
  `,
};
