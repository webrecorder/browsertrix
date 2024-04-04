import { html } from "lit";

import { tw } from "@/utils/tailwind";

export function renderSpinner() {
  return html`<div
    class=${tw`flex h-full w-full items-center justify-center p-9 text-2xl`}
  >
    <sl-spinner></sl-spinner>
  </div>`;
}
