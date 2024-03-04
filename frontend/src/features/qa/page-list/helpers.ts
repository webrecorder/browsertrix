import { tw } from "@/utils/tailwind";
import { html } from "lit";
import { clsx } from "clsx";

export type Severity = "severe" | "moderate" | "good" | null;

export const severityFromMatch = (
  match: number | undefined | null,
): Severity => {
  if (match == null) return null;
  // TODO extract configs for match thresholds
  if (match < 50) return "severe";
  if (match < 90) return "moderate";
  return "good";
};

export const severityFromResourceCounts = (
  bad: number | undefined,
  good: number | undefined,
): Severity => {
  if (bad == null || good == null) return null;
  // TODO extract configs for resource count thresholds
  const total = bad + good;
  if (bad > 10 || bad / total > 0.5) return "severe";
  if (bad > 0) return "moderate";
  return "good";
};

export const crawlCounts = (
  bad: number | undefined | null,
  good: number | undefined | null,
) => {
  if (bad == null || good == null) return null;
  return `${good}/${good + bad}`;
};

export const severityIcon = (severity: Severity, classList?: string) => {
  const baseClasses = tw`h-4 w-4`;
  switch (severity) {
    case "severe":
      return html`<sl-icon
        name="exclamation-triangle-fill"
        class=${clsx("text-red-600", baseClasses, classList)}
      ></sl-icon>`;
    case "moderate":
      return html`<sl-icon
        name="dash-square-fill"
        class=${clsx("text-yellow-600", baseClasses, classList)}
      ></sl-icon>`;
    case "good":
      return html`<sl-icon
        name="check-circle-fill"
        class=${clsx("text-green-600", baseClasses, classList)}
      ></sl-icon>`;
    default:
      return html`<sl-icon
        name="dash-circle"
        class=${clsx("text-gray-600", baseClasses, classList)}
      ></sl-icon>`;
  }
};
