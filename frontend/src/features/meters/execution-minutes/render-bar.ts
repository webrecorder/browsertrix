import { msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";
import { when } from "lit/directives/when.js";

import { tooltipContent } from "@/features/meters/utils/tooltip";
import { renderPercentage } from "@/strings/numbers";
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
  const used = humanizeExecutionSeconds(usedSeconds, {
    displaySeconds: true,
  });
  const available = humanizeExecutionSeconds(availableSeconds, {
    displaySeconds: true,
  });
  const usedOrAvailable = highlight === "used" ? msg("used") : msg("available");
  const percentageOfUsed = renderPercentage(
    totalQuotaSeconds === 0 || value === 0
      ? 0
      : usedSeconds / totalQuotaSeconds,
  );
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
      content: when(
        usedSeconds !== 0,
        () => html`
          ${content ??
          html` <p>${msg(html`${used} of ${available} ${usedOrAvailable}`)}</p>
            <p>
              ${msg(html`${percentageOfUsed} of all remaining execution time`)}
            </p>`}
        `,
      ),
    })}
  </btrix-meter-bar>`;
};
