import type { Meta, StoryObj } from "@storybook/web-components";
import { html, type TemplateResult } from "lit";

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

const renderItems = (items: ListArchivedItem[], content?: TemplateResult) =>
  items.map(
    (item) =>
      html`<btrix-archived-item-list-item href="#" .item=${item}>
        ${content}
      </btrix-archived-item-list-item>`,
  );

export const Basic: Story = {
  args: {
    content: renderItems(archivedItemsMock.items as ListArchivedItem[]),
  },
};

export const OverviewMenu: Story = {
  args: {
    content: html`
      <btrix-table-header-cell
        slot="actionCell"
        class="p-0"
      ></btrix-table-header-cell>

      ${renderItems(
        archivedItemsMock.items as ListArchivedItem[],
        html`<btrix-table-cell slot="actionCell" class="p-0">
          <btrix-overflow-dropdown>
            <sl-menu>
              <sl-menu-item>Option 1</sl-menu-item>
              <sl-menu-item>Option 2</sl-menu-item>
              <sl-menu-item>Option 3</sl-menu-item>
            </sl-menu>
          </btrix-overflow-dropdown>
        </btrix-table-cell>`,
      )}
    `,
  },
};
