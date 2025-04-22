import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { argTypes } from "../excludeBtrixElementProperties";

import type { QueueExclusionTable } from "@/features/crawl-workflows/queue-exclusion-table";

import "@/features/crawl-workflows/queue-exclusion-table";

const meta = {
  title: "Features/Queue Exclusion Table",
  component: "btrix-e-table",
  tags: ["autodocs"],
  render: (args) => html`
    <btrix-queue-exclusion-table
      .exclusions=${args.exclusions || []}
      ?editable=${args.editable}
      ?removable=${args.removable}
    ></btrix-queue-exclusion-table>
  `,
  argTypes: {
    ...argTypes,
  },
  args: {
    exclusions: [
      "exclude-this-string",
      "^exclude_this_regex$",
      "(exclude_one|exclude_two)",
    ],
  },
} satisfies Meta<QueueExclusionTable>;

export default meta;
type Story = StoryObj<QueueExclusionTable>;

export const WithExclusions: Story = {
  args: {},
};

export const Empty: Story = {
  args: {
    exclusions: [],
  },
};

export const Editable: Story = {
  args: {
    editable: true,
  },
};

export const Removable: Story = {
  args: {
    removable: true,
  },
};
