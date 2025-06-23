import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { fileInputFormDecorator } from "./decorators/fileInputForm";
import { renderComponent, type RenderProps } from "./FileInput";

const meta = {
  title: "Components/File Input",
  component: "btrix-file-input",
  tags: ["autodocs"],
  render: renderComponent,
  decorators: (story) => html` <div class="m-5">${story()}</div>`,
  argTypes: {
    content: { table: { disable: true } },
  },
  args: {
    content: html`
      <sl-button size="small" variant="primary">Select File</sl-button>
    `,
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Basic: Story = {
  args: {},
};

export const Multiple: Story = {
  args: {
    multiple: true,
    content: html`
      <sl-button size="small" variant="primary">Select Files</sl-button>
    `,
  },
};

export const DropZone: Story = {
  args: {
    drop: true,
    content: html`
      <span>
        Drag file here or
        <button
          class="text-primary-500 underline underline-offset-2 transition-colors hover:no-underline"
        >
          choose from a folder
        </button>
      </span>
    `,
  },
};

/**
 * Open your browser console log to see what value gets submitted.
 */
export const FormControl: Story = {
  decorators: [fileInputFormDecorator],
  args: {
    ...DropZone.args,
    multiple: true,
  },
};

/**
 * When dragging and dropping, files that are not acceptable are filtered out.
 */
export const FileFormat: Story = {
  decorators: [fileInputFormDecorator],
  args: {
    label: "Attach a Document",
    drop: true,
    multiple: true,
    accept: ".txt,.doc,.pdf",
    content: html`
      <div>
        Drag document here or
        <button
          class="text-primary-500 transition-colors hover:text-primary-600"
        >
          choose a file
        </button>
        to upload
      </div>
      <div class="text-neutral-500">TXT, DOC, or PDF</div>
    `,
  },
};
