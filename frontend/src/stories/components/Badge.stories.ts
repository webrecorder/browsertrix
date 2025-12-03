import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import capitalize from "lodash/fp/capitalize";

import { renderComponent, type RenderProps } from "./Badge";

import "@/features/crawls/crawler-channel-badge";
import "@/features/crawls/proxy-badge";
import "@/features/collections/dedupe-badge";
import "@/features/collections/dedupe-source-badge";

const meta = {
  title: "Components/Badge",
  component: "btrix-badge",
  tags: ["autodocs"],
  decorators: [],
  render: renderComponent,
  argTypes: {},
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Basic: Story = {
  args: {
    content: "2 URLs",
  },
};

const variants = [
  "success",
  "warning",
  "danger",
  "neutral",
  "primary",
  "lime",
  "cyan",
  "sky",
  "blue",
  "violet",
  "orange",
  "high-contrast",
  "text",
  "text-neutral",
] satisfies RenderProps["variant"][];

/**
 * Badges can be displayed in different variants.
 */
export const Variant: Story = {
  decorators: (story) =>
    html`<div class="flex flex-wrap items-center gap-3">${story()}</div>`,
  render: () =>
    html`${variants.map((variant) =>
      renderComponent({
        variant,
        content: capitalize(variant),
      }),
    )}`,
};

/**
 * Badges can be completely rounded so that they fit rounded
 * containers better.
 */
export const Pill: Story = {
  decorators: (story) =>
    html`<div class="flex flex-wrap items-center gap-3">${story()}</div>`,
  render: () =>
    html`${variants.map((variant) =>
      renderComponent({
        variant,
        pill: true,
        content: capitalize(variant),
      }),
    )}`,
};

/**
 * Badges can be outlined.
 */
export const Outline: Story = {
  decorators: (story) =>
    html`<div class="flex flex-wrap items-center gap-3">${story()}</div>`,
  render: () =>
    html`${variants.map((variant) =>
      renderComponent({
        variant,
        outline: true,
        content: capitalize(variant),
      }),
    )}`,
};

/**
 * Badges can be displayed with more or less padding.
 */
export const Size: Story = {
  decorators: (story) =>
    html`<div class="flex flex-wrap items-center gap-3">${story()}</div>`,
  render: () => {
    const sizes = ["medium", "large"] satisfies RenderProps["size"][];

    return html`${sizes.map((size) =>
      renderComponent({
        size,
        content: capitalize(size),
        pill: true,
      }),
    )}`;
  },
};

/**
 * By default, badges are displayed using the "monostyle" font to indicate
 * that they show contextual, secondary data.
 * When used as a label, the badge can be displayed using the default font.
 */
export const AsLabel: Story = {
  args: {
    content: "Tip",
    asLabel: true,
  },
};

/**
 * These are examples of badges used in features.
 */
export const FeatureBadges: Story = {
  render: () => html`
    <btrix-proxy-badge proxyId="nz-proxy"></btrix-proxy-badge>
    <btrix-crawler-channel-badge
      channelId="default"
    ></btrix-crawler-channel-badge>
    <btrix-dedupe-source-badge></btrix-dedupe-source-badge>
    <btrix-dedupe-badge
      .dependencies=${["crawl1"]}
      .dependents=${["crawl1"]}
    ></btrix-dedupe-badge>
  `,
};
