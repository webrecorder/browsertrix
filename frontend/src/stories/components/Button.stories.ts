import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { renderButton, type RenderProps } from "./Button";

const meta = {
  title: "Components/Button",
  component: "btrix-button",
  tags: ["autodocs"],
  render: renderButton,
  argTypes: {
    type: {
      control: { type: "select" },
      options: ["button", "submit"] satisfies RenderProps["type"][],
    },
    variant: {
      control: { type: "select" },
      options: ["neutral", "danger"] satisfies RenderProps["variant"][],
    },
    size: {
      control: { type: "select" },
      options: ["x-small", "small", "medium"] satisfies RenderProps["size"][],
    },
  },
  args: {
    label: "Button",
    filled: true,
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

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
    ${renderButton({
      variant: "neutral",
      label: "Neutral (Default)",
      filled: true,
    })}
    ${renderButton({ variant: "danger", label: "Danger", filled: true })}
  `,
};

export const Sizes: Story = {
  render: () => html`
    ${renderButton({
      size: "x-small",
      label: "X-Small",
      filled: true,
    })}
    ${renderButton({
      size: "small",
      label: "Small",
      filled: true,
    })}
    ${renderButton({
      size: "medium",
      label: "Medium (Default",
      filled: true,
    })}
  `,
};

export const Link: Story = {
  args: {
    href: "https://webrecorder.net",
    label: "Button Link",
  },
};
