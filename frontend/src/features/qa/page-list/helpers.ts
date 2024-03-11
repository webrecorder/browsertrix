import { tw } from "@/utils/tailwind";
import { html } from "lit";
import { clsx } from "clsx";
import type { ArchivedItemPage } from "@/types/crawler";
import { cached } from "@/utils/weakCache";

export type Severity = "severe" | "moderate" | "good" | null;
export type SortBy = "screenshotMatch" | "textMatch"; // TODO add resource counts

export const composeWithRunId = <T>(
  fn: (page: ArchivedItemPage, runId: string) => T,
  runId: string,
) => {
  return (page: ArchivedItemPage) => fn(page, runId);
};

export const severityFromMatch = cached(
  (match: number | undefined | null): Severity => {
    if (match == null) return null;
    // TODO extract configs for match thresholds
    if (match < 50) return "severe";
    if (match < 90) return "moderate";
    return "good";
  },
);

export const severityFromResourceCounts = cached(
  (bad: number | undefined, good: number | undefined): Severity => {
    if (bad == null || good == null) return null;
    // TODO extract configs for resource count thresholds
    const total = bad + good;
    if (bad > 10 || bad / total > 0.5) return "severe";
    if (bad > 0) return "moderate";
    return "good";
  },
);

export const crawlCounts = cached(
  (bad: number | undefined | null, good: number | undefined | null) => {
    if (bad == null || good == null) return null;
    return `${good}/${good + bad}`;
  },
);

export const severityIcon = cached((severity: Severity, classList?: string) => {
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
});

export const issueCounts = cached((page: ArchivedItemPage, runId: string) => {
  const severities = [
    severityFromMatch(page.screenshotMatch?.[runId]),
    severityFromMatch(page.textMatch?.[runId]),
    severityFromResourceCounts(
      page.resourceCounts?.[runId]?.crawlBad,
      page.resourceCounts?.[runId]?.crawlGood,
    ),
    severityFromResourceCounts(
      page.resourceCounts?.[runId]?.replayBad,
      page.resourceCounts?.[runId]?.replayGood,
    ),
  ];
  let severe = 0,
    moderate = 0;
  for (const severity of severities) {
    if (severity === "severe") {
      severe++;
    } else if (severity === "moderate") {
      moderate++;
    }
  }
  return { severe, moderate };
});

export const maxSeverity = cached(
  (page: ArchivedItemPage, runId: string): NonNullable<Severity> => {
    const { severe, moderate } = issueCounts(page, runId);
    if (severe > 0) return "severe";
    if (moderate > 0) return "moderate";
    return "good";
  },
);
