import { serialize } from "@shoelace-style/shoelace";
import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { defaultArgs, renderComponent, type RenderProps } from "./DataGrid";

import { GridColumnType } from "@/components/ui/data-grid/types";

const meta = {
  title: "Components/Data Grid",
  component: "btrix-data-grid",
  subcomponents: {
    DataGridRow: "btrix-data-grid-row",
  },
  tags: ["autodocs"],
  render: renderComponent,
  argTypes: {},
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const Basic: Story = {
  args: {},
};

/**
 * The table header can stick to the top of the viewport.
 */
export const StickyHeader: Story = {
  args: {
    stickyHeader: true,
  },
};

/**
 * Rows can be added or removed.
 */
export const EditableRows: Story = {
  args: {
    editRows: true,
  },
};

/**
 * Columns can be made editable.
 */
export const EditableColumns: Story = {
  args: {
    editCells: true,
    items: defaultArgs.items.map((item) => ({
      ...item,
      a: `${(item as Record<string, string>).a} (not editable)`,
    })),
  },
};

/**
 * By default, items are converted to a form value-compatible
 * string with `JSON.stringify`. Pass in a custom converter to
 * modify how the value is formatted (open console logs to view CSV example.)
 */
export const CustomValueConverter: Story = {
  args: {
    editCells: true,
    columns: defaultArgs.columns.map((col) => ({
      ...col,
      editable: true,
    })),
    stringifyItems: (items) =>
      items.map((item) => Object.values(item).join(",")).join("\n"),
  },
  render: (args) => {
    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault();

      const form = e.target as HTMLFormElement;
      const value = serialize(form)["storybook-data-grid"] as string;

      console.log("form value:", value);
    };

    return html`
      <form @submit=${onSubmit}>
        ${renderComponent(args)}
        <sl-button class="mt-3" type="submit" variant="primary">Save</sl-button>
      </form>
    `;
  },
};

/**
 * The entire table can be made editable. When rendered in a form,
 * the table will function like an HTML input element, complete with validation.
 *
 * Open console logs to view the submitted form value.
 */
export const FullFormExample: Story = {
  args: {
    label: "Manual Page QA",
    editCells: true,
    editRows: true,
    columns: [
      {
        field: "url",
        label: "URL",
        editable: true,
        inputType: GridColumnType.URL,
        inputPlaceholder: "Enter URL",
        required: true,
      },
      {
        field: "title",
        label: "Title",
        editable: true,
        inputPlaceholder: "Enter page title",
        required: true,
      },
      {
        field: "selector",
        label: "Heading Selector",
        editable: true,
        inputPlaceholder: "h1",
        renderEditCell({ item }) {
          return html`
            <btrix-syntax-input
              class="flex-1 [--sl-input-border-radius-medium:0] [--sl-input-border-color:transparent]"
              value=${item.selector || ""}
              language="css"
            ></btrix-syntax-input>
          `;
        },
      },
      {
        field: "count",
        label: "Crawl Count",
        editable: true,
        inputType: GridColumnType.Number,
        inputPlaceholder: "Enter count",
      },
      {
        field: "status",
        label: "Status",
        editable: true,
        inputType: GridColumnType.Select,
        renderSelectOptions() {
          return html`
            <sl-option value="Pending">Pending</sl-option>
            <sl-option value="Approved">Approved</sl-option>
          `;
        },
      },
    ],
    items: [
      {
        title: "Title 1",
        selector: "h1",
        count: 2,
        url: "https://example.com/page-1",
        status: "Approved",
      },
      {
        title: "Title 2",
        selector: "div.heading",
        count: 1,
        url: "https://example.com/page-2",
        status: "Pending",
      },
    ],
  },
  render: (args) => {
    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault();

      const form = e.target as HTMLFormElement;
      const value = serialize(form)["storybook-data-grid"] as string;
      console.log("form value:", JSON.parse(value));
    };

    return html`
      <form @submit=${onSubmit}>
        ${renderComponent(args)}
        <sl-button type="submit" variant="primary">Save</sl-button>
      </form>
    `;
  },
};
