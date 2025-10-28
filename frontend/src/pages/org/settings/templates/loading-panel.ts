import { html } from "lit";

export const loadingPanel = () => {
  return html`<div class="flex justify-center rounded border p-5 text-xl">
    <sl-spinner></sl-spinner>
  </div>`;
};
