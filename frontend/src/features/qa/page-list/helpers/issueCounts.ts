import {
  severityFromMatch,
  severityFromResourceCounts,
  type Severity,
} from "./severity";

import type { ArchivedItemPage } from "@/types/crawler";
import { cached } from "@/utils/weakCache";

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
  return {
    severe,
    moderate,
    noData: severities.every((value) => value === null),
  };
});

export const maxSeverity = cached(
  (page: ArchivedItemPage, runId: string): Severity => {
    const { severe, moderate, noData } = issueCounts(page, runId);
    if (noData) return null;
    if (severe) {
      return "severe";
    } else if (moderate) {
      return "moderate";
    }
    return "good";
  },
);
