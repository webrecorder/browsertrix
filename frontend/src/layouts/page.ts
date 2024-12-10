import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import { pageTitle } from "./pageHeader";

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
function pageHeader({
  title,
  suffix,
  secondary,
  actions,
  classNames,
}: {
  title: Content;
  suffix?: Content;
  secondary?: Content;
  actions?: Content;
  classNames?: typeof tw;
}) {
  return html`
    <header class=${clsx("mt-5 flex flex-col gap-3 border-b pb-3", classNames)}>
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div>${pageTitle(title)} ${suffix}</div>
        ${actions
          ? html`<div class="ml-auto flex items-center gap-2">${actions}</div>`
          : nothing}
      </div>
      ${secondary}
    </header>
  `;
}

export function page(
  header: Parameters<typeof pageHeader>[0],
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
      ${pageHeader(header)}
      <main class="flex-1">${render()}</main>
    </div>`;
}
