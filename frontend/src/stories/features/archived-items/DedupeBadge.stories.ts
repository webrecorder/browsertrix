import type { Meta, StoryObj } from "@storybook/web-components";

import { renderComponent, type RenderProps } from "./DedupeBadge";

const meta = {
  title: "Features/Archived Items/Dedupe Badge",
  component: "btrix-dedupe-badge",
  tags: ["autodocs"],
  decorators: [],
  render: renderComponent,
  argTypes: {},
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Dependents: Story = {
  args: {
    dependents: ["crawl1", "crawl2"],
  },
};

export const Dependencies: Story = {
  args: {
    dependencies: ["crawl1"],
  },
};

export const Both: Story = {
  args: {
    dependents: ["crawl1", "crawl2"],
    dependencies: ["crawl1"],
  },
};
