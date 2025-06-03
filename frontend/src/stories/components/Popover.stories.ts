import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { renderComponent, type RenderProps } from "./Popover";

const meta = {
  title: "Components/Popover",
  component: "btrix-popover",
  tags: ["autodocs"],
  decorators: (story) =>
    html` <div class="px-20 py-10 text-center">${story()}</div>`,
  render: renderComponent,
  argTypes: {
    anchor: { table: { disable: true } },
    slottedContent: { table: { disable: true } },
  },
  args: {
    content: "Popover content",
    anchor: html`<btrix-badge>Hover me</btrix-badge>`,
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Basic: Story = {
  args: {},
};

export const Open: Story = {
  args: {
    open: true,
    anchor: html`<btrix-badge>Always open</btrix-badge>`,
  },
};

export const TopPlacement: Story = {
  args: {
    open: true,
    placement: "top",
    anchor: html`<btrix-badge>Popover displays above</btrix-badge>`,
  },
};

export const LeftPlacement: Story = {
  args: {
    open: true,
    placement: "left",
    anchor: html`<btrix-badge>Popover displays left</btrix-badge>`,
  },
};

export const RightPlacement: Story = {
  args: {
    open: true,
    placement: "right",
    anchor: html`<btrix-badge>Popover displays right</btrix-badge>`,
  },
};

export const HTMLContent: Story = {
  args: {
    open: true,
    anchor: html`<btrix-badge>HTML Content</btrix-badge>`,
    slottedContent: html`
      <header class="font-medium leading-none">Popover Title</header>
      <hr class="my-2" />
      <p>
        This popover has HTML content for displaying informative text or
        additional details when the anchor is activated.
      </p>
    `,
  },
};
