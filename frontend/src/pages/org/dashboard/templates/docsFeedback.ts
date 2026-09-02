import { msg } from "@lit/localize";
import { html } from "lit";

export function docsFeedback(email: string) {
  return html` <section
    class="flex flex-col gap-3 text-neutral-700 @5xl/org:text-xs @5xl/org:leading-normal"
  >
    <p class="font-medium leading-none">
      ${msg("Can‘t find a specific guide?")}
    </p>
    <p class="max-w-[30ch] text-pretty">
      ${msg("Let us know what you‘re looking for and how we can help.")}
    </p>
    <div>
      <sl-button
        class="@5xl/org:[--sl-input-height-small:1.5rem] part-[label]:font-medium @5xl/org:part-[label]:[font-size:--sl-font-size-x-small]"
        size="small"
        href="mailto:${email}"
      >
        <sl-icon slot="prefix" name="envelope"></sl-icon>
        ${msg("Contact Us")}</sl-button
      >
    </div>
  </section>`;
}
