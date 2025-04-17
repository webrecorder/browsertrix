import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { Button, type ButtonProps } from "./Button";

const meta = {
  tags: ["autodocs"],
  render: (args) => Button(args),
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["neutral", "danger"] satisfies ButtonProps["variant"][],
    },
  },
  args: {
    label: "Button",
    filled: true,
  },
  parameters: {
    options: {
      showPanel: false,
    },
  },
} satisfies Meta<ButtonProps>;

export default meta;
type Story = StoryObj<ButtonProps>;

export const Raised: Story = {
  args: {
    raised: true,
  },
};

export const Loading: Story = {
  args: {
    loading: true,
  },
};

export const Variants: Story = {
  render: () => html`
    <btrix-button filled variant="neutral">Neutral (Default)</btrix-button>
    <btrix-button filled variant="danger">Danger</btrix-button>
  `,
};

export const Sizes: Story = {
  render: () => html`
    <btrix-button filled size="x-small">X-Small</btrix-button>
    <btrix-button filled size="small">Small</btrix-button>
    <btrix-button filled size="medium">Medium (Default)</btrix-button>
  `,
};

export const Link: Story = {
  args: {
    href: "https://webrecorder.net",
  },
};
