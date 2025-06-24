import type { Meta, StoryObj } from "@storybook/web-components";

import { renderComponent, type RenderProps } from "./RichText";

const meta = {
  title: "Components/Rich Text",
  component: "btrix-rich-text",
  tags: ["autodocs"],
  render: renderComponent,
  argTypes: {},
  args: {
    content:
      "Rich text example content with a link to https://example.com and an link without a protocol to webrecorder.net here. Long URLs like this one are cut short: https://webrecorder.net/blog/2025-05-28-create-use-and-automate-actions-with-custom-behaviors-in-browsertrix/#the-story-of-behaviors-in-browsertrix",
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Basic: Story = {
  args: {},
};

export const CustomLinkStyles: Story = {
  args: {
    linkClass:
      "text-purple-600 hover:text-purple-800 bg-purple-50 px-0.5 py-px rounded-md ring-1 ring-purple-300",
  },
};
