import { html } from "lit";

import { tw } from "@/utils/tailwind";

/**
 * For separatoring text in the same line, e.g. for breadcrumbs or item details
 */
export function textSeparator(colorClass = tw`text-neutral-400`) {
  return html`<span class="${colorClass} font-mono font-thin" role="separator"
    >/</span
  > `;
}
