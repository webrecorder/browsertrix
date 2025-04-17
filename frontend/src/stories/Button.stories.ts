import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { Button as ButtonComponent } from "@/components/ui/button";

import "@/components/ui/button";

const renderButton = ({
  variant,
  filled,
  label,
  raised,
  loading,
  href,
}: ButtonComponent) => {
  return html`
    <btrix-button
      variant=${ifDefined(variant)}
      label=${ifDefined(label)}
      href=${ifDefined(href)}
      ?filled=${filled}
      ?raised=${raised}
      ?loading=${loading}
    >
      ${label}
    </btrix-button>
  `;
};

const meta = {
  component: "btrix-button",
  tags: ["autodocs"],
  render: renderButton,
  argTypes: {
    type: {
      control: { type: "select" },
      options: ["button", "submit"] satisfies ButtonComponent["type"][],
    },
    variant: {
      control: { type: "select" },
      options: ["neutral", "danger"] satisfies ButtonComponent["variant"][],
    },
    size: {
      control: { type: "select" },
      options: [
        "x-small",
        "small",
        "medium",
      ] satisfies ButtonComponent["size"][],
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
} satisfies Meta<ButtonComponent>;

export default meta;
type Story = StoryObj<ButtonComponent>;

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
    label: "Button Link",
  },
};
