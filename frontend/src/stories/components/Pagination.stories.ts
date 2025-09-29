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
 * You can disable pagination persistence by setting `disablePersist`.
 */
export const DisablePersistence: Story = {
  args: {
    disablePersist: true,
  },
};

/**
 * Pagination can be displayed with a reduced amount of controls to fit a smaller visual space.
 * Only the controls for the previous, current, and next page will be visible. Users can jump
 * to a page by entering the page number in the input field for the current page.
 *
 * This should be used sparingly, such as for paginating secondary content in a view.
 */
export const Compact: Story = {
  args: {
    compact: true,
  },
};
