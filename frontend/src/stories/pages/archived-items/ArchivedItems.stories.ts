import type { Meta, StoryObj } from "@storybook/web-components";
import { delay, http, HttpResponse } from "msw";
import { type DecoratorFunction } from "storybook/internal/types";

import { renderComponent, type RenderProps } from "./ArchivedItems";

import archivedItemsMock from "@/__mocks__/api/orgs/[id]/all-crawls";
import { type TagCounts } from "@/components/ui/tag-filter/types";
import {
  orgDecorator,
  type StorybookOrgProps,
} from "@/stories/decorators/orgDecorator";
import {
  userDecorator,
  type StorybookUserProps,
} from "@/stories/decorators/userDecorator";
import { type APIPaginatedList } from "@/types/api";
import { type ArchivedItemSearchValues } from "@/types/archivedItems";
import { type ListArchivedItem } from "@/types/crawler";

const meta = {
  title: "Pages/Archived Items",
  component: "btrix-archived-items",
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
} satisfies Meta<RenderProps & StorybookUserProps & StorybookOrgProps>;

export default meta;
type Story = StoryObj<RenderProps & StorybookOrgProps>;

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
  http.get(/\/all-crawls\/tagCounts/, async () => {
    await delay(500);
    return HttpResponse.json<TagCounts>({
      tags: [],
    });
  });
const itemReplayRequest = () =>
  http.get(/\/replay\.json/, async () => {
    await delay(500);
    return HttpResponse.json<ListArchivedItem>(
      (archivedItemsMock as APIPaginatedList<ListArchivedItem>).items[0],
    );
  });

export const NoItems: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        searchValuesRequest(),
        tagCountsRequest(),
        http.get(/\/all-crawls/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<ListArchivedItem>>({
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
        itemReplayRequest(),
        http.get(/\/all-crawls/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<ListArchivedItem>>(
            archivedItemsMock as APIPaginatedList<ListArchivedItem>,
          );
        }),
      ],
    },
  },
};

export const Crawler: Story = {
  args: {
    isCrawler: true,
  },
  parameters: {
    msw: {
      handlers: [
        searchValuesRequest(),
        tagCountsRequest(),
        itemReplayRequest(),
        http.get(/\/all-crawls/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<ListArchivedItem>>(
            archivedItemsMock as APIPaginatedList<ListArchivedItem>,
          );
        }),
      ],
    },
  },
};

export const BulkActions: Story = {
  args: {
    isCrawler: true,
    bulkActions: true,
  },
  parameters: {
    msw: {
      handlers: [
        searchValuesRequest(),
        tagCountsRequest(),
        http.get(/\/all-crawls/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<ListArchivedItem>>(
            archivedItemsMock as APIPaginatedList<ListArchivedItem>,
          );
        }),
      ],
    },
  },
};

export const SelectedItems: Story = {
  args: {
    isCrawler: true,
    bulkActions: true,
    selectedItemIds: new Set(
      (archivedItemsMock.items as ListArchivedItem[])
        .slice(0, 2)
        .map(({ id }) => id),
    ),
  },
  parameters: {
    msw: {
      handlers: [
        searchValuesRequest(),
        tagCountsRequest(),
        http.get(/\/all-crawls/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<ListArchivedItem>>(
            archivedItemsMock as APIPaginatedList<ListArchivedItem>,
          );
        }),
      ],
    },
  },
};

export const SelectedItemsWithDependents: Story = {
  args: {
    orgFeatureFlags: {
      dedupeEnabled: true,
    },
    isCrawler: true,
    bulkActions: true,
    selectedItemIds: new Set(
      (archivedItemsMock.items as ListArchivedItem[])
        .slice(2)
        .map(({ id }) => id),
    ),
  },
  parameters: {
    msw: {
      handlers: [
        searchValuesRequest(),
        tagCountsRequest(),
        http.get(/\/all-crawls/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<ListArchivedItem>>(
            archivedItemsMock as APIPaginatedList<ListArchivedItem>,
          );
        }),
      ],
    },
  },
};
