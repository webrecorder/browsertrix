import type { Meta, StoryObj } from "@storybook/web-components";
import { delay, http, HttpResponse } from "msw";
import { type DecoratorFunction } from "storybook/internal/types";

import { renderComponent, type RenderProps } from "./CollectionsList";

import { orgDecorator } from "@/stories/decorators/orgDecorator";
import {
  userDecorator,
  type StorybookUserProps,
} from "@/stories/decorators/userDecorator";
import { type APIPaginatedList } from "@/types/api";
import { type Collection } from "@/types/collection";

const meta = {
  title: "Pages/Collections",
  component: "btrix-collections-list",
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

export const NoItems: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get(/\/collections/, async () => {
          await delay(500);
          return HttpResponse.json<APIPaginatedList<Collection>>({
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
