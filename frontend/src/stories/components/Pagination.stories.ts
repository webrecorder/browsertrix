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
 * By default, the current page persists between page reloads via a search param in the URL.
 * You can disable pagination persistence by setting `disablePersist` to `true`.
 */
export const DisablePersistence: Story = {
  args: {
    disablePersist: true,
  },
};
