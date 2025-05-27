import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { argTypes } from "../excludeContainerProperties";

import type { QueueExclusionTable } from "@/features/crawl-workflows/queue-exclusion-table";
import { tw } from "@/utils/tailwind";

import "@/features/crawl-workflows/queue-exclusion-table";

const meta = {
  title: "Features/Queue Exclusion Table",
  component: "btrix-queue-exclusion-table",
  tags: ["autodocs"],
  render: (args) => html`
    <btrix-queue-exclusion-table
      .exclusions=${args.exclusions}
      .label=${args.label || ""}
      .labelClassName=${args.labelClassName || ""}
      ?editable=${args.editable}
      ?removable=${args.removable}
      ?uncontrolled=${args.uncontrolled}
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

export const CustomLabel: Story = {
  args: {
    label: "Customized Label",
    labelClassName: tw`text-lg font-bold`,
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

/**
 * By default, `<btrix-queue-exclusion-table>` requires state to managed externally.
 * Pass `uncontrolled` to let the component manage its own state internally. (See TODO in component file.)
 */
export const Uncontrolled: Story = {
  args: {
    editable: true,
    removable: true,
    uncontrolled: true,
  },
};
