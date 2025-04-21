import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import "@/components/ui/table";

import data, { type TableData } from "./Table.data";

export interface RenderProps {
  head?: TemplateResult;
  body?: TemplateResult;
  classes?: string;
}

export const renderHead = ({
  columns,
  classes,
}: {
  columns: TableData["columns"];
  classes?: string;
}) => html`
  <btrix-table-head class=${ifDefined(classes)}>
    ${Object.values(columns).map(
      ({ title, classes }) => html`
        <btrix-table-header-cell class=${ifDefined(classes)}>
          ${title}
        </btrix-table-header-cell>
      `,
    )}
  </btrix-table-head>
`;

export const renderBody = ({
  columns,
  rows,
  classes,
}: TableData & { classes?: string }) => html`
  <btrix-table-body class=${ifDefined(classes)}>
    ${rows.map(
      ({ classes, data }) => html`
        <btrix-table-row class=${ifDefined(classes)}>
          ${Object.entries(columns).map(
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
`;

export const defaultArgs = {
  head: renderHead(data),
  body: renderBody(data),
} satisfies RenderProps;

export const renderTable = ({ head, body, classes }: RenderProps) => {
  return html`<btrix-table class=${ifDefined(classes)}>
    ${head}${body}
  </btrix-table>`;
};
