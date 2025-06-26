import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { renderComponent, type RenderProps } from "./FileList";

const fileBlobs = [
  new Blob(["example file content"]),
  new Blob(["example file 2 content"]),
];

const meta = {
  title: "Components/File List",
  component: "btrix-file-list",
  subcomponents: { FileListItem: "btrix-file-list-item" },
  tags: ["autodocs"],
  render: renderComponent,
  decorators: (story) => html` <div class="m-5">${story()}</div>`,
  argTypes: {},
  args: {
    items: fileBlobs.map((blob, i) => ({
      file: new File([blob], `file-${i + 1}.txt`),
    })),
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

/**
 * By default, the file list accepts an array of `File` objects, which are listed as removable items.
 */
export const Basic: Story = {
  args: {},
};

/**
 * File-like objects can also be displayed as items.
 */
export const OverrideFile: Story = {
  args: {
    items: [
      { name: "uploaded-file.txt", size: 5 * 1e6 },
      { name: "uploaded-file-2.txt", size: 1500 * 1e6 },
    ],
  },
};

/**
 * Files can viewed in a new tab by specifying the URL as `href`.
 * Use `URL.createObjectURL` to view files without an associated remote URL.
 */
export const LinkToFile: Story = {
  args: {
    items: fileBlobs.map((blob, i) => ({
      file: new File([blob], `file-${i + 1}.txt`),
      href: URL.createObjectURL(blob),
    })),
  },
};
