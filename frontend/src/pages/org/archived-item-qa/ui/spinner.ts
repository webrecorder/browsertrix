import clsx from "clsx";
import { html } from "lit";

export function renderSpinner(className?: clsx.ClassValue) {
  return html`<div
    class=${clsx(
      "flex h-full w-full items-center justify-center p-9 text-2xl",
      className,
    )}
  >
    <sl-spinner></sl-spinner>
  </div>`;
}
