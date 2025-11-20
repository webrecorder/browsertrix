import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { renderComponent, type RenderProps } from "./ContainedTags";

const meta = {
  title: "Components/Contained Tags",
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
    content: html`<btrix-tag>Social Media</btrix-tag>
      <btrix-tag>Marketing</btrix-tag> <btrix-tag>Tooling</btrix-tag>
      <btrix-tag>High Priority</btrix-tag> <btrix-tag>Low Priority</btrix-tag>
      <btrix-tag>Dev</btrix-tag>
      <btrix-tag>Approved</btrix-tag>
      <btrix-tag>Rejected</btrix-tag>
      <btrix-tag>Good</btrix-tag>
      <btrix-tag>Bad</btrix-tag>
      <btrix-tag>2024</btrix-tag> <btrix-tag>2025</btrix-tag>
      <btrix-tag>2026</btrix-tag>`,
  },
};
