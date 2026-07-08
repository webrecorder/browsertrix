/**
 * For details used in columns layout
 */
import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";

import { colSpanClasses, gridColsClasses, infoCol, inputCol } from "./columns";

import { tw } from "@/utils/tailwind";

const containerClass = "details-container";

export function detailsInColumns({
  title,
  main,
  description,
  info,
  open,
  showWhenOpen,
}: {
  title: TemplateResult | string;
  main: TemplateResult<1>;
  description?: TemplateResult | string;
  info?: TemplateResult | string;
  open?: boolean;
  showWhenOpen?: TemplateResult;
}) {
  return html`<div
    class=${clsx(containerClass, colSpanClasses, gridColsClasses, tw`grid`)}
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
          description
            ? html`<span>${description}</span>
                <p>${info}</p>`
            : info,
          tw`peer-open:md:pt-[2rem] [&>div>p]:hidden peer-open:[&>div>p]:block peer-open:[&>div>span]:hidden`,
        )
      : nothing}
    ${showWhenOpen
      ? html`<div
          class=${clsx(
            colSpanClasses,
            gridColsClasses,
            tw`hidden peer-open:grid`,
          )}
        >
          ${showWhenOpen}
        </div>`
      : nothing}
  </div>`;
}
