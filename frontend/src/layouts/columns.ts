/**
 * Render helpers for 2-column form layout with info text
 */
import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

export type Cols = [TemplateResult<1>, TemplateResult | string | undefined][];

// TODO Revisit, maybe configure with Cols?
const singleLineFromControls = ["sl-checkbox", "sl-switch"];

export function inputCol(content: TemplateResult<1>) {
  return html`
    <div class="col-span-5 self-baseline md:col-span-3">${content}</div>
  `;
}

export function infoCol(content: TemplateResult | string, topPadding: string) {
  return html`
    <div
      class=${clsx(
        tw`col-span-5 flex items-start gap-2 text-neutral-500 md:col-span-2`,
        topPadding,
      )}
    >
      <sl-icon
        class="block h-4 w-4 flex-shrink-0 text-base"
        name="info-circle"
      ></sl-icon>
      <div class="-mt-0.5 text-pretty text-xs leading-5">${content}</div>
    </div>
  `;
}

export function columns(cols: Cols) {
  return html`
    <div class="grid grid-cols-5 gap-5">
      ${cols.map(([main, info]) => {
        const singleLineFormControl = new RegExp(
          `<(${singleLineFromControls.join("|")})`,
        ).test(main.strings[0].trim());

        return html`
          <div class=${tw`col-span-5 self-baseline md:col-span-3`}>${main}</div>
          ${info
            ? infoCol(info, singleLineFormControl ? tw`md:pt-1` : tw`md:pt-8`)
            : nothing}
        `;
      })}
    </div>
  `;
}
