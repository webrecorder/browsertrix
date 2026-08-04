import type { Meta, StoryObj } from "@storybook/web-components";

import { renderComponent, type RenderProps } from "./Polling";

const meta = {
  title: "Utils/Polling",
  render: renderComponent,
  argTypes: {},
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Demo: Story = {
  args: {},
};
