import type { Meta, StoryObj } from "@storybook/web-components";
import { delay, http, HttpResponse } from "msw";
import { type DecoratorFunction } from "storybook/internal/types";

import { renderComponent, type RenderProps } from "./BrowserProfilesList";

import browserProfilesMock from "@/__mocks__/api/orgs/[id]/profiles";
import { type TagCounts } from "@/components/ui/tag-filter/types";
import { orgDecorator } from "@/stories/decorators/orgDecorator";
import {
  userDecorator,
  type StorybookUserProps,
} from "@/stories/decorators/userDecorator";
import { type APIPaginatedList } from "@/types/api";
import { type Profile } from "@/types/crawler";
import { type SearchValues } from "@/utils/searchValues";

const meta = {
  title: "Pages/Browser Profiles",
  component: "btrix-browser-profiles-list",
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
  http.get(/\/profiles\/search-values/, async () => {
    await delay(500);
    return HttpResponse.json<SearchValues>({
      names: [],
    });
  });
const tagCountsRequest = () =>
  http.get(/\/profiles\/tagCounts/, async () => {
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
        http.get(/\/profiles/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<Profile>>({
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
        http.get(/\/profiles/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<Profile>>(
            browserProfilesMock as APIPaginatedList<Profile>,
          );
        }),
      ],
    },
  },
};
