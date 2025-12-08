import { msg } from "@lit/localize";
import { html, nothing } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { iconFor, labelFor, variantFor } from "@/features/qa/review-status";
import { type ArchivedItem } from "@/types/crawler";
import { isCrawl } from "@/utils/crawler";

export const itemTypeBadge = (itemType: ArchivedItem["type"]) => {
  const upload = itemType === "upload";

  return html`<btrix-badge>
    <sl-icon
      class="mr-1.5"
      name=${upload ? "upload" : "gear-wide-connected"}
      label=${upload ? msg("Upload") : msg("Crawl")}
    ></sl-icon>
    ${upload ? msg("Upload") : msg("Crawl")}</btrix-badge
  >`;
};

const collectionBadge = (inCollection: boolean) =>
  html`<sl-tooltip content=${msg("In Collection")} ?disabled=${!inCollection}>
    <btrix-badge variant=${inCollection ? "cyan" : "neutral"}>
      <sl-icon
        name=${inCollection ? "check-circle" : "dash-circle"}
        class="mr-1.5"
      ></sl-icon>
      ${inCollection ? msg("In Collection") : msg("Not in Collection")}
    </btrix-badge>
  </sl-tooltip>`;

const qaReviewBadge = (reviewStatus: ArchivedItem["reviewStatus"]) => html`
  <sl-tooltip
    content=${ifDefined(reviewStatus ? msg("QA Rating") : undefined)}
    ?disabled=${!reviewStatus}
  >
    <btrix-badge variant=${variantFor(reviewStatus)} ?outline=${!!reviewStatus}>
      <sl-icon
        class="mr-1.5"
        name=${reviewStatus ? iconFor(reviewStatus).name : "clipboard2-data"}
      ></sl-icon>
      ${labelFor(reviewStatus)}</btrix-badge
    >
  </sl-tooltip>
`;

export const badges = (item: ArchivedItem) => {
  return html`<div class="flex flex-wrap gap-3 whitespace-nowrap">
    ${itemTypeBadge(item.type)}
    ${collectionBadge(item.collectionIds.length > 0)}
    ${isCrawl(item)
      ? html`${qaReviewBadge(item.reviewStatus)}
          <btrix-dedupe-badge
            .dependencies=${item.requiresCrawls}
            .dependents=${item.requiredByCrawls}
          ></btrix-dedupe-badge>`
      : nothing}
  </div>`;
};

export const badgesSkeleton = () =>
  html`<sl-skeleton class="h-4 w-12"></sl-skeleton>
    <sl-skeleton class="h-4 w-12"></sl-skeleton>`;
