import { html, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

export function primaryWithAside(
  primary: TemplateResult,
  aside: TemplateResult,
) {
  return html`<div class="flex flex-col gap-x-10 gap-y-7 @5xl/org:flex-row">
    <div class="flex-1">${primary}</div>
    <aside
      class="${tw`@5xl/org:[&>*:not(:first-child)]:pt-5`} flex flex-col gap-5 @3xl/org:flex-row @3xl/org:*:flex-1 @5xl/org:max-w-[30ch] @5xl/org:flex-col @5xl/org:divide-y @5xl/org:*:flex-none"
    >
      ${aside}
    </aside>
  </div>`;
}
