import { html } from "lit";

export function renderSpinner() {
  return html`<div
    class="flex h-full w-full items-center justify-center text-2xl"
  >
    <sl-spinner></sl-spinner>
  </div>`;
}
