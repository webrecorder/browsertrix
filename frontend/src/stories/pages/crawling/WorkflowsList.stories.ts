import type { Meta, StoryObj } from "@storybook/web-components";
import { delay, http, HttpResponse } from "msw";
import { type DecoratorFunction } from "storybook/internal/types";

import { renderComponent, type RenderProps } from "./WorkflowsList";

import { type TagCounts } from "@/components/ui/tag-filter/types";
import { orgDecorator } from "@/stories/decorators/orgDecorator";
import {
  userDecorator,
  type StorybookUserProps,
} from "@/stories/decorators/userDecorator";
import { type APIPaginatedList } from "@/types/api";
import { type ListWorkflow } from "@/types/crawler";
import { type WorkflowSearchValues } from "@/types/workflow";

const meta = {
  title: "Pages/Workflows",
  component: "btrix-workflows-list",
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
  http.get(/\/crawlconfigs\/search-values/, async () => {
    await delay(500);
    return HttpResponse.json<WorkflowSearchValues>({
      crawlIds: [],
      names: [],
      firstSeeds: [],
      descriptions: [],
    });
  });
const tagCountsRequest = () =>
  http.get(/\/crawlconfigs\/tagCounts/, async () => {
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
        http.get(/\/crawlconfigs/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<ListWorkflow>>({
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
