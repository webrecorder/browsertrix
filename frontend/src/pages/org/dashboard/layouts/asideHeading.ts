import { html } from "lit";

export function asideHeading(content: string) {
  return html`<header class="mb-2">
    <h2 class="text-sm font-medium leading-5">${content}</h2>
  </header>`;
}
