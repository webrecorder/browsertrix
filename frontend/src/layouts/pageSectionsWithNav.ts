import clsx from "clsx";
import { html, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

export function pageSectionsWithNav({
  nav,
  main,
  placement = "start",
  sticky = false,
}: {
  nav: TemplateResult;
  main: TemplateResult;
  placement?: "start" | "top";
  sticky?: boolean;
}) {
  return html`
    <div
      class=${clsx(
        tw`flex flex-col`,
        placement === "start" && tw`gap-8 lg:flex-row`,
      )}
    >
      <div
        class=${clsx(
          tw`flex flex-1 flex-col gap-2`,
          sticky && tw`lg:sticky lg:top-2 lg:self-start`,
          placement === "start" ? tw`lg:max-w-[16.5rem]` : tw`lg:flex-row`,
        )}
      >
        ${nav}
      </div>
      <div class="flex-1">${main}</div>
    </div>
  `;
}
