import type { Meta, StoryContext, StoryObj } from "@storybook/web-components";

import { renderComponent, type RenderProps } from "./RichText";

const meta = {
  title: "Utils/Rich Text",
  render: renderComponent,
  argTypes: {
    linkClass: {
      control: "text",
      description: "CSS class to apply to links",
      table: {
        type: { summary: "string" },
        defaultValue: {
          summary:
            "text-cyan-500 font-medium transition-colors hover:text-cyan-600",
        },
      },
    },
  },
  args: {
    content:
      "Rich text example content with a link to https://example.com and an link without a protocol to webrecorder.net here. Long URLs like this one are cut short: https://webrecorder.net/blog/2025-05-28-create-use-and-automate-actions-with-custom-behaviors-in-browsertrix/#the-story-of-behaviors-in-browsertrix",
  },
  parameters: {
    docs: {
      source: {
        language: "typescript",
        transform: (code: string, storyContext: StoryContext<RenderProps>) =>
          `import { richText } from "@/utils/rich-text";

const content = ${JSON.stringify(storyContext.args.content)};

// Inside a Lit element, or wherever \`TemplateResult\`s are accepted:
richText(content${
            storyContext.args.linkClass
              ? `, ${JSON.stringify(storyContext.args.linkClass)}`
              : ``
          });

          `,
      },
    },
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Basic: Story = {
  args: {},
};

export const CustomLinkStyles: Story = {
  args: {
    linkClass:
      "text-purple-600 hover:text-purple-800 bg-purple-50 px-0.5 py-px rounded-md ring-1 ring-purple-300",
  },
};
