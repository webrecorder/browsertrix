import { html, type TemplateResult } from "lit";

// import { ifDefined } from "lit/directives/if-defined.js";

import "@/components/ui/table";

export interface RenderProps {
  head?: TemplateResult;
  body?: TemplateResult;
}

const head = html`<btrix-table-head>
  <btrix-table-header-cell>Name</btrix-table-header-cell>
  <btrix-table-header-cell>Email</btrix-table-header-cell>
  <btrix-table-header-cell>Role</btrix-table-header-cell>
  <btrix-table-header-cell>
    <span class="sr-only">Actions</span>
  </btrix-table-header-cell>
</btrix-table-head>`;

const body = html`
  <btrix-table-body>
    <btrix-table-row>
      <btrix-table-cell>Alice</btrix-table-cell>
      <btrix-table-cell>alice@example.com</btrix-table-cell>
      <btrix-table-cell>40</btrix-table-cell>
      <btrix-table-cell>
        <sl-icon name="trash3"></sl-icon>
      </btrix-table-cell>
    </btrix-table-row>
    <btrix-table-row>
      <btrix-table-cell>Bob</btrix-table-cell>
      <btrix-table-cell>bob@example.com</btrix-table-cell>
      <btrix-table-cell>20</btrix-table-cell>
      <btrix-table-cell>
        <sl-icon name="trash3"></sl-icon>
      </btrix-table-cell>
    </btrix-table-row>
  </btrix-table-body>
`;

export const defaultArgs = { head, body } satisfies RenderProps;

export const renderTable = ({ head, body }: RenderProps) => {
  return html` <btrix-table> ${head} ${body} </btrix-table> `;
};
