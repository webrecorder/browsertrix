import { msg } from "@lit/localize";
import { html, nothing } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { ArchivedItem } from "@/types/crawler";
import { isCrawl } from "@/utils/crawler";

export const itemTypeBadge = (itemType: ArchivedItem["type"]) => {
  const upload = itemType === "upload";

  return html`<sl-tooltip
    content=${upload ? msg("Uploaded Item") : msg("Crawled Item")}
  >
    <btrix-badge variant=${upload ? "sky" : "lime"}>
      <sl-icon
        class="mr-1.5"
        name=${upload ? "upload" : "gear-wide-connected"}
      ></sl-icon>
      ${upload ? msg("Upload") : msg("Crawl")}</btrix-badge
    >
  </sl-tooltip>`;
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
  <btrix-popover
    content=${ifDefined(
      reviewStatus ? `${msg("QA Rating")}: ${reviewStatus}` : undefined,
    )}
    ?disabled=${!reviewStatus}
  >
    <btrix-badge variant=${reviewStatus ? "cyan" : "neutral"}>
      <sl-icon class="mr-1.5" name="clipboard2-data"></sl-icon>
      ${reviewStatus ? msg("Reviewed") : msg("No Review")}</btrix-badge
    >
  </btrix-popover>
`;

export const badges = (item: ArchivedItem) => {
  return html`<div class="flex flex-wrap gap-3 whitespace-nowrap">
    ${itemTypeBadge(item.type)}
    ${isCrawl(item)
      ? html` ${qaReviewBadge(item.reviewStatus)}
        ${collectionBadge(item.collectionIds.length > 0)}`
      : nothing}
  </div>`;
};

export const badgesSkeleton = () =>
  html`<sl-skeleton class="h-4 w-12"></sl-skeleton>
    <sl-skeleton class="h-4 w-12"></sl-skeleton>`;
