import { html, type TemplateResult } from "lit";

export interface TableData {
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
    renderItem: () =>
      html`<btrix-table-cell>
        <sl-icon name="trash3"></sl-icon>
      </btrix-table-cell>`,
  },
};

const rows: {
  data: Omit<Record<keyof typeof columns, unknown>, "remove">;
}[] = [
  {
    data: {
      name: "Alice",
      email: "alice@example.com",
      role: "Admin",
    },
  },
  {
    data: { name: "Bob", email: "bob@example.com", role: "Crawler" },
  },
  {
    data: { name: "Carol", email: "carol@example.com", role: "Crawler" },
  },
  {
    data: { name: "Dave", email: "dave@example.com", role: "Viewer" },
  },
  {
    data: { name: "Eve", email: "eve@example.com", role: "Viewer" },
  },
] satisfies TableData["rows"];

export default { columns, rows };
