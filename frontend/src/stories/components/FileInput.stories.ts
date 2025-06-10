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
    anchor: { table: { disable: true } },
  },
  args: {
    anchor: html`
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
    anchor: html`
      <sl-button size="small" variant="primary">Select Files</sl-button>
    `,
  },
};

export const DropZone: Story = {
  args: {
    dropzone: true,
    anchor: html`
      <span>
        Drag file here or
        <button
          class="text-primary-500 transition-colors hover:text-primary-600"
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
export const FormControlValidation: Story = {
  decorators: [fileInputFormDecorator],
  args: {
    dropzone: true,
    multiple: true,
    accept: ".txt,.doc,.pdf",
    anchor: html`
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
