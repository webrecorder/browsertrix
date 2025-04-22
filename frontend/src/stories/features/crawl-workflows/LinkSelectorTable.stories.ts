import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { argTypes } from "../excludeBtrixElementProperties";

import type { LinkSelectorTable } from "@/features/crawl-workflows/link-selector-table";

import "@/features/crawl-workflows/link-selector-table";

const meta = {
  title: "Features/Link Selector Table",
  component: "btrix-link-selector-table",
  tags: ["autodocs"],
  render: (args) => html`
    <btrix-link-selector-table
      .selectors=${args.selectors || []}
      ?editable=${args.editable}
    ></btrix-link-selector-table>
  `,
  argTypes: {
    ...argTypes,
  },
  args: {},
} satisfies Meta<LinkSelectorTable>;

export default meta;
type Story = StoryObj<LinkSelectorTable>;

export const WithSelectors: Story = {
  args: {
    selectors: [
      "a->href",
      "button->href",
      "div.link->data-href",
      "footer > button->data-link",
    ],
  },
};

export const Empty: Story = {
  args: {},
};

export const Editable: Story = {
  args: {
    editable: true,
    selectors: [
      "a->href",
      "button->href",
      "div.link->data-href",
      "footer > button->data-link",
    ],
  },
};
