import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { Button as BtrixButton } from "@/components/ui/button";

import "@/components/ui/button";

const ButtonComponent = ({
  variant,
  filled,
  label,
  raised,
  loading,
  href,
}: BtrixButton) => {
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
  render: (args) => ButtonComponent(args),
  argTypes: {
    type: {
      control: { type: "select" },
      options: ["button", "submit"] satisfies BtrixButton["type"][],
    },
    variant: {
      control: { type: "select" },
      options: ["neutral", "danger"] satisfies BtrixButton["variant"][],
    },
    size: {
      control: { type: "select" },
      options: ["x-small", "small", "medium"] satisfies BtrixButton["size"][],
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
} satisfies Meta<BtrixButton>;

export default meta;
type Story = StoryObj<BtrixButton>;

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
