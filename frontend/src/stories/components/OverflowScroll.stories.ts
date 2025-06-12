import type { Meta, StoryObj } from "@storybook/web-components";

import { renderOverflowScroll, type RenderProps } from "./OverflowScroll";

const meta = {
  title: "Components/Overflow Scroll",
  component: "btrix-overflow-scroll",
  tags: ["autodocs"],
  render: renderOverflowScroll,
  argTypes: {
    direction: {
      control: { type: "select" },
      options: ["horizontal"] satisfies RenderProps["direction"][],
    },
    scrim: {
      control: { type: "boolean" },
    },
  },
} satisfies Meta<RenderProps>;

export default meta;

type Story = StoryObj<RenderProps>;

export const Default: Story = {
  args: {
    direction: "horizontal",
    scrim: true,
  },
};
