import { getReasonPhrase } from "http-status-codes";
import { html } from "lit";

import { stringFor } from "@/strings/ui";
import { type ArchivedItemPage } from "@/types/crawler";

export function pageHttpStatusBadge(status: ArchivedItemPage["status"]) {
  if (!status) {
    return html`<btrix-badge variant="neutral" outline
      >${stringFor.unknown}</btrix-badge
    >`;
  }

  return html`<btrix-badge
    variant=${status === 200 ? "success" : "danger"}
    outline
    >${status} ${getReasonPhrase(status)}</btrix-badge
  >`;
}
