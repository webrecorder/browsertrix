import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { renderComponent, type RenderProps } from "./Pagination";

const meta = {
  title: "Components/Pagination",
  component: "btrix-pagination",
  tags: ["autodocs"],
  decorators: (story) =>
    html` <div class="flex justify-center px-20 py-10">${story()}</div>`,
  render: renderComponent,
  argTypes: {
    searchParams: { table: { disable: true } },
  },
  args: {
    totalCount: 10,
    page: 1,
    size: 1,
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Basic: Story = {
  args: {},
};

/**
 * You can also disable pagination persistence via search params by setting name to `null`.
 */
export const DisablePersistence: Story = {
  args: {
    name: null,
  },
};
