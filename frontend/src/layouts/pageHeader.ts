import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";

export function pageTitle(title?: string | TemplateResult) {
  return html`
    <h1 class="min-w-0 text-xl font-semibold leading-8">
      ${title || html`<sl-skeleton class="my-.5 h-5 w-60"></sl-skeleton>`}
    </h1>
  `;
}

export function pageHeader(
  title?: string | TemplateResult,
  suffix?: TemplateResult<1>,
  classNames?: string,
) {
  return html`
    <header
      class=${clsx(
        "mt-5 flex items-end flex-wrap justify-between gap-2 border-b pb-3",
        classNames,
      )}
    >
      ${pageTitle(title)}
      ${suffix
        ? html`<div class="ml-auto flex items-center gap-2">${suffix}</div>`
        : nothing}
    </header>
  `;
}
