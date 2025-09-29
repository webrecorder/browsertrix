import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { renderComponent, type RenderProps } from "./Pagination";

const meta = {
  title: "Components/Pagination",
  component: "btrix-pagination",
  tags: ["autodocs"],
  decorators: (story) =>
    html` <div class="px-20 py-10 text-center">${story()}</div>`,
  render: renderComponent,
  argTypes: {
    searchParams: { table: { disable: true } },
  },
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Basic: Story = {
  args: {},
};
