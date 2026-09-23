// eslint-disable import-x/no-unresolved -- Dev dependency
import { faker } from "@faker-js/faker";
import type {
  Meta,
  StoryContext,
  StoryFn,
  StoryObj,
} from "@storybook/web-components";
import { html } from "lit";
import { type DecoratorFunction } from "storybook/internal/types";

import { renderComponent, type RenderProps } from "./Combobox";
import { formDecorator } from "./decorators/form";

// Fixed seed for reproducibility
faker.seed(0);

function wrapperDecorator(story: StoryFn, context: StoryContext) {
  const { args } = context;

  return html`<div class="max-w-sm">${story(args, context)}</div>`;
}

const meta = {
  title: "Components/Combobox",
  component: "btrix-combobox",
  tags: ["autodocs"],
  decorators: [wrapperDecorator as DecoratorFunction],
  render: renderComponent,
  argTypes: {},
  args: {
    label: "Label",
    placeholder: "Placeholder",
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

const data = Array.from({ length: 50 }).map(() => ({
  id: faker.string.nanoid(),
  label: faker.word.words({ count: { min: 1, max: 5 } }),
  detail: faker.word.words({ count: 1 }),
}));
const menuItems = data
  .slice(0, 10)
  .map(({ id, label }) => html`<sl-option value=${id}>${label}</sl-option>`);

export const WithItems: Story = {
  args: {
    content: html`${menuItems}`,
  },
};

export const OptionsWithSuffix: Story = {
  args: {
    content: html`${data.slice(0, 10).map(
      ({ id, label, detail }) =>
        html`<sl-option value=${id}
          >${label}
          <btrix-badge slot="suffix">${detail}</btrix-badge>
        </sl-option>`,
    )}`,
  },
};

export const OptionsWithPopover: Story = {
  args: {
    content: html`${data.slice(0, 10).map(
      ({ id, label, detail }) =>
        html`<btrix-popover content=${detail} placement="right">
          <sl-option value=${id}>${label}</sl-option>
        </btrix-popover>`,
    )}`,
  },
};

export const EmptyOption: Story = {
  args: {
    content: html`${[
      {
        id: "",
        label: "None",
      },
      ...data.slice(0, 9),
    ].map(
      ({ id, label }) => html`<sl-option value=${id}>${label}</sl-option>`,
    )}`,
  },
};

export const WithoutItems: Story = {
  args: {},
};

export const AddNewWithItems: Story = {
  args: {
    content: html`<sl-option slot="new-option">Add New</sl-option>
      ${menuItems}`,
  },
};

export const AddNewWithoutItems: Story = {
  args: {
    content: html`<sl-option slot="new-option">Add New</sl-option>`,
  },
};

export const GroupedOptions: Story = {
  args: {
    content: html`<btrix-option-group label="Group 1">
        ${data.slice(0, 3).map(
          ({ id, label, detail }) =>
            html`<btrix-popover content=${detail} placement="right">
              <sl-option value=${id}>${label}</sl-option>
            </btrix-popover> `,
        )}
      </btrix-option-group>
      <sl-divider></sl-divider>
      <btrix-option-group label="Group 2">
        ${data.slice(3, 10).map(
          ({ id, label, detail }) =>
            html`<btrix-popover content=${detail} placement="right">
              <sl-option value=${id}>${label}</sl-option>
            </btrix-popover> `,
        )}
      </btrix-option-group>`,
  },
};

export const ValueWithItems: Story = {
  args: {
    value: data[1].id,
    content: html`${menuItems}`,
  },
};

export const WithHelpText: Story = {
  args: {
    ...ValueWithItems.args,
    helpText: "This is help text.",
  },
};

export const Clearable: Story = {
  args: {
    ...ValueWithItems.args,
    clearable: true,
  },
};

export const ClearableWithEmptyOption: Story = {
  args: {
    content: html`${[
      {
        id: "",
        label: "None",
      },
      ...data.slice(0, 9),
    ].map(
      ({ id, label }) => html`<sl-option value=${id}>${label}</sl-option>`,
    )}`,
    clearable: true,
  },
};

export const Required: Story = {
  args: {
    ...Clearable.args,
    required: true,
  },
};

export const Disabled: Story = {
  args: {
    ...Required.args,
    disabled: true,
  },
};

export const FormControl: Story = {
  decorators: [formDecorator as DecoratorFunction],
  args: {
    ...Required.args,
    defaultValue: Required.args?.value,
  },
};
