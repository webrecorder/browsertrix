import { serialize } from "@shoelace-style/shoelace";
import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import {
  defaultArgs,
  Language,
  renderComponent,
  type RenderProps,
} from "./SyntaxInput";

import type { SyntaxInput } from "@/components/ui/syntax-input";

const meta = {
  title: "Components/Syntax Input",
  component: "btrix-syntax-input",
  tags: ["autodocs"],
  render: renderComponent,
  argTypes: {},
  args: defaultArgs,
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Basic: Story = {
  args: {
    value: "<div>Edit me</div>",
    language: Language.XML,
    placeholder: "Enter HTML",
  },
};

/**
 * Syntax input supports CSS and XML.
 */
export const CSS: Story = {
  args: {
    label: "CSS Selector",
    value: "div > a",
    language: Language.CSS,
    placeholder: "Enter a CSS selector",
  },
};

/**
 * Syntax can be used a form control.
 *
 * To see how the validation message is displayed, interact with
 * the input, click "Set custom validity", and then submit.
 */
export const FormControl: Story = {
  decorators: [
    (story) =>
      html`<form
        @submit=${(e: SubmitEvent) => {
          e.preventDefault();

          console.log("form values:", serialize(e.target as HTMLFormElement));
        }}
      >
        ${story()}
        <div class="mt-2 rounded bg-slate-100 p-2">
          <sl-button
            size="small"
            @click=${() => {
              const input =
                document.querySelector<SyntaxInput>("btrix-syntax-input");

              input?.setCustomValidity("This is a custom validity message");
            }}
          >
            Set custom validity
          </sl-button>
          <sl-button
            size="small"
            @click=${() => {
              const input =
                document.querySelector<SyntaxInput>("btrix-syntax-input");

              input?.setCustomValidity("");
            }}
          >
            Clear custom validity
          </sl-button>
        </div>
        <sl-button type="reset" class="mt-3">Reset</sl-button>
        <sl-button type="submit" variant="primary" class="mt-3"
          >Submit</sl-button
        >
      </form>`,
  ],
  args: {
    name: "selector",
    label: "CSS Selector",
    value: "div > a",
    language: Language.CSS,
    placeholder: "Enter a CSS selector",
    disableTooltip: true,
    required: true,
  },
};
