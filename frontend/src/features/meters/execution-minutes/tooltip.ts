import clsx from "clsx";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { renderLegendColor } from "@/features/meters/utils/legend";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";
import { tw } from "@/utils/tailwind";

export const tooltipRow = (
  title: string,
  value: number,
  highlight = false,
  color?: { primary: string; border: string },
) => html`
  <p
    class=${clsx(
      tw`flex justify-between gap-4`,
      highlight &&
        tw`-mx-1.5 rounded bg-white px-1.5 shadow-sm ring-1 ring-stone-800/5`,
    )}
  >
    <span class=${ifDefined(highlight ? tw`font-semibold` : undefined)}
      >${color ? renderLegendColor(color) : null}${title}</span
    >
    <span
      >${humanizeExecutionSeconds(value, {
        round: "down",
        displaySeconds: true,
      })}</span
    >
  </p>
`;
