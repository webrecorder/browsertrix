import { faker } from "@faker-js/faker";
import type { Meta, StoryObj } from "@storybook/web-components";

import { renderComponent, type RenderProps } from "./UrlList";

// Fixed seed for reproducibility
faker.seed(0);

const data = Array.from({ length: 95 }).map(
  () =>
    `${faker.internet.url({ appendSlash: true })}${
      // FIXME Replace workaround with `urlPath`
      // https://github.com/faker-js/faker/issues/3790
      faker.word.words({ count: { min: 0, max: 15 } }).replace(/\s/g, "/")
    }`,
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

export const WithUrls: Story = {
  args: {
    urls: [
      "https://webrecorder.net/",
      "https://webrecorder.net/resources/",
      "https://webrecorder.net/resources/what-is-web-archiving/",
      "https://webrecorder.net/resources/glossary/",
      "https://forum.webrecorder.net/",
      "https://github.com/webrecorder/",
      "https://specs.webrecorder.net/wacz/1.1.1/",
      "https://specs.webrecorder.net/wacz-auth/0.1.0/",
      "https://specs.webrecorder.net/cdxj/0.1.0/",
      "https://specs.webrecorder.net/use-cases/0.1.0/",
      "https://specs.webrecorder.net/wacz-ipfs/latest/",
      "https://docs.google.com/presentation/d/1UwXDOcRA8zg5CExXru9o_Ml6oQZxThkA_neQ8PrlpOI/edit?usp=sharing",
      "https://docs.google.com/presentation/d/12jLMPYpLR3s7Ucq2Hf_n4qOzjzv7pZrOgEN69VPq0jY/edit?usp=sharing",
    ],
  },
};

export const WithManyUrls: Story = {
  args: {
    urls: data,
  },
};

export const Highlighted: Story = {
  args: {
    urls: data,
    highlight: true,
  },
};

export const Ordered: Story = {
  args: {
    urls: data,
    ordered: true,
  },
};
