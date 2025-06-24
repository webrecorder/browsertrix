import type { Meta, StoryContext, StoryObj } from "@storybook/web-components";

import { renderComponent, type RenderProps } from "./RichText";

import { tw } from "@/utils/tailwind";

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
    maxLength: {
      control: {
        type: "select",
      },
      options: ["null", 5, 10, 15, 20],
      description: "Maximum length of path portion of URLs",
      table: {
        type: { summary: "number | null" },
        defaultValue: {
          summary: "15",
        },
      },
    },
    shortenOnly: {
      control: {
        type: "boolean",
      },
      description: "Whether to shorten URLs only",
      table: {
        type: { summary: "boolean" },
        defaultValue: {
          summary: "false",
        },
      },
    },
  },
  args: {
    content:
      "Rich text example content with a link to https://example.com and a link without a protocol to webrecorder.net here. Long URLs like this one are cut short unless maxLength is overridden: https://webrecorder.net/blog/2025-05-28-create-use-and-automate-actions-with-custom-behaviors-in-browsertrix/#the-story-of-behaviors-in-browsertrix.",
  },
  parameters: {
    docs: {
      source: {
        language: "typescript",
        transform: (
          code: string,
          {
            args: { content, linkClass, maxLength, shortenOnly },
          }: StoryContext<RenderProps>,
        ) =>
          `import { richText } from "@/utils/rich-text";

const content = ${JSON.stringify(content)};

// Inside a Lit element, or wherever \`TemplateResult\`s are accepted:
richText(content${
            linkClass || maxLength || shortenOnly
              ? `, { ${[
                  linkClass && `linkClass: ${JSON.stringify(linkClass)}`,
                  // Hack: Storybook seems to convert null to undefined, so instead I'm using the string "null" and displaying it as null here
                  // -ESG
                  (typeof maxLength === "number" ||
                    (maxLength as unknown as string) === "null") &&
                    `maxLength: ${
                      (maxLength as unknown as string) === "null"
                        ? "null"
                        : JSON.stringify(maxLength)
                    }`,
                  shortenOnly && `shortenOnly: ${JSON.stringify(shortenOnly)}`,
                ]
                  .filter(Boolean)
                  .join(", ")} }`
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

export const ShortenOnly: Story = {
  args: {
    shortenOnly: true,
  },
};

export const MaxLength: Story = {
  args: {
    maxLength: null,
  },
};

export const CustomLinkStyles: Story = {
  args: {
    linkClass: tw`rounded-md bg-purple-50 px-0.5 py-px italic text-purple-600 ring-1 ring-purple-300 hover:text-purple-800`,
  },
};
