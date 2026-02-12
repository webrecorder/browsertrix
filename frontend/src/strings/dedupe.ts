import { msg } from "@lit/localize";

import type { FormState } from "@/utils/workflow";

export const dedupeTypeLabelFor: Record<FormState["dedupeType"], string> = {
  collection: msg("Deduplicate using a collection"),
  none: msg("No deduplication"),
};
