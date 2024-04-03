import { html } from "lit";

import type { BadgeVariant } from "@/components/ui/badge";
// import { tw } from "@/utils/tailwind";
import { severityFromMatch } from "@/features/qa/page-list/helpers";
import { formatPercentage } from "@/features/qa/page-list/ui/page-details";

export function renderSeverityBadge(value: number) {
  if (value === undefined || value === null) {
    return;
  }

  let variant: BadgeVariant = "neutral";
  switch (severityFromMatch(value)) {
    case "severe":
      variant = "danger";
      break;
    case "moderate":
      variant = "warning";
      break;
    case "good":
      variant = "success";
      break;
    default:
      break;
  }

  return html`
    <btrix-badge variant=${variant}>${formatPercentage(value)}%</btrix-badge>
  `;
}
