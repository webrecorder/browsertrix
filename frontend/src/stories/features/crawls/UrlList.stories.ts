import { faker } from "@faker-js/faker";
import type { Meta, StoryObj } from "@storybook/web-components";
import clsx from "clsx";

import { renderComponent, type RenderProps } from "./UrlList";

import { tw } from "@/utils/tailwind";

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
  title: "Features/Crawls/URL List",
  component: "btrix-url-list",
  tags: ["autodocs"],
  decorators: [],
  render: renderComponent,
  argTypes: {},
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

const webrecorderUrls = [
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
];
export const WithUrls: Story = {
  args: {
    urls: webrecorderUrls,
  },
};

export const Border: Story = {
  args: {
    urls: webrecorderUrls,
    border: true,
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

export const Offset: Story = {
  args: {
    urls: data,
    ordered: true,
    offset: 20,
  },
};

export const OrderedWithBorder: Story = {
  args: {
    urls: data,
    ordered: true,
    border: true,
  },
};

const includeClasses = tw`part-[order-match]:text-success part-[row-match]:[--btrix-row-bg-color:--sl-color-success-100]`;
export const StyleIncludes: Story = {
  args: {
    classes: includeClasses,
    urls: data,
    highlight: true,
    ordered: true,
    border: true,
    includeUrl: (url) => url.includes(".com"),
  },
};

export const StyleExcludes: Story = {
  args: {
    classes: clsx(
      includeClasses,
      tw`part-[order-exclude]:text-danger part-[row-exclude]:[--btrix-row-bg-color:--sl-color-danger-100]`,
    ),
    urls: data,
    highlight: true,
    ordered: true,
    border: true,
    includeUrl: (url) => url.includes(".com"),
    excludeUrl: (url) => url.includes(".biz"),
  },
};

export const SingleItem: Story = {
  args: {
    urls: data.slice(0, 1),
    highlight: true,
  },
};

/**
 * Nothing will be rendered if there are no URLs in the list.
 */
export const Empty: Story = {
  args: {},
};
