import type { Meta, StoryObj } from "@storybook/web-components";

import { renderComponent, type RenderProps } from "./TagContainer";

const meta = {
  title: "Components/Tag Container",
  component: "btrix-contain-with-remainder",
  tags: ["autodocs"],
  render: renderComponent,
  argTypes: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

/**
 * Resize your browser window to see the remaining tags update.
 */
export const Basic: Story = {
  args: {
    tags: [
      "Social Media",
      "Marketing",
      "Tooling",
      "High Priority",
      "Low Priority",
      "Dev",
      "Approved",
      "Rejected",
      "Good",
      "Bad",
      "2024",
      "2025",
      "2026",
    ],
  },
};
