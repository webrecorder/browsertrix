import type { Meta, StoryObj } from "@storybook/web-components";
import { delay, http, HttpResponse } from "msw";
import type { DecoratorFunction } from "storybook/internal/types";

import { data } from "./data";
import { renderComponent, type RenderProps } from "./DedupeWorkflows";

import { orgDecorator } from "@/stories/decorators/orgDecorator";
import {
  userDecorator,
  type StorybookUserProps,
} from "@/stories/decorators/userDecorator";
import type { APIPaginatedList } from "@/types/api";
import type { Crawl } from "@/types/crawler";

const meta = {
  title: "Features/Collections/Dedupe Workflows",
  component: "btrix-dedupe-workflows",
  subcomponents: { ItemDependencyTree: "btrix-item-dependency-tree" },
  tags: ["autodocs"],
  decorators: [
    userDecorator as DecoratorFunction,
    orgDecorator as DecoratorFunction,
  ],
  render: renderComponent,
  argTypes: {},
  args: {
    workflows: data.workflows,
    user: true,
    auth: true,
  },
} satisfies Meta<RenderProps & StorybookUserProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const WithCrawls: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get(/\/crawls$/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<Crawl>>({
            total: data.crawls.length,
            items: data.crawls,
            page: 1,
            pageSize: 1000,
          });
        }),
      ],
    },
  },
};

export const WithoutCrawls: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get(/\/crawls$/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<Crawl>>({
            total: 0,
            items: [],
            page: 1,
            pageSize: 1000,
          });
        }),
      ],
    },
  },
};

export const MissingDependency: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get(/\/crawls$/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<Crawl>>({
            total: data.crawls.length,
            items: [
              {
                ...data.crawls[0],
                requiresCrawls: [
                  ...data.crawls[0].requiresCrawls,
                  "item-storybook-id-non-existent",
                ],
              },
              ...data.crawls.slice(1),
            ],
            page: 1,
            pageSize: 1000,
          });
        }),
      ],
    },
  },
};
