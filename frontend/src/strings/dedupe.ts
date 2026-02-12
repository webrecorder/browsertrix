import { msg } from "@lit/localize";

import type { DedupeType } from "@/utils/workflow";

export const dedupeTypeLabelFor: Record<DedupeType, string> = {
  collection: msg("Deduplicate using a collection"),
  none: msg("No deduplication"),
};
