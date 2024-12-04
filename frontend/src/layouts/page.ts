import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { pageTitle } from "./pageHeader";

import type { tw } from "@/utils/tailwind";

type Content = string | TemplateResult | typeof nothing;

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
      title=${ifDefined(typeof header.title === "string" && header.title)}
    ></btrix-document-title>

    <div
      class="mx-auto box-border flex min-h-full w-full max-w-screen-2xl flex-1 flex-col gap-3 p-3 lg:px-10"
    >
      ${pageHeader(header)}
      <main class="flex-1">${render()}</main>
    </div>`;
}
