import type { Meta, StoryObj } from "@storybook/web-components";

import { renderComponent, type RenderProps } from "./BulkDeleteItemsDialog";

import archivedItemsMock from "@/__mocks__/api/orgs/[id]/all-crawls";
import { type APIPaginatedList } from "@/types/api";
import { type ListArchivedItem } from "@/types/crawler";

const meta = {
  title: "Features/Archived Items/Bulk Delete Items Dialog",
  component: "btrix-bulk-delete-items-dialog",
  tags: ["autodocs"],
  decorators: [],
  render: renderComponent,
  argTypes: {},
  args: {
    open: true,
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const WithItems: Story = {
  args: {
    items: (
      archivedItemsMock as APIPaginatedList<ListArchivedItem>
    ).items.slice(0, 3),
  },
};

export const ItemsWithDependencies: Story = {
  args: {
    items: (archivedItemsMock as APIPaginatedList<ListArchivedItem>).items,
  },
};

export const OnlyDependencies: Story = {
  args: {
    items: (
      archivedItemsMock as APIPaginatedList<ListArchivedItem>
    ).items.filter((item) => item.requiresCrawls.length),
  },
};
