import { html, type TemplateResult } from "lit";

import { pageHeading } from "./page";

export function panelHeader({
  heading,
  actions,
}: {
  heading: string | Parameters<typeof pageHeading>[0];
  actions?: TemplateResult;
}) {
  return html`
    <header class="mb-3 flex min-h-8 items-baseline justify-between">
      ${typeof heading === "string"
        ? pageHeading({ content: heading })
        : pageHeading(heading)}
      ${actions}
    </header>
  `;
}

export function panelBody({ content }: { content: TemplateResult }) {
  return html`<div class="lg:rounded-lg lg:border lg:p-4">${content}</div>`;
}

/**
 * @TODO Refactor components to use panel
 */
export function panel({
  content,
  heading,
  actions,
}: {
  content: TemplateResult;
} & Parameters<typeof panelHeader>[0]) {
  return html`<section>
    ${panelHeader({ heading, actions })} ${content}
  </section>`;
}
