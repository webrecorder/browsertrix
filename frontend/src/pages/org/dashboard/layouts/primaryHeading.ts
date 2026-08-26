import { html } from "lit";

export function primaryHeading(content: string) {
  return html`<header class="mb-2">
    <h2 class="text-base font-medium leading-6">${content}</h2>
  </header>`;
}
