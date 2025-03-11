import { html } from "lit";

/**
 * For separatoring text in the same line, e.g. for breadcrumbs or item details
 */
export function textSeparator() {
  return html`<span
    class="font-mono font-thin text-neutral-400"
    role="separator"
    >/</span
  > `;
}
