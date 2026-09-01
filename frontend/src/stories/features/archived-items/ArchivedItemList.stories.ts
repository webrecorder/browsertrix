import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { renderComponent, type RenderProps } from "./ArchivedItemList";

import archivedItemsMock from "@/__mocks__/api/orgs/[id]/all-crawls";
import { type ListArchivedItem } from "@/types/crawler";

const meta = {
  title: "Features/Archived Items/Archived Item List",
  component: "btrix-archived-item-list",
  subcomponents: {
    ArchivedItemListItem: "btrix-archived-item-list-item",
  },
  tags: ["autodocs"],
  decorators: [],
  render: renderComponent,
  argTypes: {},
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

const renderItems = (items: ListArchivedItem[]) =>
  items.map(
    (item) =>
      html`<btrix-archived-item-list-item
        .item=${item}
      ></btrix-archived-item-list-item>`,
  );

export const Viewer: Story = {
  args: {
    content: renderItems(archivedItemsMock.items as ListArchivedItem[]),
  },
};

export const Crawler: Story = {
  args: {
    content: renderItems(archivedItemsMock.items as ListArchivedItem[]),
  },
};
