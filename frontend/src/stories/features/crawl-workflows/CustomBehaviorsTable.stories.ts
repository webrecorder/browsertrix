import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { argTypes } from "../excludeBtrixElementProperties";

import type { CustomBehaviorsTable } from "@/features/crawl-workflows/custom-behaviors-table";

import "@/features/crawl-workflows/custom-behaviors-table";

const meta = {
  title: "Features/Custom Behaviors Table",
  component: "btrix-custom-behaviors-table",
  subcomponents: {
    CustomBehaviorsTableRow: "btrix-custom-behaviors-table-row",
  },
  tags: ["autodocs"],
  render: (args) => html`
    <btrix-custom-behaviors-table
      .customBehaviors=${args.customBehaviors || []}
      ?editable=${args.editable}
    ></btrix-custom-behaviors-table>
  `,
  argTypes: {
    ...argTypes,
  },
  args: {
    customBehaviors: [
      "https://github.com/webrecorder/custom-behaviors/blob/main/behaviors/fulcrum.js",
      "https://github.com/webrecorder/custom-behaviors/blob/main/flow-behaviors/scalar/scalar-index.json",
      "git+https://github.com/webrecorder/custom-behaviors?branch=timeline-events&path=behaviors",
    ],
  },
} satisfies Meta<CustomBehaviorsTable>;

export default meta;
type Story = StoryObj<CustomBehaviorsTable>;

export const WithCustomBehaviors: Story = {
  args: {},
};

export const Empty: Story = {
  args: {
    customBehaviors: [],
  },
};

export const Editable: Story = {
  args: {
    editable: true,
  },
};
