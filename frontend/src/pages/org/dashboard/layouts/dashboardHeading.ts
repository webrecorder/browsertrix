import clsx from "clsx";
import { html } from "lit";

import { tw } from "@/utils/tailwind";

export function dashboardHeading(
  content: string,
  {
    aside,
    leading = true,
    classes,
  }: { aside?: boolean; leading?: boolean; classes?: string } = {},
) {
  return html`<header class="mb-2">
    <h2
      class=${clsx(
        tw`text-base font-medium`,
        leading ? tw`leading-6` : tw`leading-none`,
        aside && tw`@5xl/org:text-sm @5xl/org:leading-5`,
        classes,
      )}
    >
      ${content}
    </h2>
  </header>`;
}
