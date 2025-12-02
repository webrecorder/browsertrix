import { html } from "lit";

import { renderLegendColor } from "@/features/meters/utils/legend";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";

export const tooltipRow = (
  title: string,
  value: number,
  highlight = false,
  color?: { primary: string; border: string },
) => html`
  <p class="flex justify-between gap-4">
    <span class=${highlight ? "font-semibold" : ""}
      >${color ? renderLegendColor(color) : null} ${title}</span
    >
    <span
      >${humanizeExecutionSeconds(value, {
        round: "down",
        displaySeconds: true,
      })}</span
    >
  </p>
`;
