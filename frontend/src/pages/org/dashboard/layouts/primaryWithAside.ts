import { html, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

export function primaryWithAside(
  primary: TemplateResult,
  aside: TemplateResult,
) {
  return html`<div class="flex flex-col gap-x-10 gap-y-7 @5xl/org:flex-row">
    <div class="flex-1">${primary}</div>
    <div class="@5xl/org:max-w-[30ch]">
      <aside
        class="${tw`@5xl/org:[&>*:not(:first-child)]:pt-5`} grid grid-cols-3 gap-x-3 gap-y-7 *:col-span-full @3xl/org:*:col-span-1 @5xl/org:divide-y @5xl/org:*:col-span-full"
      >
        ${aside}
      </aside>
    </div>
  </div>`;
}
