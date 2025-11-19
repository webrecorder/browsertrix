import clsx from "clsx";
import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { pageHeading } from "./page";

import { tw } from "@/utils/tailwind";

export function panelHeader({
  heading,
  actions,
}: {
  heading: string | Parameters<typeof pageHeading>[0];
  actions?: TemplateResult;
}) {
  return html`
    <header class="mb-3 flex min-h-8 items-center justify-between">
      ${typeof heading === "string"
        ? pageHeading({ content: heading })
        : pageHeading(heading)}
      ${actions}
    </header>
  `;
}

export function panelBody({
  content,
  classNames,
}: {
  content: TemplateResult;
  classNames?: typeof tw | string;
}) {
  return html`<div
    class=${clsx(tw`lg:rounded-lg lg:border lg:p-4`, classNames)}
  >
    ${content}
  </div>`;
}

/**
 * @TODO Refactor components to use panel
 */
export function panel({
  heading,
  actions,
  body,
  id,
  className,
}: {
  body: TemplateResult;
  id?: string;
  className?: string;
} & Parameters<typeof panelHeader>[0]) {
  return html`<section id=${ifDefined(id)} class=${ifDefined(className)}>
    ${panelHeader({ heading, actions })}
    <sl-divider class="mb-4 mt-0 lg:hidden"></sl-divider>
    ${body}
  </section>`;
}
