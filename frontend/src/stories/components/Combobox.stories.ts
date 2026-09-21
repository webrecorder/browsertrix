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
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

const data = Array.from({ length: 100 }).map(() => ({
  id: faker.string.nanoid(),
  label: faker.word.words({ count: { min: 1, max: 5 } }),
}));
const menuItems = data
  .slice(0, 10)
  .map(({ id, label }) => html`<sl-option value=${id}>${label}</sl-option>`);

export const WithItems: Story = {
  args: {
    label: "Label",
    content: html`${menuItems}`,
  },
};

export const WithoutItems: Story = {
  args: {
    label: "Label",
  },
};

export const AddNewWithItems: Story = {
  args: {
    label: "Label",
    content: html`<sl-option slot="new-option">Add New</sl-option>
      ${menuItems}`,
  },
};

export const AddNewWithoutItems: Story = {
  args: {
    label: "Label",
    content: html`<sl-option slot="new-option">Add New</sl-option>`,
  },
};

export const ValueWithItems: Story = {
  args: {
    label: "Label",
    value: data[1].id,
    displayValue: data[1].label,
    content: html`${menuItems}`,
  },
};
