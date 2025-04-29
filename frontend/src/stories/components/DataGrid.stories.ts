import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { repeat } from "lit/directives/repeat.js";

import { defaultArgs, renderComponent, type RenderProps } from "./DataGrid";
import {
  dataGridDecorator,
  formControlName,
} from "./decorators/dataGridDecorator";

import { DataGridRowsController } from "@/components/ui/data-grid/controllers/rows";
import { GridColumnType } from "@/components/ui/data-grid/types";

const meta = {
  title: "Components/Data Grid",
  component: "btrix-data-grid",
  subcomponents: {
    DataGridRow: "btrix-data-grid-row",
    DataGridCell: "btrix-data-grid-cell",
  },
  tags: ["autodocs"],
  render: renderComponent,
  argTypes: {},
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

/**
 * In its most basic configuration, the only required fields
 * are a list of items, and a list of columns that define which
 * key-value pairs of an item should be displayed.
 */
export const Basic: Story = {
  args: {},
};

/**
 * The table header can stick to the top of the containing element.
 */
export const StickyHeader: Story = {
  args: {
    stickyHeader: true,
  },
};

/**
 * Table header cells can convey additional information in a tooltip.
 */
export const HeaderTooltip: Story = {
  args: {
    columns: [
      {
        ...defaultArgs.columns[0],
        description: "This is a description of 'A'",
      },
      {
        ...defaultArgs.columns[1],
        description: "This is a description of 'B'",
      },
      ...defaultArgs.columns.slice(2),
    ],
  },
};

const colWidths = ["200px", "10em", "min-content", "auto", "1fr"];

/**
 * Columns can have specified widths set to any `grid-template-columns`
 * [track list value](https://developer.mozilla.org/en-US/docs/Web/CSS/grid-template-columns#syntax).
 */
export const ColumnWidths: Story = {
  args: {
    columns: defaultArgs.columns.map((col, i) => ({
      ...col,
      width: colWidths[i],
    })),
  },
};

/**
 * Rows can be added or removed, with an optional default item for new rows.
 */
export const EditRows: Story = {
  args: {
    editRows: true,
    defaultItem: {
      a: "A",
      b: "--",
      c: "--",
      d: "--",
      e: "--",
    },
  },
};

/**
 * Cells can be editable.
 */
export const EditCells: Story = {
  args: {
    editCells: true,
    columns: defaultArgs.columns.map((col) => ({
      ...col,
      width: "1fr",
    })),
    items: defaultArgs.items.map((item) => ({
      ...item,
      a: `${(item as Record<string, string>).a} (not editable)`,
    })),
  },
};

/**
 * The data grid can become a group of form controls, complete with validation.
 *
 * The caveat is that in order for the outer form to recognize the rows as form
 * controls, row components must be slotted into the `rows` slot of the grid
 * component. Each row must have the same `name` attribute in order to be
 * serialized as the same form control.
 *
 * A few helpers are included to make managing rows easier:
 * - `DataGridController` to add and remove slotted rows
 * - `serializeDeep` to parse form values
 *
 * Open console logs to view the form value submitted in this example.
 */
export const FormControl: Story = {
  args: {
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
              name="selector"
              class="flex-1 [--sl-input-border-color:transparent] [--sl-input-border-radius-medium:0]"
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
  decorators: [dataGridDecorator],
  render: (args, context) => {
    const rows =
      context.rowsController instanceof DataGridRowsController
        ? context.rowsController.rows
        : new Map();

    return html`
      <btrix-data-grid
        .columns=${args.columns}
        .rowsController=${
          // `rowsController` context is added by `dataGridDecorator`
          context.rowsController
        }
        formControlLabel="Page QA Table"
        stickyHeader
        editRows
        editCells
      >
        ${repeat(
          rows,
          ([id]) => id,
          ([id, item]) => html`
            <btrix-data-grid-row
              slot="rows"
              name="${formControlName}"
              key=${id}
              .item=${item}
            ></btrix-data-grid-row>
          `,
        )}
      </btrix-data-grid>
    `;
  },
};
