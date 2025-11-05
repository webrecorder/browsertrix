import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { panelBody } from "./panel";

import { tw } from "@/utils/tailwind";

export function secondaryHeading({
  heading,
  id,
  srOnly,
}: {
  heading: string | TemplateResult;
  id?: string;
  srOnly?: boolean;
}) {
  return html`<div
    id=${ifDefined(id)}
    class=${clsx(
      tw`mt-1 text-base font-medium leading-none`,
      srOnly && tw`sr-only`,
    )}
  >
    ${heading}
  </div>`;
}

export function secondaryPanel({
  heading,
  body,
  srOnly,
}: {
  heading: string | TemplateResult;
  body?: string | TemplateResult;
  srOnly?: boolean;
}) {
  return panelBody({
    content: html`<section>
      ${secondaryHeading({ id: "cardHeading", heading, srOnly })}
      ${srOnly ? nothing : html`<sl-divider class="my-4"></sl-divider>`}
      <div aria-labelledby="cardHeading">${body}</div>
    </section>`,
  });
}
