import { msg } from "@lit/localize";
import { html } from "lit";

export function docsFeedback(email: string) {
  return html` <section class="flex flex-col gap-3 text-xs text-neutral-700">
    <p class="font-medium leading-none">
      ${msg("Can‘t find a specific guide?")}
    </p>
    <p>${msg("Let us know what you‘re looking for and how we can help.")}</p>
    <div>
      <sl-button
        class="[--sl-input-height-small:1.5rem] part-[label]:font-medium part-[label]:[font-size:--sl-font-size-x-small]"
        size="small"
        href="mailto:${email}"
      >
        <sl-icon slot="prefix" name="envelope"></sl-icon>
        ${msg("Contact Us")}</sl-button
      >
    </div>
  </section>`;
}
