import { html, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

export function primaryWithAside(
  primary: TemplateResult,
  aside: TemplateResult,
) {
  return html`<div class="flex flex-col gap-7 xl:flex-row">
    <div class="flex-1">${primary}</div>
    <aside
      class="${tw`[&>*:not(:first-child)]:pt-5`} flex flex-col gap-5 divide-y xl:max-w-[25ch]"
    >
      ${aside}
    </aside>
  </div>`;
}
