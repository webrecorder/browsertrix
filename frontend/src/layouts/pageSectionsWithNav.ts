import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

export function pageSectionsWithNav({
  nav,
  main,
  action,
  placement = "start",
  sticky = false,
  stickyTopClassname,
}: {
  nav: TemplateResult;
  main: TemplateResult;
  action?: TemplateResult;
  placement?: "start" | "top";
  sticky?: boolean;
  stickyTopClassname?: string; // e.g. `lg:top-0`
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
          tw`flex w-full flex-1 flex-col gap-2`,
          sticky && [
            tw`z-50 lg:sticky lg:self-start`,
            stickyTopClassname || tw`lg:top-2`,
          ],
          placement === "start"
            ? tw`lg:max-w-[16.5rem]`
            : tw`lg:flex-row lg:items-center`,
        )}
        part="tabs"
      >
        ${nav}
        ${action
          ? html`<div class=${clsx(placement === "top" && tw`lg:ml-auto`)}>
              ${action}
            </div>`
          : nothing}
      </div>
      <div class="flex-1" part="content">${main}</div>
    </div>
  `;
}
