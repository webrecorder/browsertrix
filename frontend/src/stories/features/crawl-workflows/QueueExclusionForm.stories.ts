import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { argTypes } from "../excludeBtrixElementProperties";

import type { QueueExclusionForm } from "@/features/crawl-workflows/queue-exclusion-form";

import "@/features/crawl-workflows/queue-exclusion-form";

const meta = {
  title: "Features/Queue Exclusion Form",
  component: "btrix-queue-exclusion-form",
  tags: ["autodocs"],
  render: (args) => html`
    <btrix-queue-exclusion-form
      fieldErrorMessage=${args.fieldErrorMessage || ""}
      ?isSubmitting=${args.isSubmitting}
    ></btrix-queue-exclusion-form>
  `,
  argTypes: {
    ...argTypes,
  },
  args: {},
} satisfies Meta<QueueExclusionForm>;

export default meta;
type Story = StoryObj<QueueExclusionForm>;

export const Default: Story = {
  args: {},
};

export const Submitting: Story = {
  args: {
    isSubmitting: true,
  },
};

export const CustomErrorMessage: Story = {
  args: {
    fieldErrorMessage: "Please enter a valid exclusion value",
  },
};
