import { type OrderBy } from "../page-list";

import { approvalFromPage, type ReviewStatus } from "./reviewStatus";
import { severityFromMatch, type Severity } from "./severity";

import { remainder } from "@/components/utils/grouped-list";
import type { ArchivedItemPage } from "@/types/crawler";
import { cached } from "@/utils/weakCache";

export const groupBy = cached(
  (
    page: ArchivedItemPage,
    runId: string,
    order: OrderBy,
  ): Extract<Severity | ReviewStatus, string> | typeof remainder => {
    switch (order.field) {
      case "screenshotMatch":
        return severityFromMatch(page.screenshotMatch?.[runId]) ?? remainder;
      case "textMatch":
        return severityFromMatch(page.textMatch?.[runId]) ?? remainder;
      case "approved":
        return approvalFromPage(page) ?? remainder;
      default:
        return remainder;
    }
  },
);
