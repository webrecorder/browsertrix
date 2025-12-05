import clsx from "clsx";
import { html } from "lit";

import { renderLegendColor } from "@/features/meters/utils/legend";
import localize from "@/utils/localize";
import { tw } from "@/utils/tailwind";

export const tooltipRow = (
  title: string,
  value: number,
  highlight = false,
  color?: { primary: string; border: string },
) => html`
  <p
    class=${clsx(
      "flex justify-between gap-4",
      highlight &&
        tw`-mx-1.5 rounded bg-white px-1.5 shadow-sm ring-1 ring-stone-800/5`,
    )}
  >
    <span class=${highlight ? "font-semibold" : ""}
      >${color ? renderLegendColor(color) : null}${title}</span
    >
    <span>${localize.bytes(value)}</span>
  </p>
`;
