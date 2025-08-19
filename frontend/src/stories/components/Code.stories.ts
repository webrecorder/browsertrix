import type { Meta, StoryObj } from "@storybook/web-components";

import { renderCode, type RenderProps } from "./Code";

const meta = {
  title: "Components/Code",
  component: "btrix-code",
  tags: ["autodocs"],
  render: renderCode,
  argTypes: {
    language: {
      control: { type: "select" },
      options: [
        "xml",
        "javascript",
        "css",
        "url",
      ] satisfies `${RenderProps["language"]}`[],
    },
    value: {
      control: { type: "text" },
    },
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const XML: Story = {
  args: {
    language: "xml",
    value: "<div>Hello World</div>",
  },
};

export const JavaScript: Story = {
  name: "JavaScript",
  args: {
    language: "javascript",
    value: "console.log('Hello World');",
  },
};

export const CSS: Story = {
  args: {
    language: "css",
    value: "body, [data-testid='code'] { background-color: #f0f0f0; }",
  },
};

export const URL: Story = {
  args: {
    language: "url",
    value:
      "https://username:password@webrecorder.net:8443/browsertrix/?first=hello&second=world#get-started",
  },
};
