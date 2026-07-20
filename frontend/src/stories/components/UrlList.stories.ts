import { faker } from "@faker-js/faker";
import type { Meta, StoryObj } from "@storybook/web-components";

import { renderComponent, type RenderProps } from "./UrlList";

// Fixed seed for reproducibility
faker.seed(0);
const data = Array.from({ length: 95 }).map(
  () =>
    `${faker.internet.url({ appendSlash: true })}${faker.word.words({ count: { min: 0, max: 20 } }).replace(/\s/g, "/")}`,
);

const meta = {
  title: "Components/URL List",
  component: "btrix-url-list",
  tags: ["autodocs"],
  decorators: [],
  render: renderComponent,
  argTypes: {},
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

/**
 * Nothing will be rendered if there are no URLs in the list.
 */
export const Empty: Story = {
  args: {},
};

export const WithData: Story = {
  args: {
    urls: data.slice(0, 20),
  },
};
