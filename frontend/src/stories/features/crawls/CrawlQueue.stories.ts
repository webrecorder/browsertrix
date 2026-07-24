import type { Meta, StoryObj } from "@storybook/web-components";
import { delay, http, HttpResponse } from "msw";
import type { DecoratorFunction } from "storybook/internal/types";

import { renderComponent, type RenderProps } from "./CrawlQueue";
import { data } from "./data";

import type { ResponseData } from "@/features/archived-items/crawl-queue";
import { orgDecorator } from "@/stories/decorators/orgDecorator";
import {
  userDecorator,
  type StorybookUserProps,
} from "@/stories/decorators/userDecorator";

const meta = {
  title: "Features/Crawls/Crawl Queue",
  component: "btrix-crawl-queue",
  tags: ["autodocs"],
  decorators: [
    userDecorator as DecoratorFunction,
    orgDecorator as DecoratorFunction,
  ],
  render: renderComponent,
  argTypes: {},
  args: {
    crawlId: "storybook-crawl-id",
    user: true,
    auth: true,
  },
} satisfies Meta<RenderProps & StorybookUserProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Basic: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get(/\/queue/, async () => {
          await delay(500);
          return HttpResponse.json<ResponseData>({
            total: data.length,
            results: data,
            matched: [],
          });
        }),
      ],
    },
  },
};

export const WithMatches: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get(/\/queue/, async () => {
          await delay(100);
          return HttpResponse.json<ResponseData>({
            total: data.length,
            results: data,
            matched: data.filter((url) => url.includes(".info/")),
          });
        }),
      ],
    },
  },
};

export const WithExclusions: Story = {
  args: {
    exclusions: [".biz/"],
  },
  parameters: {
    msw: {
      handlers: [
        http.get(/\/queue/, async () => {
          await delay(100);
          return HttpResponse.json<ResponseData>({
            total: data.length,
            results: data,
            matched: [],
          });
        }),
      ],
    },
  },
};

let pollData = data;

export const Polling: Story = {
  args: {
    exclusions: [".biz/"],
  },
  decorators: (story) => {
    // Reset data when navigating away from story
    const pollStartUrl = window.parent.location.href;
    const onNav = () => {
      if (pollStartUrl === window.parent.location.href) return;
      pollData = data;
      navigation.removeEventListener("navigate", onNav);
    };

    navigation.addEventListener("navigate", onNav);

    return story();
  },
  parameters: {
    msw: {
      handlers: [
        http.get(/\/queue/, async () => {
          await delay(100);
          const resp = HttpResponse.json<ResponseData>({
            total: pollData.length,
            results: pollData,
            matched: data.filter((url) => url.includes(".info/")),
          });

          pollData = pollData.slice(1);

          return resp;
        }),
      ],
    },
  },
};

export const Empty: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get(/\/queue/, async () => {
          await delay(100);
          return HttpResponse.json<ResponseData>({
            total: 0,
            results: [],
            matched: [],
          });
        }),
      ],
    },
  },
};
