import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { renderComponent, type RenderProps } from "./FilterChip";

const meta = {
  title: "Components/Filter Chip",
  component: "btrix-filter-chip",
  tags: ["autodocs"],
  decorators: (story) =>
    html` <div class="px-20 py-10 text-center">${story()}</div>`,
  render: renderComponent,
  argTypes: {
    anchor: { table: { disable: true } },
    slottedContent: { table: { disable: true } },
  },
  args: {
    anchor: "Active",
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

/**
 * A filter can be toggled on or off by activating the chip.
 */
export const Basic: Story = {
  args: {},
};

/**
 * A filter can be on by default.
 */
export const Checked: Story = {
  args: {
    checked: true,
  },
};

/**
 * A filter can have multiple options.
 * See `<btrix-workflow-tag-filter>` for a more complex example.
 */
export const SelectFilter: Story = {
  args: {
    selectFromDropdown: true,
    stayOpenOnChange: true,
    anchor: "Status",
    slottedContent: html`
      <div slot="dropdown-content" class="p-3">
        <sl-radio-group label="Filter by Status">
          <sl-radio>Pending</sl-radio>
          <sl-radio>Active</sl-radio>
          <sl-radio>Finished</sl-radio>
        </sl-radio-group>
      </div>
    `,
  },
};
