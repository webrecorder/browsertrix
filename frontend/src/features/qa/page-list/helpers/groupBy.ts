import type { ArchivedItemPage } from "@/types/crawler";
import { cached } from "@/utils/weakCache";
import type { OrderBy } from "..";
import { remainder } from "../..";
import type { Severity } from ".";
import { severityFromMatch } from "./severity";

export const groupBy = cached(
  (
    page: ArchivedItemPage,
    runId: string,
    order: OrderBy,
  ): NonNullable<Severity> | typeof remainder => {
    switch (order.field) {
      case "screenshotMatch":
        return severityFromMatch(page.screenshotMatch?.[runId]) ?? remainder;
      case "textMatch":
        return severityFromMatch(page.textMatch?.[runId]) ?? remainder;
      default:
        return remainder;
    }
  },
);