import { tw } from "@/utils/tailwind";
import { cached } from "@/utils/weakCache";

export type Severity = "severe" | "moderate" | "good" | null;

export const severityFromMatch = cached(
  (match: number | undefined | null): Severity => {
    if (match == null) return null;
    // TODO extract configs for match thresholds
    if (match < 0.5) return "severe";
    if (match < 0.9) return "moderate";
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

export const textColorFromSeverity = cached((severity: Severity) => {
  switch (severity) {
    case "good":
      return tw`text-green-600`;
    case "moderate":
      return tw`text-yellow-500`;
    case "severe":
      return tw`text-red-500`;
    default:
      return "";
  }
});
