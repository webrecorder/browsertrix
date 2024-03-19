import type { OrderBy } from "..";

import { severityFromMatch } from "./severity";

import type { Severity } from ".";

import { remainder } from "@/components/utils/grouped-list";
import type { ArchivedItemPage } from "@/types/crawler";
import { cached } from "@/utils/weakCache";

export const groupBy = cached(
  (
    page: ArchivedItemPage,
    runId: string,
    order: OrderBy,
  ): NonNullable<Severity> | boolean | typeof remainder => {
    switch (order.field) {
      case "screenshotMatch":
        return severityFromMatch(page.screenshotMatch?.[runId]) ?? remainder;
      case "textMatch":
        return severityFromMatch(page.textMatch?.[runId]) ?? remainder;
      case "approved":
        return page.approved ?? remainder;
      default:
        return remainder;
    }
  },
);
