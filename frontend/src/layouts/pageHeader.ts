import type { SlBreadcrumb } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { NavigateController } from "@/controllers/navigate";

export type Breadcrumb = {
  href?: string;
  content?: string | TemplateResult;
};

function navigateBreadcrumb(e: MouseEvent, href: string) {
  e.preventDefault();

  const el = e.target as SlBreadcrumb;
  const evt = NavigateController.createNavigateEvent({
    url: href,
    resetScroll: true,
  });

  el.dispatchEvent(evt);
}

export function pageBreadcrumbs(breadcrumbs: Breadcrumb[]) {
  return html`
    <sl-breadcrumb>
      ${breadcrumbs.map(
        ({ href, content }) => html`
          <sl-breadcrumb-item
            href=${ifDefined(href)}
            @click=${href
              ? (e: MouseEvent) => navigateBreadcrumb(e, href)
              : undefined}
          >
            ${content || html`<sl-skeleton class="w-48"></sl-skeleton>`}
          </sl-breadcrumb-item>
        `,
      )}
    </sl-breadcrumb>
  `;
}

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
