import clsx from "clsx";
import { html } from "lit";

import { tw } from "@/utils/tailwind";

export function dashboardHeading(
  content: string,
  { aside, classes }: { aside?: boolean; classes?: string } = {},
) {
  return html`<header class="mb-2">
    <h2
      class=${clsx(
        tw`text-base font-medium leading-6`,
        aside && tw`@5xl:text-sm @5xl:leading-5`,
        classes,
      )}
    >
      ${content}
    </h2>
  </header>`;
}
