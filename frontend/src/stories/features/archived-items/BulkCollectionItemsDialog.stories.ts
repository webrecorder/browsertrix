import type { Meta, StoryObj } from "@storybook/web-components";
import { delay, http, HttpResponse } from "msw";
import { type DecoratorFunction } from "storybook/internal/types";

import { renderComponent, type RenderProps } from "./BulkCollectionItemsDialog";

import collectionsMock from "@/__mocks__/api/collections";
import archivedItemsMock from "@/__mocks__/api/orgs/[id]/all-crawls";
import {
  orgDecorator,
  type StorybookOrgProps,
} from "@/stories/decorators/orgDecorator";
import {
  userDecorator,
  type StorybookUserProps,
} from "@/stories/decorators/userDecorator";
import { type APIPaginatedList } from "@/types/api";
import { type Collection } from "@/types/collection";
import { type ListArchivedItem } from "@/types/crawler";

const meta = {
  title: "Features/Archived Items/Bulk Collection Items Dialog",
  component: "btrix-bulk-collection-items-dialog",
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
    open: true,
  },
} satisfies Meta<RenderProps & StorybookUserProps & StorybookOrgProps>;

export default meta;
type Story = StoryObj<RenderProps>;

const postRequests = () => [
  http.post(/\/collections$/, async () => {
    await delay(500);
    return HttpResponse.json<Collection>(collectionMock as Collection);
  }),
  http.post(/\/add$/, async () => {
    await delay(500);
    return HttpResponse.json({ updated: true });
  }),
];

export const WithItems: Story = {
  args: {
    items: (
      archivedItemsMock as APIPaginatedList<ListArchivedItem>
    ).items.slice(0, 3),
  },
  parameters: {
    msw: {
      handlers: [...postRequests()],
    },
  },
};

const collectionMock = collectionsMock.items[0];

export const CollectionSelected: Story = {
  args: {
    ...WithItems.args,
    collectionId: collectionMock.id,
  },
  parameters: {
    msw: {
      handlers: [
        ...postRequests(),
        http.get(/\/collections\/fake-/, async () => {
          await delay(500);
          return HttpResponse.json<Collection>(collectionMock as Collection);
        }),
        http.get(/\/collections\?name=/, async () => {
          await delay(500);
          return HttpResponse.json<Collection>(collectionMock as Collection);
        }),
      ],
    },
  },
};

export const NewCollectionSelected: Story = {
  args: {
    ...WithItems.args,
    newCollectionName: "Fake Collection Name",
  },
  parameters: {
    msw: {
      handlers: [...postRequests()],
    },
  },
};

export const NewCollectionCreateError: Story = {
  args: {
    ...WithItems.args,
    newCollectionName: "Fake Collection Name",
  },
  parameters: {
    msw: {
      handlers: [
        http.post(/\/collections$/, async () => {
          await delay(500);
          return new HttpResponse(null, { status: 500 });
        }),
      ],
    },
  },
};

export const NewCollectionAddError: Story = {
  args: {
    ...WithItems.args,
    newCollectionName: "Fake Collection Name",
  },
  parameters: {
    msw: {
      handlers: [
        http.post(/\/collections$/, async () => {
          await delay(500);
          return HttpResponse.json<Collection>(collectionMock as Collection);
        }),
        http.post(/\/add$/, async () => {
          await delay(500);
          return new HttpResponse(null, { status: 404 });
        }),
      ],
    },
  },
};
