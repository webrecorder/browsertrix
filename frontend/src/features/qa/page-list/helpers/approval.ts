import { msg } from "@lit/localize";

import type { ArchivedItemPage } from "@/types/crawler";
import { cached } from "@/utils/weakCache";

export type ReviewStatus = "approved" | "rejected" | "commentOnly" | null;

export const approvalFromPage = cached(
  (page: ArchivedItemPage): ReviewStatus =>
    page.approved == null
      ? page.notes?.length
        ? "commentOnly"
        : null
      : page.approved
        ? "approved"
        : "rejected",
);

export const labelFor = cached((status: ReviewStatus) => {
  switch (status) {
    // Approval
    case "approved":
      return msg("Approved");
    case "rejected":
      return msg("Rejected");
    case "commentOnly":
      return msg("Comments Only");

    // No data
    default:
      return;
  }
});
