import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import { pageNav, pageTitle } from "./pageHeader";

import { tw } from "@/utils/tailwind";

type Content = string | TemplateResult | typeof nothing;

export function pageHeading({
  content,
  level = 2,
}: {
  content?: string | TemplateResult | typeof nothing;
  level?: 2 | 3 | 4;
}) {
  const tag = unsafeStatic(`h${level}`);
  const classNames = tw`min-w-0 text-lg font-medium leading-8`;

  return staticHtml`
    <${tag} class=${classNames}>
      ${
        content ||
        html`<sl-skeleton class="my-.5 h-5 w-60" effect="sheen"></sl-skeleton>`
      }
    </${tag}>
  `;
}

// TODO consolidate with pageHeader.ts https://github.com/webrecorder/browsertrix/issues/2197
export function pageHeader({
  title,
  prefix,
  suffix,
  secondary,
  actions,
  border = true,
  classNames,
}: {
  title?: Content;
  prefix?: Content;
  suffix?: Content;
  secondary?: Content;
  actions?: Content;
  border?: boolean;
  classNames?: typeof tw;
}) {
  return html`
    <header
      class=${clsx(
        tw`mt-5 flex flex-col items-end gap-3 lg:flex-row lg:items-start`,
        border && tw`border-b pb-3`,
        classNames,
      )}
    >
      <div class="flex flex-1 flex-col gap-2">
        <div class="flex flex-wrap items-center gap-2.5">
          ${prefix}${pageTitle(title)}${suffix}
        </div>
        ${secondary}
      </div>

      ${actions
        ? html`<div class="ml-auto flex flex-shrink-0 items-center gap-2">
            ${actions}
          </div>`
        : nothing}
    </header>
  `;
}

export function page(
  header: Parameters<typeof pageHeader>[0] & {
    breadcrumbs?: Parameters<typeof pageNav>[0];
  },
  render: () => TemplateResult,
) {
  return html`<btrix-document-title
      title=${ifDefined(
        (typeof header.title === "string" && header.title) || undefined,
      )}
    ></btrix-document-title>

    <div
      class="mx-auto box-border flex min-h-full w-full max-w-screen-desktop flex-1 flex-col gap-3 p-3 lg:px-10"
    >
      ${header.breadcrumbs ? html` ${pageNav(header.breadcrumbs)} ` : nothing}
      ${pageHeader(header)}
      <main class="flex flex-1 flex-col">${render()}</main>
    </div>`;
}
