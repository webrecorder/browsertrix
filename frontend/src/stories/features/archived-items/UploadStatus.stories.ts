import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { argTypes } from "../excludeContainerProperties";

import "@/features/archived-items/upload-status";

import type { UploadStatus } from "@/features/archived-items/upload-status";

const meta = {
  title: "Features/Upload Status",
  component: "btrix-upload-status",
  tags: ["autodocs"],
  render: (args) => html`
    <btrix-upload-status
      .state=${args.state}
      ?hideLabel=${args.hideLabel}
    ></btrix-upload-status>
  `,
  argTypes: {
    ...argTypes,
  },
  args: {},
} satisfies Meta<UploadStatus>;

export default meta;
type Story = StoryObj<UploadStatus>;

export const Empty: Story = {};

export const Complete: Story = {
  args: {
    state: "complete",
  },
};
