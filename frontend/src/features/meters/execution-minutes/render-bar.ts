import { html, type TemplateResult } from "lit";

import { tooltipContent } from "@/features/meters/utils/tooltip";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";

export type RenderBarProps = {
  value: number;
  usedSeconds: number;
  quotaSeconds: number;
  totalQuotaSeconds?: number;
  title: string | TemplateResult;
  content?: string | TemplateResult;
  color: string;
  highlight?: "used" | "available" | "totalAvailable";
  availableSeconds?: number;
};

export const renderBar = ({
  value,
  usedSeconds,
  quotaSeconds,
  availableSeconds,
  totalQuotaSeconds = quotaSeconds,
  title,
  content,
  color,
  highlight = "used",
}: RenderBarProps) => {
  if (value === 0) return;
  availableSeconds ??= quotaSeconds;
  return html`<btrix-meter-bar
    .value=${value * 100}
    style="--background-color:var(--sl-color-${color});"
    placement="top"
  >
    ${tooltipContent({
      title,
      value: humanizeExecutionSeconds(
        {
          used: usedSeconds,
          available: availableSeconds,
          totalAvailable: totalQuotaSeconds,
        }[highlight],
        {
          displaySeconds: true,
          round: highlight === "used" ? "up" : "down",
        },
      ),
      content,
    })}
  </btrix-meter-bar>`;
};
