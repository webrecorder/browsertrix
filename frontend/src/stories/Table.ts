import type { Meta, StoryObj } from "@storybook/web-components";
import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { Table as TableComponent } from "@/components/ui/table/table";

import "@/components/ui/table";

const columns = {
  name: {
    title: "Name",
  },
  email: {
    title: "Email",
  },
  role: {
    title: "Role",
  },
  remove: {
    title: html`<span class="sr-only">Remove</span>`,
    renderItem: () => html`<sl-icon name="trash3"></sl-icon>`,
  },
} satisfies RenderProps["columns"];
const rows: { data: Omit<Record<keyof typeof columns, unknown>, "remove"> }[] =
  [
    {
      data: {
        name: "Alice",
        email: "alice@example.com",
        role: 40,
      },
    },
    {
      data: { name: "Bob", email: "bob@example.com", role: 20 },
    },
  ] satisfies RenderProps["rows"];

export interface RenderProps {
  columns: Record<
    string,
    {
      title: string | TemplateResult;
      classes?: string;
      renderItem?: (data: Record<string, unknown>) => TemplateResult;
    }
  >;
  rows: {
    data: Record<string, unknown>;
    classes?: string;
  }[];
}

export const defaultArgs = { columns, rows } satisfies RenderProps;

export const renderTable = ({ columns: headers, rows: items }: RenderProps) => {
  return html`
    <btrix-table>
      <btrix-table-head>
        ${Object.values(headers).map(
          ({ title, classes }) => html`
            <btrix-table-header-cell class=${ifDefined(classes)}>
              ${title}
            </btrix-table-header-cell>
          `,
        )}
      </btrix-table-head>
      <btrix-table-body>
        ${items.map(
          ({ classes, data }) => html`
            <btrix-table-row class=${ifDefined(classes)}>
              ${Object.entries(headers).map(
                ([key, { renderItem }]) => html`
                  <btrix-table-cell class=${ifDefined(classes)}>
                    ${renderItem ? renderItem(data) : data[key]}
                  </btrix-table-cell>
                `,
              )}
            </btrix-table-row>
          `,
        )}
      </btrix-table-body>
    </btrix-table>
  `;
};
