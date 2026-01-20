import { msg } from "@lit/localize";

import { APIErrorDetail } from "@/types/api";
import { isApiError, isApiErrorDetail } from "@/utils/api";

export const indexErrorMessageFor = {
  [APIErrorDetail.NoDedupeIndex]: msg("Index does not exist."),
  [APIErrorDetail.DedupeIndexNotReady]: msg(
    "Please wait for collection to finish indexing to continue.",
  ),
  [APIErrorDetail.DedupeIndexInUse]: msg(
    "Please wait for collection to finish indexing to continue.",
  ),
} as const;

export function getIndexErrorMessage(err: unknown) {
  if (isApiError(err) && isApiErrorDetail(err.details)) {
    return (indexErrorMessageFor as Partial<Record<APIErrorDetail, string>>)[
      err.details
    ];
  }
}
