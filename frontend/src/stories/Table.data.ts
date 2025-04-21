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

export const columns = {
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
};

export const rows: {
  data: Omit<Record<keyof typeof columns, unknown>, "remove">;
}[] = [
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
] satisfies TableData["rows"];
