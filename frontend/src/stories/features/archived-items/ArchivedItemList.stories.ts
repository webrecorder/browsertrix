import type { Meta, StoryObj } from "@storybook/web-components";
import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { renderComponent, type RenderProps } from "./ArchivedItemList";

import archivedItemsMock from "@/__mocks__/api/orgs/[id]/all-crawls";
import { type ArchivedItemListItem } from "@/features/archived-items/archived-item-list/archived-item-list-item";
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

const renderItems = (
  items: ListArchivedItem[],
  props?: Partial<ArchivedItemListItem> & { content?: TemplateResult },
) =>
  items.map(
    (item) =>
      html`<btrix-archived-item-list-item
        .item=${item}
        href=${ifDefined(props?.href)}
        ?checkbox=${props?.checkbox}
      >
        ${props?.content}
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

      ${renderItems(archivedItemsMock.items as ListArchivedItem[], {
        href: "#",
        content: html`<btrix-table-cell slot="actionCell" class="p-0">
          <btrix-overflow-dropdown>
            <sl-menu>
              <sl-menu-item>Option 1</sl-menu-item>
              <sl-menu-item>Option 2</sl-menu-item>
              <sl-menu-item>Option 3</sl-menu-item>
            </sl-menu>
          </btrix-overflow-dropdown>
        </btrix-table-cell>`,
      })}
    `,
  },
};

export const Checkbox: Story = {
  args: {
    content: html`
      <btrix-table-header-cell
        slot="checkboxCell"
        class="pr-1.5"
      ></btrix-table-header-cell>
      <btrix-table-header-cell
        slot="actionCell"
        class="p-0"
      ></btrix-table-header-cell>

      ${renderItems(archivedItemsMock.items as ListArchivedItem[], {
        href: "#",
        checkbox: true,
        content: html`<btrix-table-cell slot="actionCell" class="p-0">
          <btrix-overflow-dropdown>
            <sl-menu>
              <sl-menu-item>Option 1</sl-menu-item>
              <sl-menu-item>Option 2</sl-menu-item>
              <sl-menu-item>Option 3</sl-menu-item>
            </sl-menu>
          </btrix-overflow-dropdown>
        </btrix-table-cell>`,
      })}
    `,
  },
};
