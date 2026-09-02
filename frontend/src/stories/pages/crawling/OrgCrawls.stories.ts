import type { Meta, StoryObj } from "@storybook/web-components";
import { delay, http, HttpResponse } from "msw";
import { type DecoratorFunction } from "storybook/internal/types";

import { renderComponent, type RenderProps } from "./OrgCrawls";

import crawlRunsMock from "@/__mocks__/api/orgs/[id]/crawls";
import { type TagCounts } from "@/components/ui/tag-filter/types";
import { orgDecorator } from "@/stories/decorators/orgDecorator";
import {
  userDecorator,
  type StorybookUserProps,
} from "@/stories/decorators/userDecorator";
import { type APIPaginatedList } from "@/types/api";
import { type ArchivedItemSearchValues } from "@/types/archivedItems";
import { type ListCrawl } from "@/types/crawler";

const meta = {
  title: "Pages/Crawl Runs",
  component: "btrix-org-crawls",
  tags: ["autodocs"],
  decorators: [
    userDecorator as DecoratorFunction,
    orgDecorator as DecoratorFunction,
  ],
  render: renderComponent,
  argTypes: {},
  args: {
    user: true,
    auth: true,
  },
} satisfies Meta<RenderProps & StorybookUserProps>;

export default meta;
type Story = StoryObj<RenderProps>;

const searchValuesRequest = () =>
  http.get(/\/all-crawls\/search-values/, async () => {
    await delay(500);
    return HttpResponse.json<ArchivedItemSearchValues>({
      ids: [],
      names: [],
      firstSeeds: [],
      descriptions: [],
    });
  });
const tagCountsRequest = () =>
  http.get(/\/crawls\/tagCounts/, async () => {
    await delay(500);
    return HttpResponse.json<TagCounts>({
      tags: [],
    });
  });

export const NoItems: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        searchValuesRequest(),
        tagCountsRequest(),
        http.get(/\/crawls/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<ListCrawl>>({
            total: 0,
            page: 1,
            pageSize: 20,
            items: [],
          });
        }),
      ],
    },
  },
};

export const WithItems: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        searchValuesRequest(),
        tagCountsRequest(),
        http.get(/\/crawls/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<ListCrawl>>(
            crawlRunsMock as APIPaginatedList<ListCrawl>,
          );
        }),
      ],
    },
  },
};
