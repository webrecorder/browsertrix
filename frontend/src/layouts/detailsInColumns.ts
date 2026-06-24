/**
 * For details used in columns layout
 */

import { msg } from "@lit/localize";
import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";

import { colSpanClasses, gridColsClasses, infoCol, inputCol } from "./columns";

import type { Details } from "@/components/ui/details";
import { tw } from "@/utils/tailwind";

const containerClass = "details-container";

export function detailsInColumns({
  title,
  main,
  info,
  open,
}: {
  title: TemplateResult | string;
  main: TemplateResult<1>;
  info?: TemplateResult | string;
  open?: boolean;
}) {
  return html`<div
    class=${clsx(containerClass, colSpanClasses, gridColsClasses)}
  >
    <btrix-details
      class=${clsx(colSpanClasses, tw`peer md:col-span-3`)}
      ?open=${open}
    >
      <span slot="title">${title}</span>
      ${inputCol(main)}
    </btrix-details>

    ${info
      ? infoCol(
          html`
            <div class="flex gap-1.5">
              <p class="line-clamp-1">${info}</p>
              <button
                type="button"
                class="whitespace-nowrap underline hover:no-underline"
                @click=${(e: MouseEvent) => {
                  const el = e.target as HTMLButtonElement;

                  el.closest(`.${containerClass}`)
                    ?.querySelector<Details>("btrix-details")
                    ?.show();
                }}
              >
                ${msg("More")}
              </button>
            </div>
          `,
          tw`peer-open:md:pt-[2rem] peer-open:[&_button]:hidden [&_p]:line-clamp-1 peer-open:[&_p]:line-clamp-none`,
        )
      : nothing}
  </div>`;
}
