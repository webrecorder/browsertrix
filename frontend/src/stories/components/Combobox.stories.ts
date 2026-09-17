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

import { type Combobox } from "@/components/ui/combobox";

// eslint-disable import-x/no-unresolved -- Dev dependency

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

/**
 * If a slotted anchor is provided it should have accessibility attributes such as `aria-autocomplete="list"`.
 */
export const SlottedAnchor: Story = {
  args: {
    content: html`<sl-input
        label="Slotted Label"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="false"
        aria-controls="custom-combobox-list"
        aria-activedescendant="custom-combobox-list-item"
        @sl-focus=${(e: CustomEvent) => {
          (e.target as HTMLElement).closest<Combobox>("btrix-combobox")?.show();
        }}
        @sl-blur=${(e: CustomEvent) => {
          (e.target as HTMLElement).closest<Combobox>("btrix-combobox")?.hide();
        }}
      ></sl-input>
      ${data.slice(0, 10).map(
        ({ id, label }) =>
          html`<sl-menu-item
            slot="menu-item"
            id=${id}
            @mouseover=${
              // HACK Fixes https://github.com/shoelace-style/shoelace/issues/1676
              (e: Event) => e.stopImmediatePropagation()
            }
          >
            ${label}
          </sl-menu-item>`,
      )} `,
  },
};
