import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import type { DecoratorFunction } from "storybook/internal/types";

import { argTypes } from "../excludeBtrixElementProperties";

import type { UsageHistoryTable } from "@/features/org/usage-history-table";
import {
  orgDecorator,
  type StorybookOrgProps,
} from "@/stories/decorators/orgDecorator";

import "@/features/org/usage-history-table";

type RenderProps = UsageHistoryTable & StorybookOrgProps;

const meta = {
  title: "Features/Usage History Table",
  component: "btrix-usage-history-table",
  tags: ["autodocs"],
  decorators: [orgDecorator as DecoratorFunction],
  render: () => html` <btrix-usage-history-table></btrix-usage-history-table> `,
  argTypes: {
    ...argTypes,
  },
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const WithUsage: Story = {
  args: {
    orgUsage: true,
  },
};

export const WithoutUsage: Story = {
  args: {},
};
