import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { renderComponent, type RenderProps } from "./FileList";

const meta = {
  title: "Components/File List",
  component: "btrix-file-list",
  tags: ["autodocs"],
  render: renderComponent,
  decorators: (story) => html` <div class="m-5">${story()}</div>`,
  argTypes: {},
  args: {
    files: [
      new File([new Blob()], "file.txt"),
      new File([new Blob()], "file-2.txt"),
    ],
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Basic: Story = {
  args: {},
};
